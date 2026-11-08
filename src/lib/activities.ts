import { z } from "zod";
import type { TicketStatusCategoryValue } from "@/lib/ticket-catalogs";

/** Domain constants and pure rules for Activities — see docs/features/activities.md. */

/**
 * Activity type is a catalog (Settings → Actividades → Tipos de trabajo,
 * catalog_items kind "time_entry_type" — shared with time-entry types since
 * 2026-07-30, previously its own "activity_type" kind), not an enum — see
 * getCatalogNames. Validated per-org at the action layer, not with a static
 * Zod enum.
 */

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

/**
 * Where each Activity status sits in the **shared** status vocabulary — the
 * same six semantic categories the org-configurable ticket catalog uses
 * (`ticket_statuses.category`, see TICKET_STATUS_CATEGORIES). This is the one
 * contract that lets Activities and Tickets be read side by side without
 * merging the two mechanisms: tickets keep their configurable 11-status
 * catalog, activities keep their fixed 7, and both still answer "what stage is
 * this in?" the same way (2026-11-08, groundwork for the combined Work view).
 *
 * The type is imported, not redeclared, so removing a category from the ticket
 * catalog breaks this map at compile time instead of silently drifting.
 *
 * Two mappings are deliberately lossy, and the row's own status badge still
 * shows the precise value:
 * - `blocked` → `waiting`: both mean "not progressing"; there is no blocked
 *   category, and inventing one would only exist for activities.
 * - `completed`/`archived` → `closed`: an activity's end state is final, with
 *   no confirmation step, so it never belongs in `resolved` (which for a
 *   ticket means "done but not confirmed yet"). The `resolved` category
 *   therefore only ever holds tickets, which is honest rather than a gap.
 */
export const ACTIVITY_STATUS_CATEGORY: Record<ActivityStatus, TicketStatusCategoryValue> = {
  pending: "open",
  in_progress: "in_progress",
  waiting: "waiting",
  blocked: "waiting",
  completed: "closed",
  cancelled: "cancelled",
  archived: "closed",
};

/** Activity statuses that are over and done with — the combined Work view hides them by default. */
export const TERMINAL_ACTIVITY_STATUSES = ACTIVITY_STATUSES.filter(
  (s) => ACTIVITY_STATUS_CATEGORY[s] === "closed" || ACTIVITY_STATUS_CATEGORY[s] === "cancelled",
);

/** Statuses a user can set directly — archived only via archive/restore actions. */
export const ACTIVITY_WORKFLOW_STATUSES = ACTIVITY_STATUSES.filter(
  (s) => s !== "archived",
);

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
