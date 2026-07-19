import { describe, expect, it } from "vitest";
import {
  applyMarks,
  attentionReason,
  buildAttention,
  buildFocus,
  evaluateReminders,
  greetingFor,
  isOverdue,
  isSlaAtRisk,
  smartOrder,
  summaryText,
  type TodayItem,
} from "./today-rules";

const NOW = new Date("2026-07-16T18:00:00Z");

function item(over: Partial<TodayItem>): TodayItem {
  return {
    kind: "activity",
    id: 1,
    workItemId: 1,
    folio: null,
    title: "x",
    companyId: null,
    companyName: null,
    assigneeId: 1,
    assigneeName: "Ana",
    status: "pending",
    priority: "medium",
    activityType: "general",
    category: null,
    dueDate: null,
    createdAt: new Date("2026-07-15T00:00:00Z"),
    updatedAt: new Date("2026-07-15T00:00:00Z"),
    projectId: null,
    parentActivityId: null,
    firstResponseAt: null,
    firstResponseTargetAt: null,
    resolutionTargetAt: null,
    slaName: null,
    slaResolutionMinutes: null,
    slaPausedAt: null,
    reopenCount: 0,
    billingStatus: null,
    unansweredInbound: false,
    lastInboundAt: null,
    minutes: 0,
    ...over,
  };
}

const ticket = (over: Partial<TodayItem>) =>
  item({ kind: "ticket", status: "in_progress", folio: "TK-000001", ...over });

describe("greeting and summary", () => {
  it("greets by hour", () => {
    expect(greetingFor(8)).toBe("Buenos días");
    expect(greetingFor(14)).toBe("Buenas tardes");
    expect(greetingFor(21)).toBe("Buenas noches");
  });
  it("builds the textual summary from real counts", () => {
    expect(summaryText({ pending: 12, overdue: 2, slaAtRisk: 1 })).toBe(
      "Tienes 12 trabajos pendientes, 2 vencidos y 1 SLA en riesgo.",
    );
    expect(summaryText({ pending: 1, overdue: 0, slaAtRisk: 0 })).toBe(
      "Tienes 1 trabajo pendiente.",
    );
  });
});

describe("overdue / SLA detection", () => {
  it("activity overdue by due date; paused SLA never counts", () => {
    expect(isOverdue(item({ dueDate: "2026-07-10" }), NOW)).toBe(true);
    expect(isOverdue(item({ dueDate: "2026-07-20" }), NOW)).toBe(false);
    expect(
      isOverdue(
        ticket({
          resolutionTargetAt: new Date("2026-07-15T00:00:00Z"),
          slaPausedAt: new Date(),
        }),
        NOW,
      ),
    ).toBe(false);
  });
  it("SLA at risk uses the real window (≤25%)", () => {
    const risky = ticket({
      slaResolutionMinutes: 480,
      resolutionTargetAt: new Date(NOW.getTime() + 60 * 60000), // 60/480 = 12.5%
    });
    expect(isSlaAtRisk(risky, NOW)).toBe(true);
    const safe = ticket({
      slaResolutionMinutes: 480,
      resolutionTargetAt: new Date(NOW.getTime() + 400 * 60000),
    });
    expect(isSlaAtRisk(safe, NOW)).toBe(false);
  });
});

describe("attention ranking (spec order)", () => {
  it("ranks 1..7 correctly", () => {
    const breached = ticket({ id: 1, resolutionTargetAt: new Date("2026-07-16T10:00:00Z") });
    const criticalNoResp = ticket({ id: 2, priority: "critical" });
    const slaCritical = ticket({
      id: 3,
      slaResolutionMinutes: 480,
      resolutionTargetAt: new Date(NOW.getTime() + 30 * 60000), // ~6%
    });
    const urgentOverdueAct = item({ id: 4, priority: "high", dueDate: "2026-07-10" });
    const waitingClient = ticket({ id: 5, unansweredInbound: true });
    const reopened = ticket({ id: 6, status: "reopened" });
    const plainOverdue = item({ id: 7, dueDate: "2026-07-14" });

    expect(attentionReason(breached, NOW)?.rank).toBe(1);
    expect(attentionReason(criticalNoResp, NOW)?.rank).toBe(2);
    expect(attentionReason(slaCritical, NOW)?.rank).toBe(3);
    expect(attentionReason(urgentOverdueAct, NOW)?.rank).toBe(4);
    expect(attentionReason(waitingClient, NOW)?.rank).toBe(5);
    expect(attentionReason(reopened, NOW)?.rank).toBe(6);
    expect(attentionReason(plainOverdue, NOW)?.rank).toBe(7);
    expect(attentionReason(item({}), NOW)).toBeNull();

    const top = buildAttention(
      [plainOverdue, reopened, breached, slaCritical, waitingClient, criticalNoResp, urgentOverdueAct],
      NOW,
    );
    expect(top.map((t) => t.item.id)).toEqual([1, 2, 3, 4, 5]); // top-5 in order
  });
});

describe("smart order", () => {
  it("overdue → sla risk → priority → date → dateless", () => {
    const a = item({ id: 1, dueDate: "2026-07-10" }); // overdue
    const b = ticket({
      id: 2,
      slaResolutionMinutes: 480,
      resolutionTargetAt: new Date(NOW.getTime() + 60 * 60000),
    }); // at risk
    const c = item({ id: 3, priority: "critical", dueDate: "2026-07-20" });
    const d = item({ id: 4, priority: "critical" }); // dateless critical
    const e = item({ id: 5, priority: "low", dueDate: "2026-07-18" });
    const sorted = smartOrder([e, d, c, b, a], NOW).map((i) => i.id);
    expect(sorted).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("No olvides rules", () => {
  it("detects stale confirmation, unassigned activity and missing time — no fake alerts", () => {
    const stale = ticket({
      id: 10,
      status: "pending_confirmation",
      updatedAt: new Date("2026-07-10T00:00:00Z"),
    });
    const freshConfirmation = ticket({
      id: 11,
      status: "pending_confirmation",
      updatedAt: new Date("2026-07-16T00:00:00Z"),
    });
    const unassigned = item({
      id: 12,
      assigneeId: null,
      createdAt: new Date("2026-07-14T00:00:00Z"),
    });
    const noTime = ticket({ id: 13, status: "closed", minutes: 0, billingStatus: "no_charge" });
    const withTime = ticket({ id: 14, status: "closed", minutes: 30, billingStatus: "no_charge" });

    const reminders = evaluateReminders(
      [stale, freshConfirmation, unassigned, noTime, withTime],
      [],
      NOW,
    );
    const keys = reminders.map((r) => `${r.ruleKey}:${r.entityId}`);
    expect(keys).toContain("pending_confirmation_stale:10");
    expect(keys).not.toContain("pending_confirmation_stale:11");
    expect(keys).toContain("activity_unassigned:12");
    expect(keys).toContain("missing_time:13");
    expect(keys).not.toContain("missing_time:14");
  });

  it("detects inactive companies from real last-touch data", () => {
    const reminders = evaluateReminders(
      [],
      [
        { companyId: 1, companyName: "Viejo", lastTouchAt: new Date("2026-05-01T00:00:00Z") },
        { companyId: 2, companyName: "Activo", lastTouchAt: new Date("2026-07-15T00:00:00Z") },
      ],
      NOW,
    );
    expect(reminders.map((r) => r.entityId)).toEqual([1]);
  });

  it("surfaces renewals due within 30 days or overdue, and ignores the rest", () => {
    const reminders = evaluateReminders([], [], NOW, [
      {
        source: "client_service",
        sourceId: 1,
        companyId: 5,
        companyName: "Acme",
        concept: "M365",
        date: "2026-07-20", // 4 days out — due soon
      },
      {
        source: "contract",
        sourceId: 2,
        companyId: 6,
        companyName: "Globex",
        concept: "Managed services",
        date: "2026-07-01", // overdue
      },
      {
        source: "client_service",
        sourceId: 3,
        companyId: 7,
        companyName: "Initech",
        concept: "Backup",
        date: "2026-10-01", // far out — no alert
      },
    ]);
    const keys = reminders.map((r) => r.ruleKey);
    expect(keys).toContain("renewal_client_service_1");
    expect(keys).toContain("renewal_contract_2");
    expect(keys).not.toContain("renewal_client_service_3");

    const overdue = reminders.find((r) => r.ruleKey === "renewal_contract_2")!;
    expect(overdue.severity).toBe("high");
    expect(overdue.entityType).toBe("client");
    expect(overdue.entityId).toBe(6);
    expect(overdue.href).toBe("/companies/6?tab=renewals");
  });

  it("surfaces project signals: overdue milestone, high risk and at-risk project", () => {
    const reminders = evaluateReminders([], [], NOW, [], {
      milestones: [
        { id: 1, name: "Go-live", targetDate: "2026-07-10", projectId: 4, projectName: "Migración" },
        { id: 2, name: "Kickoff", targetDate: "2026-07-20", projectId: 4, projectName: "Migración" },
      ],
      risks: [
        { id: 3, title: "Proveedor sin contrato", projectId: 4, projectName: "Migración", createdAt: new Date("2026-07-15T00:00:00Z") },
      ],
      riskyProjects: [
        { id: 5, name: "ERP", folio: "PRJ-000002", healthStatus: "at_risk", status: "active", updatedAt: new Date("2026-07-15T00:00:00Z") },
      ],
    });
    const byKey = new Map(reminders.map((r) => [r.ruleKey, r]));
    expect(byKey.get("milestone_1")?.severity).toBe("high"); // overdue
    expect(byKey.get("milestone_2")?.severity).toBe("medium"); // upcoming
    expect(byKey.get("project_risk_3")?.severity).toBe("high");
    expect(byKey.get("project_at_risk_5")?.href).toBe("/projects/5");
    expect(byKey.get("milestone_1")?.entityType).toBe("project");
  });
});

describe("reminder marks: snooze / resolve / reappear", () => {
  // minutes: 30 keeps the missing_time rule out — we isolate one rule here
  const reminder = evaluateReminders(
    [ticket({ id: 10, status: "pending_confirmation", minutes: 30, updatedAt: new Date("2026-07-10T00:00:00Z") })],
    [],
    NOW,
  );

  it("snoozed hides until snoozedUntil, then shows again", () => {
    const snoozedActive = applyMarks(
      reminder,
      [{ ruleKey: "pending_confirmation_stale", entityType: "ticket", entityId: 10, status: "snoozed", snoozedUntil: new Date("2026-07-17T00:00:00Z"), actedAt: NOW }],
      NOW,
    );
    expect(snoozedActive).toHaveLength(0);
    const snoozeExpired = applyMarks(
      reminder,
      [{ ruleKey: "pending_confirmation_stale", entityType: "ticket", entityId: 10, status: "snoozed", snoozedUntil: new Date("2026-07-16T00:00:00Z"), actedAt: new Date("2026-07-15T00:00:00Z") }],
      NOW,
    );
    expect(snoozeExpired).toHaveLength(1);
  });

  it("resolved hides while the condition instance holds and reappears when it re-triggers", () => {
    const resolvedRecent = applyMarks(
      reminder,
      [{ ruleKey: "pending_confirmation_stale", entityType: "ticket", entityId: 10, status: "resolved", snoozedUntil: null, actedAt: new Date("2026-07-12T00:00:00Z") }],
      NOW,
    );
    expect(resolvedRecent).toHaveLength(0); // conditionSince (07-10) < actedAt (07-12)

    const reappeared = applyMarks(
      reminder,
      [{ ruleKey: "pending_confirmation_stale", entityType: "ticket", entityId: 10, status: "resolved", snoozedUntil: null, actedAt: new Date("2026-07-08T00:00:00Z") }],
      NOW,
    );
    expect(reappeared).toHaveLength(1); // condition re-triggered after the mark
  });
});

describe("Enfoque del día", () => {
  it("returns at most three, based on real counts, with impact and link", () => {
    const focus = buildFocus({
      dueToday: 2,
      overdue: 3,
      pendingConfirmation: 4,
      unassignedActivities: 2,
      unassignedTickets: 1,
      billingReview: 5,
      unansweredConversations: 1,
      slaAtRisk: 2,
    });
    expect(focus).toHaveLength(3);
    expect(focus[0].title).toContain("SLA en riesgo");
    for (const f of focus) {
      expect(f.impact.length).toBeGreaterThan(0);
      expect(f.href.startsWith("/")).toBe(true);
    }
  });
  it("is empty when there is nothing to recommend", () => {
    expect(
      buildFocus({
        dueToday: 0, overdue: 0, pendingConfirmation: 0, unassignedActivities: 0,
        unassignedTickets: 0, billingReview: 0, unansweredConversations: 0, slaAtRisk: 0,
      }),
    ).toEqual([]);
  });
});
