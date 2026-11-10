import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import {
  assignGuestToSeatSchema,
  createEventTableSchema,
  moveSeatAssignmentSchema,
  publishSeatingSchema,
  updateEventTableSchema
} from "@invitehub/shared";
import { HttpError } from "../errors.js";
import {
  getSeatingPartySize,
  planAutoAssignments,
  findPartySeatNumbers,
  getAttendeeNames
} from "../seating-rules.js";
import { requireUser } from "../auth.js";
import { parseInput, parseUuid, requireOwnedEvent } from "./helpers.js";

function throwSeatingConflict(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2002" || error.code === "P2034")
  ) {
    throw new HttpError(409, "The seating plan changed. Refresh and try again.", "SEATING_CONFLICT");
  }
  throw error;
}

function throwTableLabelConflict(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw new HttpError(409, "A table with this name already exists", "TABLE_LABEL_TAKEN");
  }
  throwSeatingConflict(error);
}

export async function registerSeatingRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { eventId: string } }>("/api/v1/events/:eventId/seating", async (request) => {
    await requireOwnedEvent(app, request, request.params.eventId);
    const [event, tables, guests] = await Promise.all([
      app.prisma.event.findUnique({
        where: { id: request.params.eventId },
        select: { seatingPublishedAt: true }
      }),
      app.prisma.eventTable.findMany({
        where: { eventId: request.params.eventId },
        orderBy: { label: "asc" },
        include: { assignments: { orderBy: { seatNumber: "asc" } } }
      }),
      app.prisma.guest.findMany({
        where: { eventId: request.params.eventId },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          household: true,
          rsvp: { select: { status: true, partySize: true, companionNames: true } }
        }
      })
    ]);
    const seatableGuests = guests.flatMap((guest) => {
      const partySize = getSeatingPartySize(guest.rsvp);
      return partySize > 0
        ? [{
            id: guest.id,
            name: guest.name,
            household: guest.household,
            rsvp: {
              status: guest.rsvp?.status ?? null,
              partySize,
              companionNames: guest.rsvp?.status === "ATTENDING" ? guest.rsvp.companionNames : []
            }
          }]
        : [];
    });
    const assignedGuestIds = new Set(tables.flatMap((table) =>
      table.assignments.map((assignment) => assignment.guestId)
    ));

    return {
      tables,
      seatableGuests,
      unassignedGuests: seatableGuests.filter((guest) => !assignedGuestIds.has(guest.id)),
      seatingPublishedAt: event?.seatingPublishedAt ?? null
    };
  });

  app.post<{ Params: { eventId: string } }>("/api/v1/events/:eventId/tables", async (request, reply) => {
    await requireOwnedEvent(app, request, request.params.eventId);
    const input = parseInput(createEventTableSchema, request.body);
    const table = await app.prisma.eventTable.create({
      data: { eventId: request.params.eventId, ...input }
    }).catch(throwTableLabelConflict);
    return reply.code(201).send({ table });
  });

  app.patch<{ Params: { eventId: string; tableId: string } }>(
    "/api/v1/events/:eventId/tables/:tableId",
    async (request) => {
      await requireOwnedEvent(app, request, request.params.eventId);
      const tableId = parseUuid(request.params.tableId, "tableId");
      const input = parseInput(updateEventTableSchema, request.body);
      if (Object.keys(input).length === 0) {
        throw new HttpError(400, "Provide at least one table field to update", "EMPTY_UPDATE");
      }

      const current = await app.prisma.eventTable.findFirst({
        where: { id: tableId, eventId: request.params.eventId },
        include: { assignments: { select: { seatNumber: true } } }
      });
      if (!current) {
        throw new HttpError(404, "Table not found", "TABLE_NOT_FOUND");
      }
      const capacity = input.capacity ?? current.capacity;
      if (current.assignments.some((assignment) => assignment.seatNumber > capacity)) {
        throw new HttpError(409, "Capacity cannot be lower than an occupied seat number", "TABLE_CAPACITY_IN_USE");
      }
      const type = input.type ?? current.type;
      const customType = input.customType === undefined ? current.customType : input.customType;
      if (type === "CUSTOM" && !customType?.trim()) {
        throw new HttpError(400, "Provide a name for a custom table type", "CUSTOM_TABLE_TYPE_REQUIRED");
      }
      if (type !== "CUSTOM" && input.customType) {
        throw new HttpError(400, "Custom type names are only used for custom tables", "CUSTOM_TABLE_TYPE_INVALID");
      }

      return {
        table: await app.prisma.eventTable.update({
          where: { id: tableId },
          data: {
            ...input,
            ...(input.type && input.type !== "CUSTOM" ? { customType: null } : {})
          }
        }).catch(throwTableLabelConflict)
      };
    }
  );

  app.delete<{ Params: { eventId: string; tableId: string } }>(
    "/api/v1/events/:eventId/tables/:tableId",
    async (request, reply) => {
      await requireOwnedEvent(app, request, request.params.eventId);
      const tableId = parseUuid(request.params.tableId, "tableId");
      const deleted = await app.prisma.eventTable.deleteMany({
        where: { id: tableId, eventId: request.params.eventId }
      });
      if (deleted.count === 0) {
        throw new HttpError(404, "Table not found", "TABLE_NOT_FOUND");
      }
      return reply.code(204).send();
    }
  );

  app.post<{ Params: { eventId: string; tableId: string } }>(
    "/api/v1/events/:eventId/tables/:tableId/assignments",
    async (request) => {
      await requireOwnedEvent(app, request, request.params.eventId);
      const tableId = parseUuid(request.params.tableId, "tableId");
      const input = parseInput(assignGuestToSeatSchema, request.body);
      const assignments = await app.prisma.$transaction(async (transaction) => {
        const [guest, table] = await Promise.all([
          transaction.guest.findFirst({
            where: { id: input.guestId, eventId: request.params.eventId },
            include: { rsvp: true }
          }),
          transaction.eventTable.findFirst({
            where: { id: tableId, eventId: request.params.eventId }
          })
        ]);
        if (!guest) {
          throw new HttpError(404, "Guest not found", "GUEST_NOT_FOUND");
        }
        if (!table) {
          throw new HttpError(404, "Table not found", "TABLE_NOT_FOUND");
        }
        const partySize = getSeatingPartySize(guest.rsvp);
        if (partySize < 1) {
          throw new HttpError(400, "Declined guests cannot be assigned seats", "GUEST_NOT_SEATABLE");
        }
        if (input.seatNumber !== undefined && input.seatNumber > table.capacity) {
          throw new HttpError(400, "Seat number exceeds table capacity", "SEAT_NUMBER_INVALID");
        }

        const existingGuestAssignments = await transaction.seatAssignment.findMany({
          where: { guestId: guest.id },
          select: { id: true, tableId: true, seatNumber: true }
        });
        const assignmentsOnTable = await transaction.seatAssignment.findMany({
          where: { tableId },
          select: { guestId: true, seatNumber: true }
        });
        const previousAssignmentIds = new Set(existingGuestAssignments.map((assignment) => assignment.id));
        const occupiedSeatNumbers = assignmentsOnTable
          .filter((assignment) => assignment.guestId !== guest.id)
          .map((assignment) => assignment.seatNumber);
        const seatNumbers = findPartySeatNumbers(
          table.capacity,
          occupiedSeatNumbers,
          partySize,
          input.seatNumber
        );
        if (!seatNumbers) {
          throw new HttpError(
            409,
            input.seatNumber === undefined
              ? "This table does not have enough free seats for the whole party"
              : "The selected seat cannot fit the whole party",
            "TABLE_CAPACITY_EXCEEDED"
          );
        }

        const attendeeNames = getAttendeeNames({
          id: guest.id,
          name: guest.name,
          household: guest.household,
          partySize,
          companionNames: guest.rsvp?.status === "ATTENDING" ? guest.rsvp.companionNames : []
        });
        if (previousAssignmentIds.size > 0) {
          await transaction.seatAssignment.deleteMany({
            where: { id: { in: [...previousAssignmentIds] } }
          });
        }
        await transaction.seatAssignment.createMany({
          data: seatNumbers.map((seatNumber, index) => ({
            tableId,
            guestId: guest.id,
            seatNumber,
            attendeeName: attendeeNames[index]!,
            isPrimaryGuest: index === 0
          }))
        });
        return transaction.seatAssignment.findMany({
          where: { guestId: guest.id },
          orderBy: { seatNumber: "asc" }
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }).catch(throwSeatingConflict);

      return { assignments };
    }
  );

  app.patch<{ Params: { eventId: string; assignmentId: string } }>(
    "/api/v1/events/:eventId/assignments/:assignmentId",
    async (request) => {
      await requireOwnedEvent(app, request, request.params.eventId);
      const assignmentId = parseUuid(request.params.assignmentId, "assignmentId");
      const input = parseInput(moveSeatAssignmentSchema, request.body);
      return app.prisma.$transaction(async (transaction) => {
        const [assignment, targetTable] = await Promise.all([
          transaction.seatAssignment.findFirst({
            where: { id: assignmentId, table: { eventId: request.params.eventId } }
          }),
          transaction.eventTable.findFirst({
            where: { id: input.tableId, eventId: request.params.eventId }
          })
        ]);
        if (!assignment) {
          throw new HttpError(404, "Seat assignment not found", "SEAT_ASSIGNMENT_NOT_FOUND");
        }
        if (!targetTable) {
          throw new HttpError(404, "Table not found", "TABLE_NOT_FOUND");
        }
        if (input.seatNumber > targetTable.capacity) {
          throw new HttpError(400, "Seat number exceeds table capacity", "SEAT_NUMBER_INVALID");
        }

        const targetAssignment = await transaction.seatAssignment.findFirst({
          where: { tableId: targetTable.id, seatNumber: input.seatNumber }
        });
        if (targetAssignment?.id === assignment.id) {
          return { assignments: [assignment] };
        }

        const changedAssignments = targetAssignment ? [assignment, targetAssignment] : [assignment];
        await transaction.seatAssignment.deleteMany({
          where: { id: { in: changedAssignments.map((item) => item.id) } }
        });
        await transaction.seatAssignment.createMany({
          data: [
            {
              tableId: targetTable.id,
              seatNumber: input.seatNumber,
              guestId: assignment.guestId,
              attendeeName: assignment.attendeeName,
              isPrimaryGuest: assignment.isPrimaryGuest
            },
            ...(targetAssignment ? [{
              tableId: assignment.tableId,
              seatNumber: assignment.seatNumber,
              guestId: targetAssignment.guestId,
              attendeeName: targetAssignment.attendeeName,
              isPrimaryGuest: targetAssignment.isPrimaryGuest
            }] : [])
          ]
        });
        return {
          assignments: await transaction.seatAssignment.findMany({
            where: {
              OR: [
                { tableId: targetTable.id, seatNumber: input.seatNumber },
                ...(targetAssignment
                  ? [{ tableId: assignment.tableId, seatNumber: assignment.seatNumber }]
                  : [])
              ]
            },
            orderBy: [{ tableId: "asc" }, { seatNumber: "asc" }]
          })
        };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }).catch(throwSeatingConflict);
    }
  );

  app.delete<{ Params: { eventId: string; guestId: string } }>(
    "/api/v1/events/:eventId/assignments/:guestId",
    async (request) => {
      await requireOwnedEvent(app, request, request.params.eventId);
      const guestId = parseUuid(request.params.guestId, "guestId");
      const guest = await app.prisma.guest.findFirst({
        where: { id: guestId, eventId: request.params.eventId },
        select: { id: true }
      });
      if (!guest) {
        throw new HttpError(404, "Guest not found", "GUEST_NOT_FOUND");
      }
      const result = await app.prisma.seatAssignment.deleteMany({
        where: { guestId, table: { eventId: request.params.eventId } }
      });
      return { removed: result.count };
    }
  );

  app.post<{ Params: { eventId: string } }>(
    "/api/v1/events/:eventId/seating/auto-assign",
    async (request) => {
      await requireOwnedEvent(app, request, request.params.eventId);
      const { eligibleGuests, plan } = await app.prisma.$transaction(async (transaction) => {
        const [tables, guests] = await Promise.all([
          transaction.eventTable.findMany({
            where: { eventId: request.params.eventId },
            orderBy: { label: "asc" },
            select: { id: true, capacity: true }
          }),
          transaction.guest.findMany({
            where: { eventId: request.params.eventId },
            orderBy: { name: "asc" },
            select: {
              id: true,
              name: true,
              household: true,
              rsvp: { select: { status: true, partySize: true, companionNames: true } }
            }
          })
        ]);
        const eligibleGuests = guests.flatMap((guest) => {
          const partySize = getSeatingPartySize(guest.rsvp);
          return partySize > 0
            ? [{
              id: guest.id,
              name: guest.name,
              household: guest.household,
              partySize,
              companionNames: guest.rsvp?.status === "ATTENDING" ? guest.rsvp.companionNames : []
            }]
            : [];
        });
        const plan = planAutoAssignments(tables, eligibleGuests);
        await transaction.seatAssignment.deleteMany({ where: { table: { eventId: request.params.eventId } } });
        if (plan.assignments.length > 0) {
          await transaction.seatAssignment.createMany({ data: plan.assignments });
        }
        return { eligibleGuests, plan };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }).catch(throwSeatingConflict);

      const unassignedNames = eligibleGuests
        .filter((guest) => plan.unassignedGuestIds.includes(guest.id))
        .map((guest) => guest.name);
      return {
        assignedGuests: new Set(plan.assignments.map((assignment) => assignment.guestId)).size,
        assignedSeats: plan.assignments.length,
        unassignedGuestNames: unassignedNames
      };
    }
  );

  app.patch<{ Params: { eventId: string } }>(
    "/api/v1/events/:eventId/seating/publication",
    async (request) => {
      await requireOwnedEvent(app, request, request.params.eventId);
      const input = parseInput(publishSeatingSchema, request.body);
      const [event, unassignedGuests] = await Promise.all([
        app.prisma.event.update({
          where: { id: request.params.eventId },
          data: { seatingPublishedAt: input.published ? new Date() : null },
          select: { seatingPublishedAt: true }
        }),
        app.prisma.guest.count({
          where: {
            eventId: request.params.eventId,
            OR: [{ rsvp: null }, { rsvp: { status: { in: ["ATTENDING", "MAYBE"] } } }],
            seatAssignments: { none: {} }
          }
        })
      ]);
      return { seatingPublishedAt: event.seatingPublishedAt, unassignedGuests };
    }
  );
}
