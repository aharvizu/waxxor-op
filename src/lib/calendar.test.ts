import { describe, expect, it } from "vitest";
import { addDays, addMonths, daysBetween, monthGridDays, weekDays } from "./calendar";

describe("monthGridDays", () => {
  it("starts on the Monday on/before the 1st and ends on a Sunday", () => {
    const days = monthGridDays(2026, 8); // August 2026 starts on a Saturday
    expect(days[0]).toBe("2026-07-27"); // Monday before Aug 1
    expect(days.length % 7).toBe(0);
    expect(days[days.length - 1]).toBe("2026-09-06"); // trailing Sunday
    expect(days).toContain("2026-08-01");
    expect(days).toContain("2026-08-31");
  });

  it("handles a month that already starts on Monday (no lead days)", () => {
    const days = monthGridDays(2026, 6); // June 2026 starts on a Monday
    expect(days[0]).toBe("2026-06-01");
  });

  it("handles December → January year rollover for trailing days", () => {
    const days = monthGridDays(2025, 12);
    expect(days[days.length - 1] >= "2026-01-01").toBe(true);
  });
});

describe("weekDays", () => {
  it("returns Monday through Sunday for any day in that week", () => {
    const week = weekDays("2026-08-13"); // a Thursday
    expect(week).toEqual([
      "2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13",
      "2026-08-14", "2026-08-15", "2026-08-16",
    ]);
  });

  it("a Monday is its own week start", () => {
    expect(weekDays("2026-08-10")[0]).toBe("2026-08-10");
  });
});

describe("addMonths", () => {
  it("rolls forward across a year boundary", () => {
    expect(addMonths(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
  });
  it("rolls backward across a year boundary", () => {
    expect(addMonths(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
  });
  it("stays within the year for a mid-range delta", () => {
    expect(addMonths(2026, 6, 3)).toEqual({ year: 2026, month: 9 });
  });
});

describe("addDays", () => {
  it("rolls over a month boundary", () => {
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
  });
  it("rolls backward over a month boundary", () => {
    expect(addDays("2026-08-01", -1)).toBe("2026-07-31");
  });
});

describe("daysBetween", () => {
  it("counts whole days across a month boundary", () => {
    expect(daysBetween("2026-08-30", "2026-09-02")).toBe(3);
  });
  it("is zero for the same date", () => {
    expect(daysBetween("2026-08-15", "2026-08-15")).toBe(0);
  });
  it("is negative when b is before a", () => {
    expect(daysBetween("2026-08-15", "2026-08-10")).toBe(-5);
  });
});
