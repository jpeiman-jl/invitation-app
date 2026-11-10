import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { createEventSchema, updateEventSchema } from "@invitehub/shared";
import { HttpError } from "../errors.js";
import { requireUser } from "../auth.js";
import { assertFreeEventCapacity } from "../billing/entitlements.js";
import { parseInput, requireOwnedEvent } from "./helpers.js";

function toProgramItemsJson(programItems: Array<{
  title: string;
  time?: string | null;
  lead?: string | null;
  description?: string | null;
}>): Array<{ title: string; time: string | null; lead: string | null; description: string | null }> {
  return programItems.map((item) => ({
    title: item.title,
    time: item.time ?? null,
    lead: item.lead ?? null,
    description: item.description ?? null
  }));
}

export async function registerEventRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/events", async (request) => {
    const ownerId = await requireUser(request);
    return app.prisma.event.findMany({
      where: { ownerId },
      orderBy: { startsAt: "asc" },
      include: {
        _count: { select: { guests: true, tables: true } }
      }
    });
  });

  app.post("/api/v1/events", async (request, reply) => {
    const ownerId = await requireUser(request);
    const input = parseInput(createEventSchema, request.body);
    const event = await app.prisma.$transaction(async (transaction) => {
      await assertFreeEventCapacity(transaction, ownerId);
      return transaction.event.create({
        data: {
          ownerId,
          title: input.title,
          hostNames: input.hostNames,
          startsAt: new Date(input.startsAt),
          timeZone: input.timeZone,
          occasionTypes: input.occasionTypes,
          templateKey: input.templateKey,
          venue: input.venue,
          address: input.address,
          mapUrl: input.mapUrl,
          description: input.description,
          dressCode: input.dressCode,
          programItems: toProgramItemsJson(input.programItems),
          rsvpDeadline: input.rsvpDeadline ? new Date(input.rsvpDeadline) : input.rsvpDeadline,
          coverImageUrl: input.coverImageUrl,
          publicGuestLookupEnabled: input.publicGuestLookupEnabled,
          publicSlug: input.publicSlug
        }
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new HttpError(409, "This public event link is already in use", "PUBLIC_SLUG_TAKEN");
      }
      throw error;
    });
    return reply.code(201).send({ event });
  });

  app.get<{ Params: { eventId: string } }>("/api/v1/events/:eventId", async (request) => {
    await requireOwnedEvent(app, request, request.params.eventId);
    const event = await app.prisma.event.findUnique({
      where: { id: request.params.eventId },
      include: {
        template: true,
        entitlement: { include: { plan: true } },
        _count: { select: { guests: true, tables: true } }
      }
    });
    if (!event) {
      throw new HttpError(404, "Event not found", "EVENT_NOT_FOUND");
    }
    return { event };
  });

  app.patch<{ Params: { eventId: string } }>("/api/v1/events/:eventId", async (request) => {
    await requireOwnedEvent(app, request, request.params.eventId);
    const input = parseInput(updateEventSchema, request.body);
    if (Object.keys(input).length === 0) {
      throw new HttpError(400, "Provide at least one event field to update", "EMPTY_UPDATE");
    }
    const { startsAt, rsvpDeadline, programItems, ...fields } = input;
    const data = {
      ...fields,
      ...(programItems !== undefined ? { programItems: toProgramItemsJson(programItems) } : {}),
      ...(startsAt !== undefined ? { startsAt: new Date(startsAt) } : {}),
      ...(rsvpDeadline !== undefined
        ? { rsvpDeadline: rsvpDeadline ? new Date(rsvpDeadline) : null }
        : {})
    };
    const event = await app.prisma.event.update({
      where: { id: request.params.eventId },
      data
    }).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new HttpError(409, "This public event link is already in use", "PUBLIC_SLUG_TAKEN");
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
        throw new HttpError(409, "Event limit changed. Refresh and try again.", "ACTIVE_EVENT_LIMIT_CONFLICT");
      }
      throw error;
    });
    return { event };
  });

  app.delete<{ Params: { eventId: string } }>("/api/v1/events/:eventId", async (request, reply) => {
    await requireOwnedEvent(app, request, request.params.eventId);
    await app.prisma.event.delete({ where: { id: request.params.eventId } });
    return reply.code(204).send();
  });
}
