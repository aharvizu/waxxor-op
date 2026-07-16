import { describe, expect, it } from "vitest";
import {
  ACTIVITY_STATUSES,
  ACTIVITY_TYPES,
  activityStatusSchema,
  activityTypeSchema,
  activityWorkflowStatusSchema,
  completedAtFor,
  isActivityStatus,
  restoredStatus,
} from "./activities";

describe("activity type and status validation", () => {
  it("exposes the twelve initial types", () => {
    expect(ACTIVITY_TYPES).toEqual([
      "general", "follow_up", "meeting", "research", "documentation",
      "training", "review", "implementation", "preventive",
      "administrative", "commercial", "reminder",
    ]);
    for (const t of ACTIVITY_TYPES) {
      expect(activityTypeSchema.safeParse(t).success).toBe(true);
    }
    expect(activityTypeSchema.safeParse("party").success).toBe(false);
  });

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
