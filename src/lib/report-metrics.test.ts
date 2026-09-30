import { describe, expect, it } from "vitest";
import { resolveBillingCost } from "./report-metrics";

describe("resolveBillingCost", () => {
  it("uses the time entries when they carry an amount", () => {
    expect(resolveBillingCost({ entryCost: "2400.00", legacyCost: "0" })).toBe("2400.00");
  });

  it("ignores a stale ticket-level amount that disagrees with the entries", () => {
    // Ferrotek TK-000272 (2026-09-29): entries 2400, old ticket field 2000.
    expect(resolveBillingCost({ entryCost: "2400.00", legacyCost: "2000.00" })).toBe("2400.00");
    // CWIMM TK-000278: entries 250, old ticket field 300.
    expect(resolveBillingCost({ entryCost: "250.00", legacyCost: "300.00" })).toBe("250.00");
  });

  it("falls back to the pre-redesign amount when no entry carries a rate", () => {
    expect(resolveBillingCost({ entryCost: "0", legacyCost: "1800.00" })).toBe("1800.00");
  });

  it("reports nothing rather than inventing an amount", () => {
    expect(Number(resolveBillingCost({ entryCost: "0", legacyCost: "0" }))).toBe(0);
  });
});
