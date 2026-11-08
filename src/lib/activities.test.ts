import { describe, expect, it } from "vitest";
import {
  ACTIVITY_STATUS_CATEGORY,
  ACTIVITY_STATUSES,
  TERMINAL_ACTIVITY_STATUSES,
  activityStatusSchema,
  activityWorkflowStatusSchema,
  completedAtFor,
  isActivityStatus,
  restoredStatus,
} from "./activities";

describe("activity type and status validation", () => {
  it("exposes the seven initial statuses", () => {
    expect(ACTIVITY_STATUSES).toEqual([
      "pending", "in_progress", "waiting", "blocked",
      "completed", "cancelled", "archived",
    ]);
    for (const s of ACTIVITY_STATUSES) expect(isActivityStatus(s)).toBe(true);
    expect(isActivityStatus("open")).toBe(false); // ticket status, not activity
    expect(activityStatusSchema.safeParse("resolved").success).toBe(false);
  });

  it("workflow schema rejects archived (only archive/restore set it)", () => {
    expect(activityWorkflowStatusSchema.safeParse("blocked").success).toBe(true);
    expect(activityWorkflowStatusSchema.safeParse("archived").success).toBe(false);
  });
});

describe("completedAt rule", () => {
  it("sets completedAt when completing", () => {
    const v = completedAtFor("completed", null);
    expect(v).toBeInstanceOf(Date);
  });

  it("keeps the original completedAt when already completed", () => {
    const original = new Date("2026-01-01T00:00:00Z");
    expect(completedAtFor("completed", original)).toBe(original);
  });

  it("clears completedAt when reopening a completed activity", () => {
    expect(completedAtFor("pending", new Date())).toBeNull();
    expect(completedAtFor("in_progress", new Date())).toBeNull();
  });

  it("does not touch completedAt on transitions between open states", () => {
    expect(completedAtFor("blocked", null)).toBeUndefined();
    expect(completedAtFor("waiting", null)).toBeUndefined();
  });
});

describe("restore rule", () => {
  it("restores completed activities as completed", () => {
    expect(restoredStatus(new Date())).toBe("completed");
  });
  it("restores everything else as pending", () => {
    expect(restoredStatus(null)).toBe("pending");
  });
});

describe("shared status vocabulary", () => {
  it("maps every activity status into a category, with none left out", () => {
    // Total over the enum: a status added later without a category would be
    // invisible in the combined Work view's Kanban.
    for (const status of ACTIVITY_STATUSES) {
      expect(ACTIVITY_STATUS_CATEGORY[status]).toBeTruthy();
    }
    expect(Object.keys(ACTIVITY_STATUS_CATEGORY).sort()).toEqual([...ACTIVITY_STATUSES].sort());
  });

  it("keeps the working stages distinguishable", () => {
    expect(ACTIVITY_STATUS_CATEGORY.pending).toBe("open");
    expect(ACTIVITY_STATUS_CATEGORY.in_progress).toBe("in_progress");
    // blocked collapses into waiting on purpose — both mean "not progressing",
    // and the row's own badge still says "Bloqueada".
    expect(ACTIVITY_STATUS_CATEGORY.waiting).toBe("waiting");
    expect(ACTIVITY_STATUS_CATEGORY.blocked).toBe("waiting");
  });

  it("never puts an activity in `resolved`, which means unconfirmed for a ticket", () => {
    // An activity's end state is final: no confirmation step exists for it.
    for (const status of ACTIVITY_STATUSES) {
      expect(ACTIVITY_STATUS_CATEGORY[status]).not.toBe("resolved");
    }
    expect(ACTIVITY_STATUS_CATEGORY.completed).toBe("closed");
    expect(ACTIVITY_STATUS_CATEGORY.archived).toBe("closed");
    expect(ACTIVITY_STATUS_CATEGORY.cancelled).toBe("cancelled");
  });

  it("derives the terminal set from the categories, not a second hand-kept list", () => {
    expect([...TERMINAL_ACTIVITY_STATUSES].sort()).toEqual(["archived", "cancelled", "completed"]);
  });
});
