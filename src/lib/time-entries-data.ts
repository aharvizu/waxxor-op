import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { timeEntries, users } from "@/db/schema";

/**
 * Server data layer for time entries, kept **separate from `lib/time-entries`**
 * on purpose: that module is pure and `formatMinutes` is imported by a dozen
 * client components (Indicadores' panels, the projects table, Hoy…), so adding
 * a `db` import there would drag drizzle into their browser bundles.
 *
 * Totals are always computed from the table, never stored on the work item
 * (see docs/features/time-entries.md).
 */

export type WorkItemTimeLogEntry = {
  id: number;
  date: string;
  durationMinutes: number;
  timeType: string;
  billingStatus: string;
  modality: string;
  description: string;
  userName: string | null;
};

export type WorkItemTimeLog = {
  /** Non-voided entries, newest first, capped at the requested limit. */
  entries: WorkItemTimeLogEntry[];
  /** How many non-voided entries exist in total — `entries` may be a slice of them. */
  entryCount: number;
  totalMinutes: number;
  billableMinutes: number;
  /** Voided entries are excluded from every number above; surfaced as a count so the omission is visible. */
  voidedCount: number;
};

/**
 * The time log for one work item — activity or ticket alike, since
 * `time_entries` hangs off `work_items.id`, which is also why a conversion
 * keeps its history attached.
 *
 * Totals cover every non-voided entry even when `limit` trims the list, so a
 * capped log never reports less time than was actually logged.
 */
export async function getWorkItemTimeLog(
  orgId: number,
  workItemId: number,
  limit = 8,
): Promise<WorkItemTimeLog> {
  const rows = await db
    .select({
      id: timeEntries.id,
      date: timeEntries.date,
      durationMinutes: timeEntries.durationMinutes,
      timeType: timeEntries.timeType,
      billingStatus: timeEntries.billingStatus,
      modality: timeEntries.modality,
      description: timeEntries.description,
      voidedAt: timeEntries.voidedAt,
      userName: users.name,
    })
    .from(timeEntries)
    .leftJoin(users, eq(timeEntries.userId, users.id))
    .where(and(eq(timeEntries.workItemId, workItemId), eq(timeEntries.organizationId, orgId)))
    .orderBy(desc(timeEntries.date), desc(timeEntries.id));

  const active = rows.filter((r) => r.voidedAt === null);
  return {
    // voidedAt is dropped from the returned shape: everything here is active by
    // construction, so carrying a column that is always null would invite a
    // caller to re-filter on it.
    entries: active.slice(0, limit).map((r) => ({
      id: r.id,
      date: r.date,
      durationMinutes: r.durationMinutes,
      timeType: r.timeType,
      billingStatus: r.billingStatus,
      modality: r.modality,
      description: r.description,
      userName: r.userName,
    })),
    entryCount: active.length,
    totalMinutes: active.reduce((sum, r) => sum + r.durationMinutes, 0),
    billableMinutes: active
      .filter((r) => r.billingStatus === "billable")
      .reduce((sum, r) => sum + r.durationMinutes, 0),
    voidedCount: rows.length - active.length,
  };
}
