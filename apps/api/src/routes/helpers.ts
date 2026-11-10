import type { FastifyRequest } from "fastify";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { HttpError } from "../errors.js";

export function parseInput<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw parsed.error;
  }
  return parsed.data;
}

export function parseUuid(value: string, field = "id"): string {
  const parsed = z.string().uuid().safeParse(value);
  if (!parsed.success) {
    throw new HttpError(400, `${field} must be a UUID`, "INVALID_ID");
  }
  return parsed.data;
}

export async function requireOwnedEvent(
  app: FastifyInstance,
  request: FastifyRequest,
  eventId: string
) {
  parseUuid(eventId, "eventId");
  if (!request.userId) {
    throw new HttpError(401, "Authentication required", "AUTH_REQUIRED");
  }
  const event = await app.prisma.event.findFirst({
    where: { id: eventId, ownerId: request.userId }
  });
  if (!event) {
    throw new HttpError(404, "Event not found", "EVENT_NOT_FOUND");
  }
  return event;
}
