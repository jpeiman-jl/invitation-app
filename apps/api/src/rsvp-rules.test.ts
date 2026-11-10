import { describe, expect, it } from "vitest";
import { normalizeRsvp } from "./rsvp-rules.js";

describe("normalizeRsvp", () => {
  it("accepts an attending party up to the host-set limit", () => {
    expect(normalizeRsvp({
      status: "ATTENDING",
      partySize: 3,
      companionNames: ["Alex", "Sam"]
    }, 3)).toEqual({ partySize: 3, companionNames: ["Alex", "Sam"] });
  });

  it("rejects party sizes above the host-set limit", () => {
    expect(() => normalizeRsvp({
      status: "ATTENDING",
      partySize: 3,
      companionNames: []
    }, 2)).toThrowError(/Party size must be between 1 and 2/);
  });

  it("rejects more companion names than companion seats", () => {
    expect(() => normalizeRsvp({
      status: "ATTENDING",
      partySize: 2,
      companionNames: ["Alex", "Sam"]
    }, 4)).toThrowError(/more companion names/);
  });

  it("stores zero attendees for a declined RSVP", () => {
    expect(normalizeRsvp({ status: "DECLINED", companionNames: [] }, 1))
      .toEqual({ partySize: 0, companionNames: [] });
  });
});
