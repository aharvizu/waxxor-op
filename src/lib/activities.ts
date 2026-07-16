import { z } from "zod";
import { activities } from "@/db/schema";

/** Domain constants and pure rules for Activities — see docs/features/activities.md. */

export const ACTIVITY_TYPES = activities.activityType.enumValues;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** Activity subset of the shared work_item_status enum. */
export const ACTIVITY_STATUSES = [
  "pending",
  "in_progress",
  "waiting",
  "blocked",
  "completed",
  "cancelled",
  "archived",
] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

/** Statuses a user can set directly — archived only via archive/restore actions. */
export const ACTIVITY_WORKFLOW_STATUSES = ACTIVITY_STATUSES.filter(
  (s) => s !== "archived",
);

export const activityTypeSchema = z.enum(ACTIVITY_TYPES);
export const activityStatusSchema = z.enum(ACTIVITY_STATUSES);
export const activityWorkflowStatusSchema = z.enum(
  ACTIVITY_WORKFLOW_STATUSES as [ActivityStatus, ...ActivityStatus[]],
);

export function isActivityStatus(value: unknown): value is ActivityStatus {
  return (
    typeof value === "string" &&
    (ACTIVITY_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * completedAt rule: set when entering "completed", cleared when leaving it.
 * Returns undefined when the transition doesn't touch completedAt.
 */
export function completedAtFor(
  nextStatus: ActivityStatus,
  currentCompletedAt: Date | null,
): Date | null | undefined {
  if (nextStatus === "completed") {
    return currentCompletedAt ?? new Date();
  }
  return currentCompletedAt !== null ? null : undefined;
}

/** Restoring an archived activity: completed ones come back completed, the rest pending. */
export function restoredStatus(completedAt: Date | null): ActivityStatus {
  return completedAt ? "completed" : "pending";
}
