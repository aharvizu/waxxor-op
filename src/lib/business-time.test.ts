import { describe, expect, it } from "vitest";
import {
  addWorkingMinutes,
  remainingWorkingMinutes,
  workingMinutesBetween,
  zonedParts,
  type WorkCalendar,
} from "./business-time";
import { slaHealth } from "./sla";

// Mon–Fri 09:00–18:00 in Mexico City (UTC-6, no DST since 2022)
const MX: WorkCalendar = {
  timezone: "America/Mexico_City",
  workDays: [1, 2, 3, 4, 5],
  startMinute: 540,
  endMinute: 1080,
};

// 2026-07-17 is a Friday. 17:30 local = 23:30 UTC.
const FRI_1730_LOCAL = new Date("2026-07-17T23:30:00Z");

describe("zonedParts (timezone awareness)", () => {
  it("reads local weekday and minute-of-day through the timezone", () => {
    const p = zonedParts(FRI_1730_LOCAL, "America/Mexico_City");
    expect(p.weekday).toBe(5); // Friday locally…
    expect(p.minuteOfDay).toBe(17 * 60 + 30);
    const utc = zonedParts(FRI_1730_LOCAL, "UTC");
    expect(utc.weekday).toBe(5);
    expect(utc.minuteOfDay).toBe(23 * 60 + 30); // …but 23:30 in UTC
  });
});

describe("addWorkingMinutes", () => {
  it("24/7 (null calendar) is plain wall-clock addition", () => {
    const t = addWorkingMinutes(FRI_1730_LOCAL, 90, null);
    expect(t.toISOString()).toBe("2026-07-18T01:00:00.000Z");
  });

  it("spills across the weekend in business-hours mode", () => {
    // 30m left on Friday (until 18:00), remaining 30m land Monday 09:30 local
    const t = addWorkingMinutes(FRI_1730_LOCAL, 60, MX);
    expect(t.toISOString()).toBe("2026-07-20T15:30:00.000Z"); // Mon 09:30 CDMX
  });

  it("starting outside the window snaps to the next window", () => {
    // Saturday noon local (18:00 UTC) + 60m → Monday 10:00 local
    const sat = new Date("2026-07-18T18:00:00Z");
    const t = addWorkingMinutes(sat, 60, MX);
    expect(t.toISOString()).toBe("2026-07-20T16:00:00.000Z"); // Mon 10:00 CDMX
  });

  it("stays inside the day when it fits", () => {
    // Friday 09:00 local (15:00 UTC) + 120m → Friday 11:00 local
    const fri9 = new Date("2026-07-17T15:00:00Z");
    expect(addWorkingMinutes(fri9, 120, MX).toISOString()).toBe(
      "2026-07-17T17:00:00.000Z",
    );
  });
});

describe("workingMinutesBetween", () => {
  it("counts only business minutes across a weekend", () => {
    // Fri 17:30 local → Mon 09:30 local = 30 + 30 business minutes
    const monday = new Date("2026-07-20T15:30:00Z");
    expect(workingMinutesBetween(FRI_1730_LOCAL, monday, MX)).toBe(60);
  });
  it("returns wall-clock minutes without a calendar", () => {
    const monday = new Date("2026-07-20T15:30:00Z");
    expect(workingMinutesBetween(FRI_1730_LOCAL, monday, null)).toBe(64 * 60);
  });
  it("is zero over a weekend with no business time", () => {
    const sat = new Date("2026-07-18T16:00:00Z");
    const sun = new Date("2026-07-19T16:00:00Z");
    expect(workingMinutesBetween(sat, sun, MX)).toBe(0);
  });
});

describe("remainingWorkingMinutes (signed)", () => {
  it("is negative once the target passed", () => {
    const target = new Date("2026-07-17T16:00:00Z");
    const now = new Date("2026-07-17T17:00:00Z");
    expect(remainingWorkingMinutes(now, target, null)).toBe(-60);
  });
});

describe("slaHealth thresholds (>25% normal · ≤25% at risk · ≤10% critical · past overdue)", () => {
  const total = 100; // minutes
  const at = (remaining: number) =>
    slaHealth({
      now: new Date("2026-07-17T15:00:00Z"),
      targetAt: new Date(new Date("2026-07-17T15:00:00Z").getTime() + remaining * 60000),
      totalMinutes: total,
      fulfilledAt: null,
      cal: null,
    }).health;

  it("classifies each band", () => {
    expect(at(50)).toBe("normal"); // 50%
    expect(at(25)).toBe("at_risk"); // exactly 25%
    expect(at(10)).toBe("critical"); // exactly 10%
    expect(at(-5)).toBe("overdue");
  });

  it("met and breached compare fulfillment against the target", () => {
    const target = new Date("2026-07-17T16:00:00Z");
    const base = { now: new Date(), targetAt: target, totalMinutes: 60, cal: null };
    expect(
      slaHealth({ ...base, fulfilledAt: new Date("2026-07-17T15:30:00Z") }).health,
    ).toBe("met");
    expect(
      slaHealth({ ...base, fulfilledAt: new Date("2026-07-17T16:30:00Z") }).health,
    ).toBe("breached");
  });
});
