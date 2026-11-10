import { parse as parseCsv } from "csv-parse/sync";
import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import {
  createGuestSchema,
  type CreateGuestInput,
  importGuestsSchema,
  sendInvitationsSchema,
  updateGuestSchema
} from "@invitehub/shared";
import { HttpError } from "../errors.js";
import { assertGuestCapacity } from "../billing/entitlements.js";
import type { AppConfig } from "../config.js";
import { isEmailEligible } from "../email-eligibility.js";
import type { EmailJob, EmailKind } from "../email.js";
import { createInvitationToken, decryptInvitationToken, invitationUrl } from "../security.js";
import { requireUser } from "../auth.js";
import { parseInput, parseUuid, requireOwnedEvent } from "./helpers.js";

export async function registerGuestRoutes(app: FastifyInstance, config: AppConfig): Promise<void> {
  app.get<{ Params: { eventId: string } }>("/api/v1/events/:eventId/guests", async (request) => {
    await requireOwnedEvent(app, request, request.params.eventId);
    const guests = await app.prisma.guest.findMany({
      where: { eventId: request.params.eventId },
      orderBy: { name: "asc" },
      include: { invitation: true, rsvp: true }
    });
    return {
      guests: guests.map(({ invitation, ...guest }) => ({
        ...guest,
        invitation: invitation ? {
          id: invitation.id,
          status: invitation.status,
          sentAt: invitation.sentAt,
          remindedAt: invitation.remindedAt,
          openedAt: invitation.openedAt,
          url: invitationUrl(decryptInvitationToken(invitation.tokenCiphertext, config), config)
        } : null
      }))
    };
  });

  app.post<{ Params: { eventId: string } }>("/api/v1/events/:eventId/guests", async (request, reply) => {
    await requireOwnedEvent(app, request, request.params.eventId);
    const input = parseInput(createGuestSchema, request.body);
    const guest = await app.prisma.$transaction(async (transaction) => {
      await assertGuestCapacity(transaction, request.params.eventId, 1);
      const createdGuest = await transaction.guest.create({
        data: { ...input, eventId: request.params.eventId }
      });
      const { token, ...storedInvitation } = createInvitationToken(config);
      await transaction.invitation.create({
        data: { guestId: createdGuest.id, ...storedInvitation }
      });
      return { guest: createdGuest, token };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
        throw new HttpError(409, "Guest limit changed. Refresh and try again.", "GUEST_LIMIT_CONFLICT");
      }
      throw error;
    });
    return reply.code(201).send({
      guest: guest.guest,
      invitationUrl: invitationUrl(guest.token, config)
    });
  });

  app.post<{ Params: { eventId: string } }>("/api/v1/events/:eventId/guests/import", async (request, reply) => {
    await requireOwnedEvent(app, request, request.params.eventId);
    const { csv } = parseInput(importGuestsSchema, request.body);
    let rows: Record<string, string>[];
    try {
      rows = parseCsv(csv, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true,
        max_record_size: 20_000
      }) as Record<string, string>[];
    } catch (error) {
      throw new HttpError(400, `CSV could not be parsed: ${error instanceof Error ? error.message : "invalid format"}`, "CSV_INVALID");
    }
    if (rows.length === 0 || rows.length > 500) {
      throw new HttpError(400, "CSV must contain between 1 and 500 guest rows", "CSV_ROW_LIMIT");
    }

    const validRows: Array<{ index: number; data: CreateGuestInput }> = [];
    const invalidRows: Array<{ index: number; error: Array<{ field: string; message: string }> }> = [];
    rows.forEach((row, index) => {
      const partySizeText = row.maxPartySize?.trim();
      const parsedPartySize = partySizeText ? Number(partySizeText) : 1;
      const parsed = createGuestSchema.safeParse({
        name: row.name,
        email: row.email?.trim() || null,
        phone: row.phone?.trim() || null,
        household: row.household?.trim() || null,
        maxPartySize: parsedPartySize,
        notes: row.notes?.trim() || null,
        dietaryRestrictions: row.dietaryRestrictions?.trim() || null
      });
      if (parsed.success) {
        validRows.push({ data: parsed.data, index });
      } else {
        invalidRows.push({
          index,
          error: parsed.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message }))
        });
      }
    });
    if (invalidRows.length > 0) {
      return reply.code(400).send({
        error: "Some CSV rows are invalid",
        code: "CSV_ROWS_INVALID",
        rows: invalidRows.map(({ index, error }) => ({ row: index + 2, issues: error }))
      });
    }

    const created = await app.prisma.$transaction(async (transaction) => {
      await assertGuestCapacity(transaction, request.params.eventId, validRows.length);
      const records: Array<{ guest: { id: string; name: string; email: string | null }; tokenCiphertext: string }> = [];
      for (const row of validRows) {
        const guest = await transaction.guest.create({
          data: { ...row.data, eventId: request.params.eventId },
          select: { id: true, name: true, email: true }
        });
        const { token, ...storedInvitation } = createInvitationToken(config);
        await transaction.invitation.create({
          data: { guestId: guest.id, ...storedInvitation }
        });
        records.push({ guest, tokenCiphertext: storedInvitation.tokenCiphertext });
      }
      return records;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
        throw new HttpError(409, "Guest limit changed. Refresh and try again.", "GUEST_LIMIT_CONFLICT");
      }
      throw error;
    });
    return reply.code(201).send({
      imported: created.length,
      guests: created.map(({ guest, tokenCiphertext }) => ({
        ...guest,
        invitationUrl: invitationUrl(decryptInvitationToken(tokenCiphertext, config), config)
      }))
    });
  });

  app.patch<{ Params: { guestId: string } }>("/api/v1/guests/:guestId", async (request) => {
    const ownerId = await requireUser(request);
    const guestId = parseUuid(request.params.guestId, "guestId");
    const guest = await app.prisma.guest.findFirst({
      where: { id: guestId, event: { ownerId } },
      select: { id: true }
    });
    if (!guest) {
      throw new HttpError(404, "Guest not found", "GUEST_NOT_FOUND");
    }
    const input = parseInput(updateGuestSchema, request.body);
    if (Object.keys(input).length === 0) {
      throw new HttpError(400, "Provide at least one guest field to update", "EMPTY_UPDATE");
    }
    if (input.maxPartySize !== undefined) {
      const currentRsvp = await app.prisma.rsvp.findUnique({
        where: { guestId: guest.id },
        select: { status: true, partySize: true }
      });
      if (currentRsvp?.status === "ATTENDING" && input.maxPartySize < currentRsvp.partySize) {
        throw new HttpError(409, "Maximum party size cannot be lower than the current RSVP party size", "PARTY_SIZE_CONFLICT");
      }
    }
    return {
      guest: await app.prisma.guest.update({
        where: { id: guest.id },
        data: input
      })
    };
  });

  app.delete<{ Params: { guestId: string } }>("/api/v1/guests/:guestId", async (request, reply) => {
    const ownerId = await requireUser(request);
    const guestId = parseUuid(request.params.guestId, "guestId");
    const guest = await app.prisma.guest.findFirst({
      where: { id: guestId, event: { ownerId } },
      select: { id: true }
    });
    if (!guest) {
      throw new HttpError(404, "Guest not found", "GUEST_NOT_FOUND");
    }
    await app.prisma.guest.delete({ where: { id: guest.id } });
    return reply.code(204).send();
  });

  app.get<{ Params: { guestId: string } }>("/api/v1/guests/:guestId/invitation-link", async (request) => {
    const ownerId = await requireUser(request);
    const guestId = parseUuid(request.params.guestId, "guestId");
    const guest = await app.prisma.guest.findFirst({
      where: { id: guestId, event: { ownerId } },
      include: { invitation: true }
    });
    if (!guest?.invitation) {
      throw new HttpError(404, "Guest invitation not found", "INVITATION_NOT_FOUND");
    }
    return {
      invitationUrl: invitationUrl(decryptInvitationToken(guest.invitation.tokenCiphertext, config), config)
    };
  });

  app.post<{ Params: { eventId: string } }>("/api/v1/events/:eventId/invitations/send", async (request) => {
    const event = await requireOwnedEvent(app, request, request.params.eventId);
    const input = parseInput(sendInvitationsSchema, request.body);
    const guestIds = [...new Set(input.guestIds)];
    const guests = await app.prisma.guest.findMany({
      where: { id: { in: guestIds }, eventId: event.id },
      include: { invitation: true }
    });
    if (guests.length !== guestIds.length) {
      throw new HttpError(404, "One or more guests were not found in this event", "GUESTS_NOT_FOUND");
    }

    const summary = await enqueueInvitations(app, config, event, guests, "INVITATION");
    return { ...summary, skippedNoEmail: guests.length - summary.queued - summary.failed };
  });

  app.post<{ Params: { eventId: string } }>("/api/v1/events/:eventId/invitations/remind", async (request) => {
    const event = await requireOwnedEvent(app, request, request.params.eventId);
    if (event.rsvpDeadline && event.rsvpDeadline.getTime() < Date.now()) {
      throw new HttpError(410, "The RSVP deadline has passed", "RSVP_DEADLINE_PASSED");
    }
    const guests = await app.prisma.guest.findMany({
      where: {
        eventId: event.id,
        rsvp: null,
        invitation: { status: { in: ["SENT", "OPENED"] }, sentAt: { not: null } }
      },
      include: { invitation: true }
    });
    const summary = await enqueueInvitations(app, config, event, guests, "REMINDER");
    return { ...summary, skippedNoEmail: guests.length - summary.queued - summary.failed };
  });
}

async function enqueueInvitations(
  app: FastifyInstance,
  config: AppConfig,
  event: { id: string; title: string; startsAt: Date },
  guests: Array<{
    id: string;
    name: string;
    email: string | null;
    invitation: {
      id: string;
      tokenCiphertext: string;
    } | null;
  }>,
  kind: EmailKind
): Promise<{ queued: number; failed: number }> {
  let queued = 0;
  let failed = 0;
  for (const guest of guests) {
    if (!isEmailEligible(guest.email)) {
      continue;
    }
    if (!guest.invitation) {
      throw new HttpError(500, "Guest invitation is missing", "INVITATION_MISSING");
    }
    const log = await app.prisma.emailLog.create({
      data: {
        eventId: event.id,
        invitationId: guest.invitation.id,
        kind,
        recipient: guest.email
      }
    });
    const job: EmailJob = {
      emailLogId: log.id,
      invitationId: guest.invitation.id,
      kind,
      recipient: guest.email,
      recipientName: guest.name,
      eventTitle: event.title,
      eventStartsAt: event.startsAt.toISOString(),
      invitationUrl: invitationUrl(decryptInvitationToken(guest.invitation.tokenCiphertext, config), config)
    };
    try {
      await app.emailQueue.enqueue(job);
      queued += 1;
    } catch (error) {
      app.log.error({ err: error, emailLogId: log.id }, "Failed to enqueue email");
      await app.prisma.emailLog.update({
        where: { id: log.id },
        data: { status: "FAILED", errorCode: "QUEUE_UNAVAILABLE" }
      });
      failed += 1;
    }
  }
  return { queued, failed };
}
