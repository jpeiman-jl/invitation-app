import { describe, expect, it } from "vitest";
import {
  createEventTableSchema,
  eventProgramItemSchema,
  updateEventTableSchema
} from "@invitehub/shared";
import { findPartySeatNumbers, getSeatingPartySize, planAutoAssignments } from "./seating-rules.js";

describe("getSeatingPartySize", () => {
  it("allows a pending or maybe guest to reserve one provisional seat", () => {
    expect(getSeatingPartySize(null)).toBe(1);
    expect(getSeatingPartySize({ status: "MAYBE", partySize: 0 })).toBe(1);
  });

  it("uses the confirmed party size and excludes declined guests", () => {
    expect(getSeatingPartySize({ status: "ATTENDING", partySize: 3 })).toBe(3);
    expect(getSeatingPartySize({ status: "DECLINED", partySize: 0 })).toBe(0);
  });
});

describe("findPartySeatNumbers", () => {
  it("allocates a whole party starting at the selected open seat", () => {
    expect(findPartySeatNumbers(5, [1, 4], 2, 2)).toEqual([2, 3]);
  });

  it("wraps around to available seats while keeping the selected seat first", () => {
    expect(findPartySeatNumbers(4, [1, 4], 2, 3)).toEqual([3, 2]);
  });

  it("rejects unavailable preferred seats and parties that exceed capacity", () => {
    expect(findPartySeatNumbers(4, [2], 2, 2)).toBeNull();
    expect(findPartySeatNumbers(2, [], 3)).toBeNull();
  });
});

describe("planAutoAssignments", () => {
  it("keeps all guests from a household at the same table", () => {
    const result = planAutoAssignments(
      [{ id: "table-1", capacity: 4 }, { id: "table-2", capacity: 4 }],
      [
        { id: "guest-1", name: "Alex", household: "Smith", partySize: 2, companionNames: ["Robin"] },
        { id: "guest-2", name: "Sam", household: " smith ", partySize: 2, companionNames: ["Taylor"] },
        { id: "guest-3", name: "Jordan", household: null, partySize: 1, companionNames: [] }
      ]
    );

    expect(result.unassignedGuestIds).toEqual([]);
    expect(result.assignments.filter((seat) => seat.guestId === "guest-1").map((seat) => seat.tableId))
      .toEqual(["table-1", "table-1"]);
    expect(result.assignments.filter((seat) => seat.guestId === "guest-2").map((seat) => seat.tableId))
      .toEqual(["table-1", "table-1"]);
    expect(result.assignments.filter((seat) => seat.guestId === "guest-3").map((seat) => seat.tableId))
      .toEqual(["table-2"]);
  });

  it("leaves a household unassigned when no single table fits everyone", () => {
    const result = planAutoAssignments(
      [{ id: "table-1", capacity: 3 }, { id: "table-2", capacity: 3 }],
      [
        { id: "guest-1", name: "Alex", household: "Smith", partySize: 2, companionNames: [] },
        { id: "guest-2", name: "Sam", household: "Smith", partySize: 2, companionNames: [] }
      ]
    );

    expect(result.assignments).toEqual([]);
    expect(result.unassignedGuestIds).toEqual(["guest-1", "guest-2"]);
  });
});

describe("table validation", () => {
  it("requires a type name for custom tables and bounds the capacity", () => {
    expect(createEventTableSchema.safeParse({
      label: "Garden",
      type: "CUSTOM",
      capacity: 8
    }).success).toBe(false);
    expect(createEventTableSchema.safeParse({
      label: "Garden",
      type: "CUSTOM",
      customType: "Lounge",
      capacity: 8
    }).success).toBe(true);
    expect(createEventTableSchema.safeParse({
      label: "Garden",
      type: "ROUND",
      customType: "Lounge",
      capacity: 8
    }).success).toBe(false);
    expect(createEventTableSchema.safeParse({
      label: "Garden",
      type: "ROUND",
      capacity: 0
    }).success).toBe(false);
  });

  it("allows partial updates so the API can validate against the saved type", () => {
    expect(updateEventTableSchema.safeParse({ type: "CUSTOM" }).success).toBe(true);
  });
});

describe("event program validation", () => {
  it("accepts a named program item with an optional lead and time", () => {
    expect(eventProgramItemSchema.safeParse({
      title: "Prayer",
      lead: "Mrs. Garcia"
    }).success).toBe(true);
    expect(eventProgramItemSchema.safeParse({
      title: "",
      lead: "Mrs. Garcia"
    }).success).toBe(false);
  });
});
