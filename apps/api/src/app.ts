import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import rawBody from "fastify-raw-body";
import type Stripe from "stripe";
import type { PrismaClient } from "@prisma/client";
import { ZodError } from "zod";
import type { EmailQueue } from "./email.js";
import type { AppConfig } from "./config.js";
import { HttpError } from "./errors.js";
import { registerAuth } from "./auth.js";
import { registerEventRoutes } from "./routes/events.js";
import { registerGuestRoutes } from "./routes/guests.js";
import { registerPublicRoutes } from "./routes/public.js";
import { registerSeatingRoutes } from "./routes/seating.js";
import { registerBillingRoutes } from "./routes/billing.js";

const GLOBAL_RATE_LIMIT_MAX = 300;

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
    emailQueue: EmailQueue;
    stripe: Stripe | null;
  }
}

export interface AppDependencies {
  config: AppConfig;
  prisma: PrismaClient;
  emailQueue: EmailQueue;
  stripe?: Stripe | null;
}

export async function createApp(dependencies: AppDependencies): Promise<FastifyInstance> {
  const { config } = dependencies;
  const app = Fastify({
    logger: { level: config.LOG_LEVEL },
    trustProxy: config.TRUST_PROXY?.split(",").map((address) => address.trim()).filter(Boolean) ?? false,
    bodyLimit: 2_200_000
  });

  app.decorate("prisma", dependencies.prisma);
  app.decorate("emailQueue", dependencies.emailQueue);
  app.decorate("stripe", dependencies.stripe ?? null);
  await app.register(cookie, { secret: config.SESSION_SECRET });
  await app.register(rawBody, {
    field: "rawBody",
    global: false,
    encoding: false,
    runFirst: true
  });
  await app.register(cors, {
    origin: config.WEB_ORIGIN,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["content-type", "x-csrf-token"],
    exposedHeaders: ["x-csrf-token"]
  });
  await app.register(rateLimit, {
    global: true,
    max: GLOBAL_RATE_LIMIT_MAX,
    timeWindow: "1 minute",
    errorResponseBuilder: () => ({
      statusCode: 429,
      error: "Too Many Requests",
      message: "Rate limit exceeded",
      code: "RATE_LIMITED"
    })
  });

  if (config.SWAGGER_ENABLED) {
    await app.register(swagger, {
      openapi: {
        info: { title: "InviteHub API", version: "1.0.0" },
        servers: [{ url: config.API_ORIGIN }],
        tags: [
          { name: "auth" },
          { name: "events" },
          { name: "guests" },
          { name: "invitations" },
          { name: "rsvp" },
          { name: "seating" },
          { name: "billing" }
        ]
      }
    });
    await app.register(swaggerUi, { routePrefix: "/documentation" });
  }

  app.addHook("onRoute", (route) => {
    if (!route.url.startsWith("/api/v1/")) {
      return;
    }
    const tag = route.url.includes("/auth/")
      ? "auth"
      : route.url.includes("/public/")
        ? "rsvp"
        : route.url.includes("/invitations/")
          ? "invitations"
          : route.url.includes("/seating") || route.url.includes("/tables") || route.url.includes("/assignments")
            ? "seating"
            : route.url.includes("/billing")
              ? "billing"
            : route.url.includes("/guests")
              ? "guests"
              : "events";
    const pathParams = [...route.url.matchAll(/:([A-Za-z][A-Za-z0-9_]*)/g)].map((match) => match[1]);
    const params = pathParams.length > 0
      ? {
          type: "object",
          required: pathParams,
          properties: Object.fromEntries(pathParams.map((name) => [name, {
            type: "string",
            ...(name === "eventId" || name === "guestId" ? { format: "uuid" } : {}),
            ...(name === "token" ? { pattern: "^[a-fA-F0-9]{64}$" } : {})
          }]))
        }
      : undefined;
    route.schema = {
      ...route.schema,
      tags: route.schema?.tags ?? [tag],
      summary: route.schema?.summary ?? `${route.method} ${route.url}`,
      ...(params && !route.schema?.params ? { params } : {})
    };
  });

  app.get("/health", async () => ({ status: "ok" }));
  await registerAuth(app, config);
  await registerEventRoutes(app);
  await registerGuestRoutes(app, config);
  await registerSeatingRoutes(app);
  await registerBillingRoutes(app, config);
  await registerPublicRoutes(app);

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      return reply.code(error.statusCode).send({
        error: error.message,
        code: error.code
      });
    }

    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: "Request validation failed",
        code: "VALIDATION_FAILED",
        issues: error.issues.map(({ path, message, code }) => ({ path, message, code }))
      });
    }

    if ("statusCode" in error && typeof error.statusCode === "number" && error.statusCode < 500) {
      return reply.code(error.statusCode).send({
        error: error.message,
        code: error.statusCode === 413 ? "PAYLOAD_TOO_LARGE" : "BAD_REQUEST"
      });
    }

    request.log.error({ err: error }, "Unhandled request error");
    return reply.code(500).send({
      error: "An unexpected error occurred",
      code: "INTERNAL_ERROR"
    });
  });

  return app;
}
