export interface SeatingTable {
  id: string;
  capacity: number;
}

export interface SeatingGuest {
  id: string;
  name: string;
  household: string | null;
  partySize: number;
  companionNames: string[];
}

export function getSeatingPartySize(rsvp: {
  status: "ATTENDING" | "DECLINED" | "MAYBE";
  partySize: number;
} | null): number {
  if (rsvp?.status === "DECLINED") {
    return 0;
  }
  return rsvp?.status === "ATTENDING" ? rsvp.partySize : 1;
}

export interface PlannedSeatAssignment {
  tableId: string;
  guestId: string;
  seatNumber: number;
  attendeeName: string;
  isPrimaryGuest: boolean;
}

export function getAttendeeNames(guest: SeatingGuest): string[] {
  return Array.from({ length: guest.partySize }, (_, index) =>
    index === 0
      ? guest.name
      : guest.companionNames[index - 1] ?? `${guest.name}'s guest ${index}`
  );
}

export function findPartySeatNumbers(
  capacity: number,
  occupiedSeatNumbers: number[],
  partySize: number,
  preferredSeatNumber?: number
): number[] | null {
  if (partySize < 1 || partySize > capacity) {
    return null;
  }

  if (
    preferredSeatNumber !== undefined &&
    (preferredSeatNumber < 1 || preferredSeatNumber > capacity || occupiedSeatNumbers.includes(preferredSeatNumber))
  ) {
    return null;
  }

  const start = preferredSeatNumber ?? 1;
  const orderedSeatNumbers = Array.from(
    { length: capacity },
    (_, index) => ((start - 1 + index) % capacity) + 1
  );
  const freeSeatNumbers = orderedSeatNumbers.filter((seatNumber) => !occupiedSeatNumbers.includes(seatNumber));
  return freeSeatNumbers.length >= partySize ? freeSeatNumbers.slice(0, partySize) : null;
}

export function planAutoAssignments(
  tables: SeatingTable[],
  guests: SeatingGuest[]
): { assignments: PlannedSeatAssignment[]; unassignedGuestIds: string[] } {
  const availableSeats = new Map(tables.map((table) => [
    table.id,
    Array.from({ length: table.capacity }, (_, index) => index + 1)
  ]));
  const groupedGuests = new Map<string, SeatingGuest[]>();

  for (const guest of guests) {
    const household = guest.household?.trim().toLocaleLowerCase();
    const key = household ? `household:${household}` : `guest:${guest.id}`;
    groupedGuests.set(key, [...(groupedGuests.get(key) ?? []), guest]);
  }

  const groups = [...groupedGuests.values()].sort((first, second) =>
    second.reduce((sum, guest) => sum + guest.partySize, 0) -
    first.reduce((sum, guest) => sum + guest.partySize, 0)
  );
  const assignments: PlannedSeatAssignment[] = [];
  const unassignedGuestIds: string[] = [];

  for (const group of groups) {
    const groupSize = group.reduce((sum, guest) => sum + guest.partySize, 0);
    const table = tables.find((candidate) => (availableSeats.get(candidate.id)?.length ?? 0) >= groupSize);
    if (!table) {
      unassignedGuestIds.push(...group.map((guest) => guest.id));
      continue;
    }

    const freeSeats = availableSeats.get(table.id);
    if (!freeSeats) {
      unassignedGuestIds.push(...group.map((guest) => guest.id));
      continue;
    }

    for (const guest of group) {
      const attendeeNames = getAttendeeNames(guest);
      for (const attendeeName of attendeeNames) {
        const seatNumber = freeSeats.shift();
        if (seatNumber === undefined) {
          unassignedGuestIds.push(...group.map((member) => member.id));
          break;
        }
        assignments.push({
          tableId: table.id,
          guestId: guest.id,
          seatNumber,
          attendeeName,
          isPrimaryGuest: attendeeName === guest.name && assignments.every((assignment) =>
            assignment.guestId !== guest.id
          )
        });
      }
    }
  }

  return { assignments, unassignedGuestIds };
}
