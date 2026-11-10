import type { Prisma, PrismaClient } from "@prisma/client";
import { HttpError } from "../errors.js";

type BillingDatabase = Pick<PrismaClient, "event" | "plan">;
type GuestLimitDatabase = Pick<PrismaClient, "event" | "plan" | "guest">;

export interface ActiveEventEntitlement {
  id: string;
  status: "ACTIVE" | "REVOKED" | "EXPIRED";
  expiresAt: Date | null;
  plan: {
    id: string;
    key: string;
    name: string;
    guestLimit: number;
    maxDesignGenerations: number;
    features: Prisma.JsonValue;
  };
}

export function hasPlanFeature(features: Prisma.JsonValue, feature: string): boolean {
  if (typeof features !== "object" || features === null || Array.isArray(features)) {
    return false;
  }
  const value = features[feature];
  return value === true;
}

export function isEntitlementActive(
  entitlement: Pick<ActiveEventEntitlement, "status" | "expiresAt"> | null | undefined,
  now = new Date()
): boolean {
  return Boolean(
    entitlement?.status === "ACTIVE" &&
    (!entitlement.expiresAt || entitlement.expiresAt.getTime() > now.getTime())
  );
}

export async function getActiveEventEntitlement(
  database: BillingDatabase,
  eventId: string
): Promise<ActiveEventEntitlement | null> {
  const event = await database.event.findUnique({
    where: { id: eventId },
    select: {
      entitlement: {
        select: {
          id: true,
          status: true,
          expiresAt: true,
          plan: {
            select: {
              id: true,
              key: true,
              name: true,
              guestLimit: true,
              maxDesignGenerations: true,
              features: true
            }
          }
        }
      }
    }
  });
  const entitlement = event?.entitlement;
  if (!entitlement || !isEntitlementActive(entitlement)) {
    return null;
  }
  return entitlement;
}

export async function requireEventFeature(
  database: BillingDatabase,
  eventId: string,
  feature: string
): Promise<ActiveEventEntitlement> {
  const entitlement = await getActiveEventEntitlement(database, eventId);
  if (!entitlement || !hasPlanFeature(entitlement.plan.features, feature)) {
    throw new HttpError(402, "This feature requires an active event upgrade", "ENTITLEMENT_REQUIRED");
  }
  return entitlement;
}

export async function getEventGuestLimit(
  database: GuestLimitDatabase,
  eventId: string
): Promise<number> {
  const entitlement = await getActiveEventEntitlement(database, eventId);
  if (entitlement) {
    return entitlement.plan.guestLimit;
  }
  const freePlan = await database.plan.findUnique({
    where: { key: "free" },
    select: { guestLimit: true, isActive: true }
  });
  if (!freePlan?.isActive) {
    throw new HttpError(503, "Free plan configuration is unavailable", "PLAN_CONFIGURATION_MISSING");
  }
  return freePlan.guestLimit;
}

export async function assertGuestCapacity(
  database: GuestLimitDatabase,
  eventId: string,
  additionalGuests: number
): Promise<void> {
  const [limit, guestCount] = await Promise.all([
    getEventGuestLimit(database, eventId),
    database.guest.count({ where: { eventId } })
  ]);
  if (guestCount + additionalGuests > limit) {
    throw new HttpError(
      403,
      `This event's guest limit is ${limit}. Upgrade the event to invite more guests.`,
      "GUEST_LIMIT_REACHED"
    );
  }
}

export async function assertFreeEventCapacity(
  database: Pick<PrismaClient, "event" | "plan">,
  ownerId: string
): Promise<void> {
  const [freePlan, events] = await Promise.all([
    database.plan.findUnique({
      where: { key: "free" },
      select: { activeEventLimit: true, isActive: true }
    }),
    database.event.findMany({
      where: { ownerId, startsAt: { gte: new Date() } },
      select: {
        entitlement: {
          select: { status: true, expiresAt: true }
        }
      }
    })
  ]);
  if (!freePlan?.isActive) {
    throw new HttpError(503, "Free plan configuration is unavailable", "PLAN_CONFIGURATION_MISSING");
  }
  const unupgradedEventCount = events.filter((event) =>
    !isEntitlementActive(event.entitlement)
  ).length;
  if (unupgradedEventCount >= freePlan.activeEventLimit) {
    throw new HttpError(
      403,
      `The free plan allows ${freePlan.activeEventLimit} active event. Upgrade an event or remove an existing one to continue.`,
      "ACTIVE_EVENT_LIMIT_REACHED"
    );
  }
}
