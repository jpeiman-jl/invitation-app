import { describe, expect, it } from "vitest";
import { createEventSchema } from "@invitehub/shared";

const eventDetails = {
  title: "Birthday and christening",
  startsAt: "2026-11-01T10:00:00.000Z",
  timeZone: "UTC"
};

describe("event occasion and design validation", () => {
  it("accepts multiple occasions while choosing one invitation design", () => {
    const result = createEventSchema.safeParse({
      ...eventDetails,
      occasionTypes: ["birthday", "christening"],
      templateKey: "christening"
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.occasionTypes).toEqual(["birthday", "christening"]);
      expect(result.data.templateKey).toBe("christening");
    }
  });

  it("requires at least one valid occasion", () => {
    expect(createEventSchema.safeParse({
      ...eventDetails,
      occasionTypes: []
    }).success).toBe(false);
    expect(createEventSchema.safeParse({
      ...eventDetails,
      occasionTypes: ["birthday", "graduation"]
    }).success).toBe(false);
  });
});
