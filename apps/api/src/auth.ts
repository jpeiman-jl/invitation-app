import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Prisma } from "@prisma/client";
import { loginSchema, registerSchema } from "@invitehub/shared";
import type { AppConfig } from "./config.js";
import { HttpError } from "./errors.js";
import { generateOpaqueToken, hashPassword, verifyPassword } from "./security.js";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const GOOGLE_STATE_COOKIE = "invitehub_google_state";
const GOOGLE_VERIFIER_COOKIE = "invitehub_google_verifier";

declare module "fastify" {
  interface FastifyRequest {
    userId: string | null;
  }
}

export async function registerAuth(app: FastifyInstance, config: AppConfig): Promise<void> {
  app.decorateRequest("userId", null);

  app.addHook("onRequest", async (request, reply) => {
    if (request.url === "/api/v1/billing/webhook") {
      return;
    }
    if (!request.cookies.invitehub_csrf) {
      request.cookies.invitehub_csrf = randomBytes(32).toString("hex");
      reply.setCookie("invitehub_csrf", request.cookies.invitehub_csrf, {
        httpOnly: false,
        secure: config.NODE_ENV === "production",
        sameSite: "strict",
        path: "/"
      });
    }
    reply.header("x-csrf-token", request.cookies.invitehub_csrf);

    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      const csrfCookie = request.cookies.invitehub_csrf;
      const csrfHeader = request.headers["x-csrf-token"];
      if (!csrfCookie || typeof csrfHeader !== "string" || csrfHeader !== csrfCookie) {
        throw new HttpError(403, "CSRF token is missing or invalid", "CSRF_INVALID");
      }
    }
  });

  app.addHook("preHandler", async (request) => {
    const signedCookie = request.cookies[config.SESSION_COOKIE_NAME];
    if (!signedCookie) {
      return;
    }
    const unsigned = request.unsignCookie(signedCookie);
    if (!unsigned.valid || !unsigned.value) {
      return;
    }
    const tokenHash = createHash("sha256").update(unsigned.value).digest("hex");
    const session = await app.prisma.authSession.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() }
      },
      select: { userId: true }
    });
    request.userId = session?.userId ?? null;
  });

  app.post("/api/v1/auth/register", {
    config: { rateLimit: { max: 6, timeWindow: "15 minutes" } }
  }, async (request, reply) => {
    const input = registerSchema.parse(request.body);
    const email = input.email.toLowerCase();
    const passwordHash = await hashPassword(input.password);
    const user = await app.prisma.user.create({
        data: { email, passwordHash, name: input.name },
        select: { id: true, email: true, name: true, createdAt: true }
      }).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new HttpError(409, "An account with this email already exists", "EMAIL_ALREADY_EXISTS");
      }
      throw error;
    });
    await createSession(app, reply, config, user.id);
    return reply.code(201).send({ user });
  });

  app.post("/api/v1/auth/login", {
    config: { rateLimit: { max: 6, timeWindow: "15 minutes" } }
  }, async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const user = await app.prisma.user.findUnique({
      where: { email: input.email.toLowerCase() }
    });
    if (!user?.passwordHash || !(await verifyPassword(input.password, user.passwordHash))) {
      throw new HttpError(401, "Email or password is incorrect", "INVALID_CREDENTIALS");
    }
    await createSession(app, reply, config, user.id);
    return { user: { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt } };
  });

  app.post("/api/v1/auth/logout", async (request, reply) => {
    await requireUser(request);
    const signedCookie = request.cookies[config.SESSION_COOKIE_NAME];
    if (signedCookie) {
      const unsigned = request.unsignCookie(signedCookie);
      if (unsigned.valid && unsigned.value) {
        const tokenHash = createHash("sha256").update(unsigned.value).digest("hex");
        await app.prisma.authSession.updateMany({
          where: { tokenHash, revokedAt: null },
          data: { revokedAt: new Date() }
        });
      }
    }
    reply.clearCookie(config.SESSION_COOKIE_NAME, { path: "/" });
    return reply.code(204).send();
  });

  app.get("/api/v1/auth/me", async (request) => {
    const userId = await requireUser(request);
    const user = await app.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, createdAt: true }
    });
    if (!user) {
      throw new HttpError(401, "Authentication required", "AUTH_REQUIRED");
    }
    return { user };
  });

  app.get("/api/v1/auth/google", async (_request, reply) => {
    if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET) {
      throw new HttpError(404, "Google sign-in is not configured", "GOOGLE_OAUTH_DISABLED");
    }
    const state = randomBytes(32).toString("hex");
    const verifier = generateOpaqueToken();
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    reply.setCookie(GOOGLE_STATE_COOKIE, state, {
      httpOnly: true,
      secure: config.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/v1/auth/google",
      maxAge: 600
    });
    reply.setCookie(GOOGLE_VERIFIER_COOKIE, verifier, {
      httpOnly: true,
      secure: config.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/v1/auth/google",
      maxAge: 600
    });
    const authorization = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authorization.search = new URLSearchParams({
      client_id: config.GOOGLE_CLIENT_ID,
      redirect_uri: new URL("/api/v1/auth/google/callback", config.API_ORIGIN).toString(),
      response_type: "code",
      scope: "openid email profile",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256"
    }).toString();
    return reply.redirect(authorization.toString());
  });

  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>("/api/v1/auth/google/callback", async (request, reply) => {
    if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET) {
      throw new HttpError(404, "Google sign-in is not configured", "GOOGLE_OAUTH_DISABLED");
    }
    const query = request.query;
    const stateCookie = request.cookies[GOOGLE_STATE_COOKIE];
    const verifierCookie = request.cookies[GOOGLE_VERIFIER_COOKIE];
    reply.clearCookie(GOOGLE_STATE_COOKIE, { path: "/api/v1/auth/google" });
    reply.clearCookie(GOOGLE_VERIFIER_COOKIE, { path: "/api/v1/auth/google" });
    if (query.error || !query.code || !query.state || !stateCookie || !verifierCookie || query.state !== stateCookie) {
      throw new HttpError(400, "Google sign-in could not be verified", "GOOGLE_OAUTH_INVALID_STATE");
    }

    const tokenResponse = await fetchGoogle("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: query.code,
        client_id: config.GOOGLE_CLIENT_ID,
        client_secret: config.GOOGLE_CLIENT_SECRET,
        redirect_uri: new URL("/api/v1/auth/google/callback", config.API_ORIGIN).toString(),
        grant_type: "authorization_code",
        code_verifier: verifierCookie
      })
    }, "GOOGLE_TOKEN_EXCHANGE_FAILED");
    if (!tokenResponse.ok) {
      throw new HttpError(502, "Google token exchange failed", "GOOGLE_TOKEN_EXCHANGE_FAILED");
    }
    const tokenData = await tokenResponse.json() as { access_token?: string };
    if (!tokenData.access_token) {
      throw new HttpError(502, "Google did not return an access token", "GOOGLE_TOKEN_MISSING");
    }
    const profileResponse = await fetchGoogle("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { authorization: `Bearer ${tokenData.access_token}` }
    }, "GOOGLE_PROFILE_FAILED");
    if (!profileResponse.ok) {
      throw new HttpError(502, "Google profile lookup failed", "GOOGLE_PROFILE_FAILED");
    }
    const profile = await profileResponse.json() as {
      sub?: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
    };
    if (!profile.sub || !profile.email || !profile.email_verified) {
      throw new HttpError(401, "Google account does not have a verified email", "GOOGLE_EMAIL_UNVERIFIED");
    }

    const providerAccountId = profile.sub;
    const email = profile.email.toLowerCase();
    const identity = await app.prisma.authIdentity.findUnique({
      where: { provider_providerAccountId: { provider: "GOOGLE", providerAccountId } },
      include: { user: true }
    });
    const user = identity?.user ?? await app.prisma.$transaction(async (transaction) => {
      const existing = await transaction.user.findUnique({ where: { email } });
      if (existing) {
        await transaction.authIdentity.create({
          data: { userId: existing.id, provider: "GOOGLE", providerAccountId }
        });
        return existing;
      }
      return transaction.user.create({
        data: {
          email,
          name: profile.name?.trim() || email,
          identities: { create: { provider: "GOOGLE", providerAccountId } }
        }
      });
    });
    await createSession(app, reply, config, user.id);
    return reply.redirect(new URL("/dashboard", config.WEB_ORIGIN).toString());
  });
}

export async function requireUser(request: FastifyRequest): Promise<string> {
  if (!request.userId) {
    throw new HttpError(401, "Authentication required", "AUTH_REQUIRED");
  }
  return request.userId;
}

async function createSession(
  app: FastifyInstance,
  reply: FastifyReply,
  config: AppConfig,
  userId: string
): Promise<void> {
  const token = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  await app.prisma.authSession.create({
    data: {
      userId,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt
    }
  });
  reply.setCookie(config.SESSION_COOKIE_NAME, token, {
    signed: true,
    httpOnly: true,
    secure: config.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS
  });
}

async function fetchGoogle(
  url: string,
  init: RequestInit,
  failureCode: string
): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new HttpError(502, "Google sign-in provider is unavailable", failureCode);
  }
}
