import type { FastifyInstance } from "fastify";
import { invitationTokenParamsSchema, rsvpSchema } from "@invitehub/shared";
import { HttpError } from "../errors.js";
import { isEmailEligible } from "../email-eligibility.js";
import type { EmailJob } from "../email.js";
import { hashToken } from "../security.js";
import { parseInput } from "./helpers.js";
import { normalizeRsvp } from "../rsvp-rules.js";
import { findPartySeatNumbers, getAttendeeNames } from "../seating-rules.js";

export async function registerPublicRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { token: string } }>("/api/v1/public/invitations/:token", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } }
  }, async (request) => {
    const { token } = parseInput(invitationTokenParamsSchema, request.params);
    const invitation = await app.prisma.invitation.findUnique({
      where: { tokenHash: hashToken(token) },
      include: {
        guest: {
          include: {
            event: { include: { template: true } },
            rsvp: true,
            seatAssignments: { include: { table: true } }
          }
        }
      }
    });
    if (!invitation || invitation.status === "REVOKED") {
      throw new HttpError(404, "Invitation not found", "INVITATION_NOT_FOUND");
    }

    const { guest } = invitation;
    if (invitation.status === "CREATED") {
      await app.prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: "OPENED", openedAt: new Date() }
      });
    } else if (!invitation.openedAt) {
      await app.prisma.invitation.update({
        where: { id: invitation.id },
        data: { openedAt: new Date() }
      });
    }
    const seating = guest.event.seatingPublishedAt
      ? guest.seatAssignments.map((assignment) => ({
          table: assignment.table.label,
          seatNumber: assignment.seatNumber,
          attendeeName: assignment.attendeeName
        }))
      : [];
    return {
      invitation: {
        status: invitation.status,
        guest: {
          name: guest.name,
          maxPartySize: guest.maxPartySize,
          rsvp: guest.rsvp
            ? {
                status: guest.rsvp.status,
                partySize: guest.rsvp.partySize,
                companionNames: guest.rsvp.companionNames,
                dietary: guest.rsvp.dietary,
                message: guest.rsvp.message,
                respondedAt: guest.rsvp.respondedAt
              }
            : null
        },
        event: {
          id: guest.event.id,
          title: guest.event.title,
          hostNames: guest.event.hostNames,
          startsAt: guest.event.startsAt,
          timeZone: guest.event.timeZone,
          occasionTypes: guest.event.occasionTypes,
          templateKey: guest.event.templateKey,
          venue: guest.event.venue,
          address: guest.event.address,
          mapUrl: guest.event.mapUrl,
          description: guest.event.description,
          dressCode: guest.event.dressCode,
          programItems: guest.event.programItems,
          rsvpDeadline: guest.event.rsvpDeadline,
          coverImageUrl: guest.event.coverImageUrl,
          template: guest.event.template?.schemaJson ?? null,
          seating
        }
      }
    };
  });

  app.post<{ Params: { token: string } }>("/api/v1/public/invitations/:token/rsvp", {
    config: { rateLimit: { max: 8, timeWindow: "1 minute" } }
  }, async (request, reply) => {
    const { token } = parseInput(invitationTokenParamsSchema, request.params);
    const input = parseInput(rsvpSchema, request.body);
    const invitation = await app.prisma.invitation.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { guest: { include: { event: true } } }
    });
    if (!invitation || invitation.status === "REVOKED") {
      throw new HttpError(404, "Invitation not found", "INVITATION_NOT_FOUND");
    }
    const { guest } = invitation;
    const { event } = guest;
    if (event.rsvpDeadline && event.rsvpDeadline.getTime() < Date.now()) {
      throw new HttpError(410, "The RSVP deadline has passed", "RSVP_DEADLINE_PASSED");
    }
    const party = normalizeRsvp(input, guest.maxPartySize);
    const rsvp = await app.prisma.$transaction(async (transaction) => {
      const saved = await transaction.rsvp.upsert({
        where: { guestId: guest.id },
        create: {
          guestId: guest.id,
          invitationId: invitation.id,
          status: input.status,
          partySize: party.partySize,
          companionNames: party.companionNames,
          dietary: input.dietary ?? null,
          message: input.message ?? null,
          respondedAt: new Date()
        },
        update: {
          status: input.status,
          partySize: party.partySize,
          companionNames: party.companionNames,
          dietary: input.dietary ?? null,
          message: input.message ?? null,
          respondedAt: new Date()
        }
      });
      await transaction.invitation.update({
        where: { id: invitation.id },
        data: { status: "RESPONDED" }
      });
      const currentAssignments = await transaction.seatAssignment.findMany({
        where: { guestId: guest.id },
        orderBy: { seatNumber: "asc" },
        select: { id: true, tableId: true, seatNumber: true, isPrimaryGuest: true }
      });
      if (input.status === "DECLINED") {
        await transaction.seatAssignment.deleteMany({ where: { guestId: guest.id } });
      } else if (input.status === "MAYBE") {
        const primaryAssignment = currentAssignments.find((assignment) => assignment.isPrimaryGuest)
          ?? currentAssignments[0];
        if (primaryAssignment) {
          await transaction.seatAssignment.deleteMany({
            where: { guestId: guest.id, id: { not: primaryAssignment.id } }
          });
          await transaction.seatAssignment.update({
            where: { id: primaryAssignment.id },
            data: { attendeeName: guest.name, isPrimaryGuest: true }
          });
        }
      } else if (currentAssignments.length !== party.partySize && currentAssignments.length > 0) {
        const primaryAssignment = currentAssignments.find((assignment) => assignment.isPrimaryGuest)
          ?? currentAssignments[0]!;
        const table = await transaction.eventTable.findUnique({
          where: { id: primaryAssignment.tableId },
          select: { capacity: true }
        });
        const occupiedSeatNumbers = table
          ? (await transaction.seatAssignment.findMany({
              where: { tableId: primaryAssignment.tableId, guestId: { not: guest.id } },
              select: { seatNumber: true }
            })).map((assignment) => assignment.seatNumber)
          : [];
        const seatNumbers = table
          ? findPartySeatNumbers(
              table.capacity,
              occupiedSeatNumbers,
              party.partySize,
              primaryAssignment.seatNumber
            )
          : null;
        if (seatNumbers) {
          const attendeeNames = getAttendeeNames({
            id: guest.id,
            name: guest.name,
            household: guest.household,
            partySize: party.partySize,
            companionNames: party.companionNames
          });
          await transaction.seatAssignment.deleteMany({ where: { guestId: guest.id } });
          await transaction.seatAssignment.createMany({
            data: seatNumbers.map((seatNumber, index) => ({
              tableId: primaryAssignment.tableId,
              guestId: guest.id,
              seatNumber,
              attendeeName: attendeeNames[index]!,
              isPrimaryGuest: index === 0
            }))
          });
        } else {
          await transaction.seatAssignment.deleteMany({ where: { guestId: guest.id } });
        }
      } else {
        const attendeeNames = getAttendeeNames({
          id: guest.id,
          name: guest.name,
          household: guest.household,
          partySize: party.partySize,
          companionNames: party.companionNames
        });
        for (const [index, assignment] of currentAssignments.entries()) {
          await transaction.seatAssignment.update({
            where: { id: assignment.id },
            data: {
              attendeeName: attendeeNames[index]!,
              isPrimaryGuest: index === 0
            }
          });
        }
      }
      return saved;
    });

    let emailConfirmation: "queued" | "skipped" | "failed" = "skipped";
    if (isEmailEligible(guest.email)) {
      const log = await app.prisma.emailLog.create({
        data: {
          eventId: event.id,
          invitationId: invitation.id,
          kind: "RSVP_CONFIRMATION",
          recipient: guest.email
        }
      });
      const job: EmailJob = {
        emailLogId: log.id,
        invitationId: invitation.id,
        kind: "RSVP_CONFIRMATION",
        recipient: guest.email,
        recipientName: guest.name,
        eventTitle: event.title,
        eventStartsAt: event.startsAt.toISOString()
      };
      try {
        await app.emailQueue.enqueue(job);
        emailConfirmation = "queued";
      } catch (error) {
        request.log.error({ err: error, emailLogId: log.id }, "Failed to enqueue RSVP confirmation");
        await app.prisma.emailLog.update({
          where: { id: log.id },
          data: { status: "FAILED", errorCode: "QUEUE_UNAVAILABLE" }
        });
        emailConfirmation = "failed";
      }
    }

    return reply.code(200).send({
      rsvp: {
        status: rsvp.status,
        partySize: rsvp.partySize,
        companionNames: rsvp.companionNames,
        dietary: rsvp.dietary,
        message: rsvp.message,
        respondedAt: rsvp.respondedAt
      },
      emailConfirmation
    });
  });
}
