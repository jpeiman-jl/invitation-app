import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

const baseEnvironment = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://invitehub:invitehub@localhost:5432/invitehub",
  REDIS_URL: "redis://localhost:6379",
  WEB_ORIGIN: "http://localhost:3000",
  API_ORIGIN: "http://localhost:4000",
  SESSION_SECRET: "test-session-secret-with-at-least-thirty-two-characters",
  INVITATION_TOKEN_ENCRYPTION_KEY: "test-invitation-encryption-key-long-enough"
};

describe("Stripe configuration", () => {
  it("requires the Stripe secret and webhook signing secret together", () => {
    expect(() => loadConfig({
      ...baseEnvironment,
      STRIPE_SECRET_KEY: "sk_test_key"
    })).toThrow(/must be set together/);
    expect(() => loadConfig({
      ...baseEnvironment,
      STRIPE_WEBHOOK_SECRET: "whsec_test"
    })).toThrow(/must be set together/);
  });

  it("accepts valid key formats and seeded plan limits", () => {
    const config = loadConfig({
      ...baseEnvironment,
      STRIPE_SECRET_KEY: "sk_test_key",
      STRIPE_WEBHOOK_SECRET: "whsec_test",
      FREE_GUEST_LIMIT: "40",
      CUSTOM_DESIGN_PRICE_CENTS: "6200"
    });

    expect(config.FREE_GUEST_LIMIT).toBe(40);
    expect(config.CUSTOM_DESIGN_PRICE_CENTS).toBe(6200);
  });
});
