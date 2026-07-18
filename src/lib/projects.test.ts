import { describe, expect, it } from "vitest";
import {
  computeProgress,
  describeProjectAuditEvent,
  riskSeverity,
  subactivityBlockReason,
  suggestedHealth,
  wouldCreateDependencyCycle,
  type ProjectProgressInput,
} from "./projects";

const NOW = new Date("2026-07-17T12:00:00Z");

function progressInput(over: Partial<ProjectProgressInput> = {}): ProjectProgressInput {
  return {
    totalActivities: 10,
    completedActivities: 5,
    overdueActivities: 0,
    blockedActivities: 0,
    unassignedActivities: 0,
    milestonesTotal: 2,
    milestonesCompleted: 1,
    milestonesOverdue: 0,
    estimatedMinutes: 600,
    loggedMinutes: 300,
    openHighRisks: 0,
    targetDate: "2026-08-01",
    status: "active",
    now: NOW,
    ...over,
  };
}

describe("riskSeverity (deterministic matrix)", () => {
  it("covers the full probability × impact matrix", () => {
    expect(riskSeverity("low", "low")).toBe("low");
    expect(riskSeverity("low", "medium")).toBe("low");
    expect(riskSeverity("low", "high")).toBe("medium");
    expect(riskSeverity("low", "critical")).toBe("high");
    expect(riskSeverity("medium", "low")).toBe("low");
    expect(riskSeverity("medium", "medium")).toBe("medium");
    expect(riskSeverity("medium", "high")).toBe("high");
    expect(riskSeverity("medium", "critical")).toBe("critical");
    expect(riskSeverity("high", "low")).toBe("medium");
    expect(riskSeverity("high", "medium")).toBe("high");
    expect(riskSeverity("high", "high")).toBe("critical");
    expect(riskSeverity("high", "critical")).toBe("critical");
  });
});

describe("computeProgress", () => {
  it("percentage from completed/total, excluding nothing else", () => {
    expect(computeProgress(progressInput()).percent).toBe(50);
    expect(computeProgress(progressInput({ totalActivities: 0, completedActivities: 0 })).percent).toBe(0);
    expect(computeProgress(progressInput({ totalActivities: 3, completedActivities: 3 })).percent).toBe(100);
  });

  it("days remaining from target date; null without one", () => {
    expect(computeProgress(progressInput({ targetDate: "2026-07-20" })).daysRemaining).toBe(4);
    expect(computeProgress(progressInput({ targetDate: "2026-07-10" })).daysRemaining).toBeLessThan(0);
    expect(computeProgress(progressInput({ targetDate: null })).daysRemaining).toBeNull();
  });

  it("time deviation = logged - estimated; null without estimate", () => {
    expect(computeProgress(progressInput({ loggedMinutes: 700 })).timeDeviationMinutes).toBe(100);
    expect(
      computeProgress(progressInput({ estimatedMinutes: null })).timeDeviationMinutes,
    ).toBeNull();
  });
});

describe("suggestedHealth", () => {
  it("completed project → completed", () => {
    expect(suggestedHealth(progressInput({ status: "completed" }))).toBe("completed");
  });
  it("clean project → on_track", () => {
    expect(suggestedHealth(progressInput())).toBe("on_track");
  });
  it("some overdue or unassigned → attention", () => {
    expect(suggestedHealth(progressInput({ overdueActivities: 2 }))).toBe("attention");
    expect(suggestedHealth(progressInput({ unassignedActivities: 3 }))).toBe("attention");
  });
  it("overdue milestones, high risks or past target → at_risk", () => {
    expect(suggestedHealth(progressInput({ milestonesOverdue: 1 }))).toBe("at_risk");
    expect(suggestedHealth(progressInput({ openHighRisks: 1 }))).toBe("at_risk");
    expect(suggestedHealth(progressInput({ targetDate: "2026-07-01" }))).toBe("at_risk");
  });
  it("relevant time deviation (>20% of estimate) → at_risk", () => {
    expect(suggestedHealth(progressInput({ loggedMinutes: 800 }))).toBe("at_risk"); // +200 > 120
  });
  it("blocked activities on a held project → blocked", () => {
    expect(suggestedHealth(progressInput({ blockedActivities: 2, status: "on_hold" }))).toBe("blocked");
  });
});

describe("wouldCreateDependencyCycle", () => {
  const edges: Array<[number, number]> = [
    [1, 2], // 1 blocks 2
    [2, 3], // 2 blocks 3
  ];
  it("rejects self-dependency", () => {
    expect(wouldCreateDependencyCycle(edges, 5, 5)).toBe(true);
  });
  it("rejects a direct back-edge (3 would block 1 → cycle)", () => {
    expect(wouldCreateDependencyCycle(edges, 3, 1)).toBe(true);
  });
  it("rejects transitive cycles", () => {
    expect(wouldCreateDependencyCycle([...edges, [3, 4]], 4, 1)).toBe(true);
  });
  it("accepts acyclic additions", () => {
    expect(wouldCreateDependencyCycle(edges, 1, 3)).toBe(false); // redundant but not a cycle
    expect(wouldCreateDependencyCycle(edges, 3, 4)).toBe(false);
  });
});

describe("subactivityBlockReason (max depth 2)", () => {
  const base = {
    parentId: 10,
    childId: null,
    parentProjectId: 1,
    parentListId: 5,
    parentParentActivityId: null,
    parentConverted: false,
    parentArchived: false,
    childHasChildren: false,
  };
  it("valid parent → null", () => {
    expect(subactivityBlockReason(base)).toBeNull();
  });
  it("cannot hang an activity below itself", () => {
    expect(subactivityBlockReason({ ...base, childId: 10 })).toBe("self");
  });
  it("parent must belong to a project and list", () => {
    expect(subactivityBlockReason({ ...base, parentProjectId: null })).toBe("parent_not_in_project");
  });
  it("a subactivity cannot be a parent (no third level)", () => {
    expect(subactivityBlockReason({ ...base, parentParentActivityId: 3 })).toBe("parent_is_subactivity");
  });
  it("archived or converted parents are invalid", () => {
    expect(subactivityBlockReason({ ...base, parentArchived: true })).toBe("parent_inactive");
    expect(subactivityBlockReason({ ...base, parentConverted: true })).toBe("parent_inactive");
  });
  it("an activity with children cannot become a subactivity", () => {
    expect(subactivityBlockReason({ ...base, childId: 20, childHasChildren: true })).toBe(
      "child_has_children",
    );
  });
});

describe("describeProjectAuditEvent", () => {
  it("prefers lifecycle events", () => {
    expect(
      describeProjectAuditEvent({
        entityType: "project",
        action: "update",
        field: "status",
        metadata: { event: "completed_with_exception", pendingActivities: 2, reason: "cliente aprobó" },
      }),
    ).toBe("Se completó el proyecto con excepción (2 pendiente(s)): cliente aprobó.");
  });
  it("describes conversion as leaving the project", () => {
    expect(
      describeProjectAuditEvent({ entityType: "work_item", action: "convert", field: null, metadata: {} }),
    ).toBe("Una actividad se convirtió en ticket y salió del proyecto.");
  });
  it("falls back to field-level descriptions", () => {
    expect(
      describeProjectAuditEvent({
        entityType: "project",
        action: "update",
        field: "projectManagerId",
        metadata: null,
      }),
    ).toBe("Se actualizó Project Manager de el proyecto.");
  });
});
