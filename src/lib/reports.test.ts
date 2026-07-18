import { describe, expect, it } from "vitest";
import {
  buildNarrative,
  canTransitionReport,
  clientRequiredFor,
  csvEscape,
  defaultSections,
  resolvePeriod,
  toCsv,
} from "./reports";
import {
  INDICATOR_DEFINITIONS,
  INDICATOR_THRESHOLD_DEFAULTS,
  buildExecutiveAttention,
  mergeThresholds,
} from "./indicators";

// 2026-07-15 12:00 UTC = 06:00 in Mexico City (Wednesday July 15)
const NOW = new Date("2026-07-15T12:00:00Z");
const TZ = "America/Mexico_City";

describe("resolvePeriod (org timezone, ISO weeks)", () => {
  it("current and previous month", () => {
    expect(resolvePeriod("current_month", TZ, NOW)).toEqual({ start: "2026-07-01", end: "2026-07-31" });
    expect(resolvePeriod("previous_month", TZ, NOW)).toEqual({ start: "2026-06-01", end: "2026-06-30" });
  });
  it("current week is Monday–Sunday", () => {
    expect(resolvePeriod("current_week", TZ, NOW)).toEqual({ start: "2026-07-13", end: "2026-07-19" });
    expect(resolvePeriod("previous_week", TZ, NOW)).toEqual({ start: "2026-07-06", end: "2026-07-12" });
  });
  it("quarters and year", () => {
    expect(resolvePeriod("current_quarter", TZ, NOW)).toEqual({ start: "2026-07-01", end: "2026-09-30" });
    expect(resolvePeriod("previous_quarter", TZ, NOW)).toEqual({ start: "2026-04-01", end: "2026-06-30" });
    expect(resolvePeriod("current_year", TZ, NOW)).toEqual({ start: "2026-01-01", end: "2026-12-31" });
  });
  it("uses the org timezone, not UTC (early-UTC hour still yesterday locally)", () => {
    // 2026-08-01T03:00Z is still 2026-07-31 21:00 in Mexico City → July, not August
    const edge = new Date("2026-08-01T03:00:00Z");
    expect(resolvePeriod("current_month", TZ, edge)).toEqual({ start: "2026-07-01", end: "2026-07-31" });
  });
});

describe("workflow transitions", () => {
  it("main flow: draft → generating → ready_for_review → approved → sent", () => {
    expect(canTransitionReport("draft", "generating")).toBe(true);
    expect(canTransitionReport("generating", "ready_for_review")).toBe(true);
    expect(canTransitionReport("ready_for_review", "approved")).toBe(true);
    expect(canTransitionReport("approved", "sent")).toBe(true);
  });
  it("side paths: changes_requested, failed, edit-after-approval", () => {
    expect(canTransitionReport("ready_for_review", "changes_requested")).toBe(true);
    expect(canTransitionReport("changes_requested", "draft")).toBe(true);
    expect(canTransitionReport("generating", "failed")).toBe(true);
    expect(canTransitionReport("approved", "draft")).toBe(true); // editing returns it to review flow
    expect(canTransitionReport("approved", "generating")).toBe(true); // regenerate = new version
  });
  it("blocks silent shortcuts", () => {
    expect(canTransitionReport("draft", "approved")).toBe(false);
    expect(canTransitionReport("draft", "sent")).toBe(false);
    expect(canTransitionReport("sent", "approved")).toBe(false);
  });
});

describe("client requirement per type", () => {
  it("client-facing types require a client; internal types don't", () => {
    expect(clientRequiredFor("monthly_service")).toBe(true);
    expect(clientRequiredFor("sla_report")).toBe(true);
    expect(clientRequiredFor("custom_internal")).toBe(false);
    expect(clientRequiredFor("project_report")).toBe(false);
    expect(clientRequiredFor("time_report")).toBe(false);
  });
});

describe("deterministic narrative", () => {
  const input = {
    periodStart: "2026-06-01",
    periodEnd: "2026-06-30",
    ticketsCreated: 18,
    ticketsClosed: 16,
    slaEvaluated: 16,
    slaMet: 15,
    activitiesCompleted: 7,
    totalMinutes: 1920,
    billableMinutes: 600,
  };
  it("states facts only, in Spanish, fully deterministic", () => {
    const a = buildNarrative(input);
    const b = buildNarrative(input);
    expect(a).toBe(b);
    expect(a).toContain("se atendieron 18 tickets");
    expect(a).toContain("16 fueron cerrados");
    expect(a).toContain("94%"); // 15/16
    expect(a).toContain("32 horas");
    expect(a).not.toMatch(/recomend|debería|probable|causa/i); // no interpretations
  });
  it("omits sections with no data instead of inventing zeros", () => {
    const empty = buildNarrative({ ...input, slaEvaluated: 0, slaMet: 0, activitiesCompleted: 0, totalMinutes: 0, billableMinutes: 0 });
    expect(empty).not.toContain("SLA");
    expect(empty).not.toContain("actividades");
    expect(empty).not.toContain("horas");
  });
});

describe("CSV safety", () => {
  it("escapes quotes, commas and newlines", () => {
    expect(csvEscape('a "b", c')).toBe('"a ""b"", c"');
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
  });
  it("neutralizes formula injection", () => {
    expect(csvEscape("=SUM(A1:A9)")).toBe("'=SUM(A1:A9)");
    expect(csvEscape("+123")).toBe("'+123");
    expect(csvEscape("@cmd")).toBe("'@cmd");
    expect(csvEscape("-2+3")).toBe("'-2+3");
  });
  it("builds a BOM-prefixed CSV with CRLF", () => {
    const csv = toCsv(["a", "b"], [["1", "=evil()"]]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("a,b\r\n1,'=evil()");
  });
});

describe("report sections", () => {
  it("default sections cover the spec list with sane enablement", () => {
    const sections = defaultSections();
    expect(sections.map((s) => s.key)).toContain("sla");
    expect(sections.find((s) => s.key === "cover")?.enabled).toBe(true);
    expect(sections.find((s) => s.key === "recommendations")?.enabled).toBe(false);
  });
});

describe("indicator definitions dictionary", () => {
  it("every definition has a formula, unit, source and empty state", () => {
    for (const def of INDICATOR_DEFINITIONS) {
      expect(def.formula.length).toBeGreaterThan(10);
      expect(["count", "minutes", "percent", "currency"]).toContain(def.unit);
      expect(def.source.length).toBeGreaterThan(3);
      expect(def.emptyState.length).toBeGreaterThan(5);
    }
  });
  it("keys are unique", () => {
    const keys = INDICATOR_DEFINITIONS.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("thresholds", () => {
  it("merges org overrides over documented defaults, ignoring unknown keys", () => {
    const merged = mergeThresholds([
      { key: "sla_target_pct", value: "95" },
      { key: "not_a_threshold", value: "1" },
    ]);
    expect(merged.sla_target_pct).toBe(95);
    expect(merged.client_inactive_days).toBe(INDICATOR_THRESHOLD_DEFAULTS.client_inactive_days.value);
    expect("not_a_threshold" in merged).toBe(false);
  });
});

describe("executive attention (deterministic)", () => {
  const thresholds = mergeThresholds([]);
  const base = {
    backlog: 10,
    backlogPrevious: 10,
    slaCompliancePct: 95,
    overdueTickets: 0,
    projectsAtRisk: 0,
    billingPendingReview: 0,
    reportsOverdue: 0,
    recurrencesInError: 0,
    thresholds,
  };
  it("quiet operation produces no items", () => {
    expect(buildExecutiveAttention(base)).toEqual([]);
  });
  it("flags SLA below target and backlog growth, high severity first", () => {
    const items = buildExecutiveAttention({
      ...base,
      slaCompliancePct: 80,
      backlog: 14,
      backlogPrevious: 10, // +40% ≥ 25%
      billingPendingReview: 3,
    });
    expect(items.map((i) => i.key)).toEqual(["backlog_growth", "sla_below_target", "billing_review"]);
    expect(items[0].severity).toBe("high");
  });
  it("does not fabricate a comparison without a previous period", () => {
    const items = buildExecutiveAttention({ ...base, backlog: 100, backlogPrevious: null });
    expect(items.find((i) => i.key === "backlog_growth")).toBeUndefined();
  });
});
