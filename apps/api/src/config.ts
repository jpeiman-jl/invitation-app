import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { z } from "zod";

dotenv.config({
  path: [
    fileURLToPath(new URL("../../../.env", import.meta.url)),
    fileURLToPath(new URL("../.env", import.meta.url))
  ]
});

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().default("0.0.0.0"),
  TRUST_PROXY: z.preprocess((value) => value === "" ? undefined : value, z.string().optional()),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().url(),
  WEB_ORIGIN: z.string().url(),
  API_ORIGIN: z.string().url(),
  SESSION_SECRET: z.string().min(32),
  SESSION_COOKIE_NAME: z.string().default("invitehub_session"),
  INVITATION_TOKEN_ENCRYPTION_KEY: z.string().min(1),
  GOOGLE_CLIENT_ID: z.preprocess((value) => value === "" ? undefined : value, z.string().optional()),
  GOOGLE_CLIENT_SECRET: z.preprocess((value) => value === "" ? undefined : value, z.string().optional()),
  RESEND_API_KEY: z.preprocess((value) => value === "" ? undefined : value, z.string().optional()),
  EMAIL_FROM: z.preprocess((value) => value === "" ? undefined : value, z.string().email().optional()),
  STRIPE_SECRET_KEY: z.preprocess((value) => value === "" ? undefined : value, z.string().startsWith("sk_").optional()),
  STRIPE_WEBHOOK_SECRET: z.preprocess((value) => value === "" ? undefined : value, z.string().startsWith("whsec_").optional()),
  FREE_GUEST_LIMIT: z.coerce.number().int().positive().default(50),
  FREE_ACTIVE_EVENT_LIMIT: z.coerce.number().int().positive().default(1),
  CUSTOM_DESIGN_PRICE_CENTS: z.coerce.number().int().positive().default(4900),
  CUSTOM_DESIGN_GUEST_LIMIT: z.coerce.number().int().positive().default(500),
  CUSTOM_DESIGN_ACTIVE_EVENT_LIMIT: z.coerce.number().int().positive().default(1),
  CUSTOM_DESIGN_MAX_GENERATIONS: z.coerce.number().int().positive().default(5),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  SWAGGER_ENABLED: z.enum(["true", "false"]).default("true").transform((value) => value === "true")
}).superRefine((env, context) => {
  const hasGoogleClientId = Boolean(env.GOOGLE_CLIENT_ID);
  const hasGoogleClientSecret = Boolean(env.GOOGLE_CLIENT_SECRET);
  if (hasGoogleClientId !== hasGoogleClientSecret) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["GOOGLE_CLIENT_ID"],
      message: "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together"
    });
  }

  if (env.NODE_ENV === "production" && (!env.RESEND_API_KEY || !env.EMAIL_FROM)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["RESEND_API_KEY"],
      message: "RESEND_API_KEY and EMAIL_FROM are required in production"
    });
  }
  if (Boolean(env.STRIPE_SECRET_KEY) !== Boolean(env.STRIPE_WEBHOOK_SECRET)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["STRIPE_WEBHOOK_SECRET"],
      message: "STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET must be set together"
    });
  }
  if (env.NODE_ENV === "production" && (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["STRIPE_SECRET_KEY"],
      message: "Stripe secret and webhook keys are required in production"
    });
  }
  if (env.NODE_ENV === "production" &&
      (!env.WEB_ORIGIN.startsWith("https://") || !env.API_ORIGIN.startsWith("https://"))) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["WEB_ORIGIN"],
      message: "WEB_ORIGIN and API_ORIGIN must use HTTPS in production"
    });
  }
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
  }

  if (parsed.data.INVITATION_TOKEN_ENCRYPTION_KEY.length < 32) {
    throw new Error("INVITATION_TOKEN_ENCRYPTION_KEY must be at least 32 characters");
  }

  return parsed.data;
}
