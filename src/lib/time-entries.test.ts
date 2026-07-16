import { describe, expect, it } from "vitest";
import {
  BILLING_STATUSES,
  TIME_MODALITIES,
  TIME_TYPES,
  calculateAmount,
  durationMinutesSchema,
  formatMinutes,
  optionalMoneySchema,
  summarizeByUser,
} from "./time-entries";

describe("time entry catalogs", () => {
  it("exposes the twelve time types", () => {
    expect(TIME_TYPES).toHaveLength(12);
    expect(TIME_TYPES).toContain("technical_work");
    expect(TIME_TYPES).toContain("commercial");
  });
  it("exposes billing statuses and modalities", () => {
    expect(BILLING_STATUSES).toEqual([
      "billable", "non_billable", "included_in_contract", "pending_review",
    ]);
    expect(TIME_MODALITIES).toEqual(["remote", "onsite", "not_applicable"]);
  });
});

describe("duration validation", () => {
  it("requires at least 1 minute", () => {
    expect(durationMinutesSchema.safeParse("0").success).toBe(false);
    expect(durationMinutesSchema.safeParse("-5").success).toBe(false);
    expect(durationMinutesSchema.safeParse("1").success).toBe(true);
    expect(durationMinutesSchema.safeParse("480").success).toBe(true);
  });
  it("rejects fractional minutes and garbage", () => {
    expect(durationMinutesSchema.safeParse("30.5").success).toBe(false);
    expect(durationMinutesSchema.safeParse("abc").success).toBe(false);
  });
});

describe("amount calculation (duration/60 × rate, cents)", () => {
  it("computes billable amount", () => {
    expect(calculateAmount(60, "100.00")).toBe("100.00");
    expect(calculateAmount(90, "100.00")).toBe("150.00");
    expect(calculateAmount(89, "100.00")).toBe("148.33");
  });
  it("computes internal cost with the same formula", () => {
    expect(calculateAmount(30, "50")).toBe("25.00");
  });
  it("returns null without a rate (rates optional in this phase)", () => {
    expect(calculateAmount(60, null)).toBeNull();
  });
});

describe("money input validation", () => {
  it("accepts plain and two-decimal amounts, normalizes empty to null", () => {
    expect(optionalMoneySchema.parse("750")).toBe("750");
    expect(optionalMoneySchema.parse("750.50")).toBe("750.50");
    expect(optionalMoneySchema.parse("")).toBeNull();
  });
  it("rejects negatives and garbage", () => {
    expect(optionalMoneySchema.safeParse("-5").success).toBe(false);
    expect(optionalMoneySchema.safeParse("abc").success).toBe(false);
  });
});

describe("per-technician summary", () => {
  it("groups non-voided minutes by user, descending", () => {
    const rows = summarizeByUser([
      { userId: 1, userName: "Ana", durationMinutes: 30, voidedAt: null },
      { userId: 2, userName: "Beto", durationMinutes: 90, voidedAt: null },
      { userId: 1, userName: "Ana", durationMinutes: 45, voidedAt: null },
      { userId: 1, userName: "Ana", durationMinutes: 999, voidedAt: new Date() },
    ]);
    expect(rows).toEqual([
      { userId: 2, userName: "Beto", minutes: 90 },
      { userId: 1, userName: "Ana", minutes: 75 },
    ]);
  });
});

describe("minutes formatting", () => {
  it("renders h/m", () => {
    expect(formatMinutes(45)).toBe("45m");
    expect(formatMinutes(60)).toBe("1h");
    expect(formatMinutes(95)).toBe("1h 35m");
  });
});
