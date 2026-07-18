import { describe, expect, it } from "vitest";
import {
  addDays,
  classifyError,
  computeNextRun,
  describeSchedule,
  isExhausted,
  isoWeekday,
  nextOccurrenceLocal,
  nextOccurrencesLocal,
  nthWeekdayOfMonth,
  occurrenceRunAt,
  renderTemplate,
  TemplateRenderError,
  todayInTz,
  usedVariables,
  zonedTimeToUtc,
  type ScheduleFields,
  type TemplateContext,
} from "./recurrence";

function schedule(over: Partial<ScheduleFields> = {}): ScheduleFields {
  return {
    frequency: "daily",
    interval: 1,
    daysOfWeek: null,
    dayOfMonth: null,
    monthOfYear: null,
    weekOfMonth: null,
    timeOfDay: "09:00",
    timezone: "America/Mexico_City",
    startAt: "2026-07-01",
    endAt: null,
    ...over,
  };
}

describe("daily / weekdays", () => {
  it("every day", () => {
    expect(nextOccurrenceLocal(schedule(), "2026-07-10")).toBe("2026-07-11");
    expect(nextOccurrenceLocal(schedule(), "2026-07-10", true)).toBe("2026-07-10");
  });
  it("every 2 days anchors on startAt", () => {
    const s = schedule({ interval: 2 }); // 01, 03, 05…
    expect(nextOccurrenceLocal(s, "2026-07-01")).toBe("2026-07-03");
    expect(nextOccurrenceLocal(s, "2026-07-02")).toBe("2026-07-03");
    expect(nextOccurrenceLocal(s, "2026-07-03")).toBe("2026-07-05");
  });
  it("weekdays skips weekends (2026-07-17 is Friday)", () => {
    const s = schedule({ frequency: "weekdays" });
    expect(isoWeekday("2026-07-17")).toBe(5);
    expect(nextOccurrenceLocal(s, "2026-07-17")).toBe("2026-07-20"); // Monday
  });
  it("before startAt, first occurrence is startAt", () => {
    expect(nextOccurrenceLocal(schedule(), "2026-06-01")).toBe("2026-07-01");
  });
});

describe("weekly", () => {
  it("every Monday", () => {
    const s = schedule({ frequency: "weekly", daysOfWeek: [1], startAt: "2026-07-01" });
    expect(nextOccurrenceLocal(s, "2026-07-16")).toBe("2026-07-20");
  });
  it("Mon/Wed/Fri", () => {
    const s = schedule({ frequency: "weekly", daysOfWeek: [1, 3, 5], startAt: "2026-07-01" });
    expect(nextOccurrencesLocal(s, "2026-07-19", 3)).toEqual([
      "2026-07-20", "2026-07-22", "2026-07-24",
    ]);
  });
  it("every 2 weeks keeps the anchor week", () => {
    // startAt 2026-07-01 (Wed) → anchor week Mon 2026-06-29; odd weeks skipped
    const s = schedule({ frequency: "weekly", interval: 2, daysOfWeek: [3], startAt: "2026-07-01" });
    expect(nextOccurrencesLocal(s, "2026-07-01", 3)).toEqual([
      "2026-07-15", "2026-07-29", "2026-08-12",
    ]);
  });
});

describe("monthly and variants", () => {
  it("day 15 of every month", () => {
    const s = schedule({ frequency: "monthly", dayOfMonth: 15, startAt: "2026-07-01" });
    expect(nextOccurrencesLocal(s, "2026-07-15", 2)).toEqual(["2026-08-15", "2026-09-15"]);
  });
  it("day 31 clamps to shorter months", () => {
    const s = schedule({ frequency: "monthly", dayOfMonth: 31, startAt: "2026-01-01" });
    expect(nextOccurrencesLocal(s, "2026-01-31", 3)).toEqual([
      "2026-02-28", "2026-03-31", "2026-04-30",
    ]);
  });
  it("last day of month (-1)", () => {
    const s = schedule({ frequency: "monthly", dayOfMonth: -1, startAt: "2026-07-01" });
    expect(nextOccurrencesLocal(s, "2026-07-01", 3)).toEqual([
      "2026-07-31", "2026-08-31", "2026-09-30",
    ]);
  });
  it("first Monday of each month", () => {
    const s = schedule({
      frequency: "monthly",
      weekOfMonth: 1,
      daysOfWeek: [1],
      startAt: "2026-07-01",
    });
    expect(nextOccurrencesLocal(s, "2026-07-06", 2)).toEqual(["2026-08-03", "2026-09-07"]);
  });
  it("last Friday of the month", () => {
    expect(nthWeekdayOfMonth(2026, 7, 5, -1)).toBe("2026-07-31");
    expect(nthWeekdayOfMonth(2026, 8, 5, -1)).toBe("2026-08-28");
  });
  it("quarterly = every 3 months", () => {
    const s = schedule({ frequency: "quarterly", dayOfMonth: 1, startAt: "2026-01-01" });
    expect(nextOccurrencesLocal(s, "2026-01-01", 3)).toEqual([
      "2026-04-01", "2026-07-01", "2026-10-01",
    ]);
  });
  it("annual on Jan 15", () => {
    const s = schedule({
      frequency: "annual",
      monthOfYear: 1,
      dayOfMonth: 15,
      startAt: "2026-01-15",
    });
    expect(nextOccurrencesLocal(s, "2026-01-15", 2)).toEqual(["2027-01-15", "2028-01-15"]);
  });
});

describe("endAt / maxOccurrences", () => {
  it("stops at endAt", () => {
    const s = schedule({ endAt: "2026-07-03" });
    expect(nextOccurrencesLocal(s, "2026-07-01", 10)).toEqual(["2026-07-02", "2026-07-03"]);
  });
  it("isExhausted: whichever limit hits first", () => {
    expect(
      isExhausted({ occurrenceCount: 5, maxOccurrences: 5, endAt: null, nextLocal: "2026-08-01" }),
    ).toBe(true);
    expect(
      isExhausted({ occurrenceCount: 2, maxOccurrences: 5, endAt: "2026-07-31", nextLocal: "2026-08-01" }),
    ).toBe(true);
    expect(
      isExhausted({ occurrenceCount: 2, maxOccurrences: 5, endAt: "2026-08-31", nextLocal: "2026-08-01" }),
    ).toBe(false);
    expect(
      isExhausted({ occurrenceCount: 0, maxOccurrences: null, endAt: null, nextLocal: null }),
    ).toBe(true);
  });
});

describe("timezone / DST", () => {
  it("interprets the wall-clock time in the definition's zone (CDMX = UTC-6, no DST)", () => {
    expect(zonedTimeToUtc("2026-07-15", "09:00", "America/Mexico_City").toISOString()).toBe(
      "2026-07-15T15:00:00.000Z",
    );
  });
  it("New York DST: same wall time, different UTC offset across the change", () => {
    // 2026 DST: begins Mar 8, ends Nov 1
    expect(zonedTimeToUtc("2026-03-07", "09:00", "America/New_York").toISOString()).toBe(
      "2026-03-07T14:00:00.000Z", // EST −5
    );
    expect(zonedTimeToUtc("2026-03-09", "09:00", "America/New_York").toISOString()).toBe(
      "2026-03-09T13:00:00.000Z", // EDT −4
    );
  });
  it("spring-forward gap resolves without losing the occurrence", () => {
    // 02:30 does not exist on 2026-03-08 in New York — must still yield an instant that day
    const instant = zonedTimeToUtc("2026-03-08", "02:30", "America/New_York");
    expect(Number.isNaN(instant.getTime())).toBe(false);
    expect(todayInTz(instant, "America/New_York")).toBe("2026-03-08");
  });
  it("daily across a DST change: one occurrence per local day, none duplicated", () => {
    const s = schedule({ timezone: "America/New_York", startAt: "2026-03-06" });
    const dates = nextOccurrencesLocal(s, "2026-03-06", 4);
    expect(dates).toEqual(["2026-03-07", "2026-03-08", "2026-03-09", "2026-03-10"]);
    const instants = dates.map((d) => occurrenceRunAt(s, d).getTime());
    expect(new Set(instants).size).toBe(4);
  });
  it("computeNextRun compares instants, not dates (same-day future time is eligible)", () => {
    const s = schedule(); // 09:00 CDMX = 15:00 UTC
    const now = new Date("2026-07-15T14:00:00Z"); // 08:00 in CDMX
    const next = computeNextRun(s, now);
    expect(next?.local).toBe("2026-07-15");
    const later = new Date("2026-07-15T16:00:00Z"); // 10:00 in CDMX — already past
    expect(computeNextRun(s, later)?.local).toBe("2026-07-16");
  });
});

describe("template rendering", () => {
  const ctx: TemplateContext = {
    client: { name: "Acme" },
    contact: null,
    project: { name: "Migración" },
    assignee: { name: "Ana" },
    recurrence: { name: "Respaldo mensual" },
    occurrence: { date: "2026-07-15" },
  };
  it("renders whitelisted variables", () => {
    expect(renderTemplate("Revisión de respaldos — {{client.name}}", ctx)).toBe(
      "Revisión de respaldos — Acme",
    );
    expect(renderTemplate("Reporte {{occurrence.month}} {{occurrence.year}}", ctx)).toBe(
      "Reporte julio 2026",
    );
    expect(renderTemplate("{{period.start}} a {{period.end}}", ctx)).toBe(
      "2026-07-01 a 2026-07-31",
    );
  });
  it("rejects unknown variables (no template injection)", () => {
    expect(() => renderTemplate("{{user.passwordHash}}", ctx)).toThrow(TemplateRenderError);
    expect(() => renderTemplate("{{client.secret}}", ctx)).toThrow("no permitida");
  });
  it("errors visibly when a variable has no value in context", () => {
    expect(() => renderTemplate("Hola {{contact.name}}", ctx)).toThrow("sin valor");
  });
  it("lists used variables for pre-save validation", () => {
    expect(usedVariables("{{client.name}} y {{occurrence.month}} y {{client.name}}")).toEqual([
      "client.name",
      "occurrence.month",
    ]);
  });
});

describe("error taxonomy", () => {
  it("classifies temporary / configuration / permanent", () => {
    expect(classifyError("timeout")).toBe("temporary");
    expect(classifyError("client_archived")).toBe("configuration");
    expect(classifyError("target_unsupported")).toBe("permanent");
    expect(classifyError("something_new")).toBe("temporary"); // safe default: retryable
  });
});

describe("human-readable schedule", () => {
  it("describes rules in Spanish without cron syntax", () => {
    expect(describeSchedule(schedule())).toContain("cada día a las 09:00");
    expect(
      describeSchedule(schedule({ frequency: "weekly", daysOfWeek: [1, 3, 5] })),
    ).toContain("lunes, miércoles, viernes");
    expect(
      describeSchedule(schedule({ frequency: "monthly", dayOfMonth: -1 })),
    ).toContain("último día");
    expect(
      describeSchedule(schedule({ frequency: "monthly", weekOfMonth: 1, daysOfWeek: [1] })),
    ).toContain("primer lunes");
  });
});

describe("calendar helpers", () => {
  it("addDays crosses month/year boundaries", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});
