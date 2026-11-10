import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import Stripe from "stripe";
import type { FastifyInstance } from "fastify";
import type { EmailQueue } from "./email.js";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

describe("API application", () => {
  const prisma = new PrismaClient();
  const emailQueue: EmailQueue = {
    async enqueue() {},
    async close() {}
  };
  const config = loadConfig({
    NODE_ENV: "test",
    PORT: "4000",
    HOST: "127.0.0.1",
    DATABASE_URL: "postgresql://invitehub:invitehub@localhost:5432/invitehub",
    REDIS_URL: "redis://localhost:6379",
    WEB_ORIGIN: "http://localhost:3000",
    API_ORIGIN: "http://localhost:4000",
    SESSION_SECRET: "test-session-secret-with-at-least-thirty-two-characters",
    INVITATION_TOKEN_ENCRYPTION_KEY: "test-invitation-encryption-key-long-enough",
    STRIPE_SECRET_KEY: "sk_test_invitehub_test_key",
    STRIPE_WEBHOOK_SECRET: "whsec_invitehub_test_secret",
    LOG_LEVEL: "silent",
    SWAGGER_ENABLED: "true"
  });
  let app: FastifyInstance | undefined;

  beforeAll(async () => {
    app = await createApp({ config, prisma, emailQueue, stripe: new Stripe("sk_test_invitehub_test_key") });
    await app.ready();
  });

  const getApp = (): FastifyInstance => {
    if (!app) {
      throw new Error("Test application was not initialized");
    }
    return app;
  };

  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  it("serves health checks and sets a CSRF cookie", async () => {
    const response = await getApp().inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
    expect(response.headers["set-cookie"]).toContain("invitehub_csrf=");
    const cookieToken = /invitehub_csrf=([^;]+)/.exec(String(response.headers["set-cookie"]))?.[1];
    expect(response.headers["x-csrf-token"]).toBe(cookieToken);
  });

  it("allows normal bursts of API requests under the global rate limit", async () => {
    const responses = await Promise.all(
      Array.from({ length: 121 }, () => getApp().inject({ method: "GET", url: "/health" }))
    );
    expect(responses.every((response) => response.statusCode === 200)).toBe(true);
  });

  it("rejects state-changing requests without a matching CSRF token", async () => {
    const response = await getApp().inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "host@example.com", password: "example-password" }
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe("CSRF_INVALID");
  });

  it("requires authentication before reading an event seating plan", async () => {
    const response = await getApp().inject({
      method: "GET",
      url: "/api/v1/events/00000000-0000-4000-8000-000000000001/seating"
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().code).toBe("AUTH_REQUIRED");
  });

  it("verifies webhook signatures without requiring a browser CSRF token", async () => {
    const response = await getApp().inject({
      method: "POST",
      url: "/api/v1/billing/webhook",
      headers: {
        "content-type": "application/json",
        "stripe-signature": "t=1,v1=invalid"
      },
      payload: JSON.stringify({ id: "evt_invalid", type: "ignored.event", data: { object: {} } })
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("WEBHOOK_SIGNATURE_INVALID");
  });

  it("exposes the versioned API through OpenAPI", async () => {
    const response = await getApp().inject({ method: "GET", url: "/documentation/json" });
    expect(response.statusCode).toBe(200);
    expect(response.json().paths["/api/v1/events"]).toBeDefined();
    expect(response.json().paths["/api/v1/public/invitations/{token}/rsvp"]).toBeDefined();
    expect(response.json().paths["/api/v1/events/{eventId}/tables"]).toBeDefined();
    expect(response.json().paths["/api/v1/events/{eventId}/tables/{tableId}/assignments"]).toBeDefined();
    expect(response.json().paths["/api/v1/events/{eventId}/seating/auto-assign"]).toBeDefined();
    expect(response.json().paths["/api/v1/events/{eventId}/checkout"]).toBeDefined();
    expect(response.json().paths["/api/v1/billing/webhook"]).toBeDefined();
  });
});
