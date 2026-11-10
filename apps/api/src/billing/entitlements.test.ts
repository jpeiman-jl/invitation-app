import { describe, expect, it } from "vitest";
import { hasPlanFeature, isEntitlementActive } from "./entitlements.js";

describe("plan features", () => {
  it("only enables explicit boolean features", () => {
    expect(hasPlanFeature({ customDesign: true }, "customDesign")).toBe(true);
    expect(hasPlanFeature({ customDesign: "true" }, "customDesign")).toBe(false);
    expect(hasPlanFeature({}, "customDesign")).toBe(false);
    expect(hasPlanFeature(null, "customDesign")).toBe(false);
  });
});

describe("entitlement expiry", () => {
  const now = new Date("2026-10-27T00:00:00.000Z");

  it("requires active status and an unexpired or non-expiring entitlement", () => {
    expect(isEntitlementActive({ status: "ACTIVE", expiresAt: null }, now)).toBe(true);
    expect(isEntitlementActive({
      status: "ACTIVE",
      expiresAt: new Date("2026-10-28T00:00:00.000Z")
    }, now)).toBe(true);
    expect(isEntitlementActive({
      status: "ACTIVE",
      expiresAt: new Date("2026-10-26T00:00:00.000Z")
    }, now)).toBe(false);
    expect(isEntitlementActive({ status: "REVOKED", expiresAt: null }, now)).toBe(false);
    expect(isEntitlementActive(null, now)).toBe(false);
  });
});
