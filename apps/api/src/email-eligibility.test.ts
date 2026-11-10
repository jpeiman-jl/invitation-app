import { describe, expect, it } from "vitest";
import { isEmailEligible } from "./email-eligibility.js";

describe("isEmailEligible", () => {
  it("accepts a populated email", () => {
    expect(isEmailEligible("guest@example.com")).toBe(true);
  });

  it("rejects missing and blank emails", () => {
    expect(isEmailEligible(undefined)).toBe(false);
    expect(isEmailEligible(null)).toBe(false);
    expect(isEmailEligible("  ")).toBe(false);
    expect(isEmailEligible("not-an-email")).toBe(false);
  });
});
