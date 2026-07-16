import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { DbExecutor } from "@/db";
import { businessCalendars, slaDefinitions, tickets } from "@/db/schema";
import {
  addWorkingMinutes,
  remainingWorkingMinutes,
  type WorkCalendar,
} from "@/lib/business-time";
import { workItemPrioritySchema } from "@/lib/work-items";

/** SLA domain — see docs/features/sla.md. */

export const SLA_PAUSE_STATUSES = ["waiting_customer", "waiting_third_party"] as const;

export function isSlaPauseStatus(status: string): boolean {
  return (SLA_PAUSE_STATUSES as readonly string[]).includes(status);
}

export const slaDefinitionSchema = z.object({
  name: z.string("Name is required.").trim().min(1, "Name is required."),
  description: z
    .string()
    .optional()
    .transform((v) => (v ?? "").trim() || null),
  priority: workItemPrioritySchema,
  firstResponseMinutes: z.coerce
    .number("First response minutes are required.")
    .int()
    .min(1, "First response must be at least 1 minute."),
  resolutionMinutes: z.coerce
    .number("Resolution minutes are required.")
    .int()
    .min(1, "Resolution must be at least 1 minute."),
  businessHoursOnly: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  isDefault: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
});

export const calendarSchema = z.object({
  timezone: z
    .string("Timezone is required.")
    .trim()
    .refine((tz) => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, "Enter a valid IANA timezone (e.g. America/Mexico_City)."),
  workStartMinute: z.coerce.number().int().min(0).max(1439),
  workEndMinute: z.coerce.number().int().min(1).max(1440),
});

export type SlaSnapshot = {
  slaDefinitionId: number;
  slaName: string;
  slaFirstResponseMinutes: number;
  slaResolutionMinutes: number;
  slaBusinessHoursOnly: boolean;
  slaTimezone: string;
  slaCalendar: WorkCalendar;
  firstResponseTargetAt: Date;
  resolutionTargetAt: Date;
};

const DEFAULT_CALENDAR: WorkCalendar = {
  timezone: "America/Mexico_City",
  workDays: [1, 2, 3, 4, 5],
  startMinute: 540,
  endMinute: 1080,
};

/** The org's work calendar, or the default when none is configured yet. */
export async function getOrgCalendar(
  tx: DbExecutor,
  organizationId: number,
): Promise<WorkCalendar> {
  const [row] = await tx
    .select()
    .from(businessCalendars)
    .where(eq(businessCalendars.organizationId, organizationId));
  if (!row) return DEFAULT_CALENDAR;
  return {
    timezone: row.timezone,
    workDays: (row.workDays as number[]) ?? [1, 2, 3, 4, 5],
    startMinute: row.workStartMinute,
    endMinute: row.workEndMinute,
  };
}

/**
 * Assignment cascade (PRD R7 context): explicit active definition (SuperAdmin
 * choice) → active default for the priority → none.
 */
export async function resolveSlaDefinition(
  tx: DbExecutor,
  organizationId: number,
  priority: (typeof slaDefinitions.priority.enumValues)[number],
  explicitId?: number | null,
) {
  if (explicitId) {
    const [explicit] = await tx
      .select()
      .from(slaDefinitions)
      .where(
        and(
          eq(slaDefinitions.id, explicitId),
          eq(slaDefinitions.organizationId, organizationId),
          eq(slaDefinitions.status, "active"),
        ),
      );
    if (explicit) return explicit;
  }
  const [fallback] = await tx
    .select()
    .from(slaDefinitions)
    .where(
      and(
        eq(slaDefinitions.organizationId, organizationId),
        eq(slaDefinitions.priority, priority),
        eq(slaDefinitions.isDefault, true),
        eq(slaDefinitions.status, "active"),
      ),
    );
  return fallback ?? null;
}

/** Freeze a definition + calendar into ticket snapshot columns. Pure given inputs. */
export function buildSlaSnapshot(
  definition: typeof slaDefinitions.$inferSelect,
  calendar: WorkCalendar,
  startAt: Date,
): SlaSnapshot {
  const cal = definition.businessHoursOnly ? calendar : null;
  return {
    slaDefinitionId: definition.id,
    slaName: definition.name,
    slaFirstResponseMinutes: definition.firstResponseMinutes,
    slaResolutionMinutes: definition.resolutionMinutes,
    slaBusinessHoursOnly: definition.businessHoursOnly,
    slaTimezone: calendar.timezone,
    slaCalendar: calendar,
    firstResponseTargetAt: addWorkingMinutes(startAt, definition.firstResponseMinutes, cal),
    resolutionTargetAt: addWorkingMinutes(startAt, definition.resolutionMinutes, cal),
  };
}

/** Visual thresholds (spec): >25% normal · ≤25% at risk · ≤10% critical · past due overdue. */
export type SlaHealth = "met" | "breached" | "overdue" | "critical" | "at_risk" | "normal";

export function slaHealth(params: {
  now: Date;
  targetAt: Date;
  totalMinutes: number;
  fulfilledAt: Date | null;
  cal: WorkCalendar | null;
}): { health: SlaHealth; remainingMinutes: number } {
  const { now, targetAt, totalMinutes, fulfilledAt, cal } = params;
  if (fulfilledAt) {
    return {
      health: fulfilledAt.getTime() <= targetAt.getTime() ? "met" : "breached",
      remainingMinutes: 0,
    };
  }
  const remaining = remainingWorkingMinutes(now, targetAt, cal);
  const pct = totalMinutes > 0 ? remaining / totalMinutes : 0;
  let health: SlaHealth = "normal";
  if (remaining < 0) health = "overdue";
  else if (pct <= 0.1) health = "critical";
  else if (pct <= 0.25) health = "at_risk";
  return { health, remainingMinutes: remaining };
}

/** Ticket snapshot columns → the calendar to compute with (null = 24/7 SLA). */
export function ticketCalendar(
  ticket: Pick<typeof tickets.$inferSelect, "slaBusinessHoursOnly" | "slaCalendar">,
): WorkCalendar | null {
  if (!ticket.slaBusinessHoursOnly) return null;
  return (ticket.slaCalendar as WorkCalendar) ?? DEFAULT_CALENDAR;
}
