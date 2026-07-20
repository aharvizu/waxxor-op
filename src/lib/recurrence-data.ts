import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  companies,
  projects,
  recurrenceDefinitions,
  recurrenceExecutions,
  users,
} from "@/db/schema";
import {
  computeNextRun,
  describeSchedule,
  nextOccurrencesLocal,
  occurrenceRunAt,
  type ScheduleFields,
} from "@/lib/recurrence";

/**
 * Data layer for Recurrences. Aggregates as single-pass SQL (correlated
 * subqueries); previews are computed in memory from typed schedule columns
 * (no DB round-trip per occurrence).
 */

function toSchedule(def: typeof recurrenceDefinitions.$inferSelect): ScheduleFields {
  return {
    frequency: def.frequency,
    interval: def.interval,
    daysOfWeek: (def.daysOfWeek as number[] | null) ?? null,
    dayOfMonth: def.dayOfMonth,
    monthOfYear: def.monthOfYear,
    weekOfMonth: def.weekOfMonth,
    timeOfDay: def.timeOfDay,
    timezone: def.timezone,
    startAt: def.startAt,
    endAt: def.endAt,
  };
}

/** Next `count` occurrences (date + UTC instant) for preview — never writes anything. */
export function upcomingOccurrences(def: typeof recurrenceDefinitions.$inferSelect, count = 5) {
  const schedule = toSchedule(def);
  const next = computeNextRun(schedule, new Date());
  if (!next) return [];
  const locals = [next.local, ...nextOccurrencesLocal(schedule, next.local, count - 1)];
  return locals.map((local) => ({ local, runAt: occurrenceRunAt(schedule, local) }));
}

export async function getRecurrenceDetail(orgId: number, id: number) {
  const [row] = await db
    .select({
      def: recurrenceDefinitions,
      companyName: companies.name,
      clientStatus: companies.status,
      projectName: projects.name,
      projectStatus: projects.status,
      assigneeName: users.name,
      creatorName: sql<string | null>`(select u.name from users u where u.id = ${recurrenceDefinitions.createdById})`,
    })
    .from(recurrenceDefinitions)
    .leftJoin(companies, eq(recurrenceDefinitions.companyId, companies.id))
    .leftJoin(projects, eq(recurrenceDefinitions.projectId, projects.id))
    .leftJoin(users, eq(recurrenceDefinitions.assigneeId, users.id))
    .where(and(eq(recurrenceDefinitions.id, id), eq(recurrenceDefinitions.organizationId, orgId)));
  return row ?? null;
}

export async function getRecurrenceExecutions(
  orgId: number,
  definitionId: number,
  opts: { limit?: number; status?: string } = {},
) {
  const conditions = [
    eq(recurrenceExecutions.organizationId, orgId),
    eq(recurrenceExecutions.recurrenceDefinitionId, definitionId),
  ];
  if (opts.status) conditions.push(eq(recurrenceExecutions.status, opts.status as never));
  return db
    .select({ exec: recurrenceExecutions, executorName: users.name })
    .from(recurrenceExecutions)
    .leftJoin(users, eq(recurrenceExecutions.executedByUserId, users.id))
    .where(and(...conditions))
    .orderBy(desc(recurrenceExecutions.scheduledFor))
    .limit(opts.limit ?? 50);
}

/** Real-time success rate + terminal counts — computed, never stored beyond the raw counters. */
export function successRate(def: typeof recurrenceDefinitions.$inferSelect): number | null {
  const attempted = def.successfulCount + def.failedCount;
  if (attempted === 0) return null;
  return Math.round((def.successfulCount / attempted) * 100);
}

/* --------------------------------------------------------- Today integration */

export type RecurrenceSignal = {
  id: number;
  name: string;
  status: string;
  reason: "failed" | "overdue" | "no_assignee" | "invalid_context" | "expiring_soon";
  detail: string;
  companyId: number | null;
};

/**
 * Per-user recurrence signals for Hoy — bounded to recurrences the user
 * created or is assigned to, never a full-table scan.
 */
export async function getUserRecurrenceSignals(orgId: number, userId: number): Promise<RecurrenceSignal[]> {
  const now = new Date();
  const rows = await db
    .select()
    .from(recurrenceDefinitions)
    .where(
      and(
        eq(recurrenceDefinitions.organizationId, orgId),
        isNull(recurrenceDefinitions.archivedAt),
        or(eq(recurrenceDefinitions.assigneeId, userId), eq(recurrenceDefinitions.createdById, userId)),
        or(
          eq(recurrenceDefinitions.status, "active"),
          eq(recurrenceDefinitions.status, "error"),
        ),
      ),
    )
    .limit(100);

  const out: RecurrenceSignal[] = [];
  for (const def of rows) {
    if (def.status === "error") {
      out.push({
        id: def.id,
        name: def.name,
        status: def.status,
        reason: "failed",
        detail: `${def.consecutiveFailedCount} fallo(s) consecutivo(s) — pausada automáticamente.`,
        companyId: def.companyId,
      });
      continue;
    }
    if (def.nextRunAt && def.nextRunAt.getTime() < now.getTime()) {
      out.push({
        id: def.id,
        name: def.name,
        status: def.status,
        reason: "overdue",
        detail: "Vencida sin procesar por el programador.",
        companyId: def.companyId,
      });
    }
    if (def.targetType !== "activity" && !def.assigneeId) {
      out.push({
        id: def.id,
        name: def.name,
        status: def.status,
        reason: "no_assignee",
        detail: "Sin responsable configurado.",
        companyId: def.companyId,
      });
    }
    if (def.endAt) {
      const daysLeft = Math.ceil(
        (new Date(`${def.endAt}T23:59:59Z`).getTime() - now.getTime()) / 86_400_000,
      );
      if (daysLeft >= 0 && daysLeft <= 14) {
        out.push({
          id: def.id,
          name: def.name,
          status: def.status,
          reason: "expiring_soon",
          detail: `Termina el ${def.endAt}.`,
          companyId: def.companyId,
        });
      }
    }
  }
  return out;
}

/** Org-wide counts for Today's daily summary — cheap aggregate, no row hydration. */
export async function getRecurrenceSummary(orgId: number) {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(now);
  endOfDay.setUTCHours(23, 59, 59, 999);
  const [row] = await db
    .select({
      scheduledToday: sql<number>`count(*) filter (where ${recurrenceDefinitions.status} = 'active'
        and ${recurrenceDefinitions.nextRunAt} between ${startOfDay} and ${endOfDay})::int`,
      inError: sql<number>`count(*) filter (where ${recurrenceDefinitions.status} = 'error')::int`,
      generatedToday: sql<number>`(select count(*)::int from ${recurrenceExecutions} e
        where e.organization_id = ${orgId} and e.status = 'succeeded'
        and e.completed_at between ${startOfDay} and ${endOfDay})`,
    })
    .from(recurrenceDefinitions)
    .where(
      and(
        eq(recurrenceDefinitions.organizationId, orgId),
        isNull(recurrenceDefinitions.archivedAt),
      ),
    );
  return row;
}

/* ----------------------------------------------------- Client 360 integration */

export async function getClientRecurrences(orgId: number, companyId: number) {
  return db
    .select({ def: recurrenceDefinitions, assigneeName: users.name })
    .from(recurrenceDefinitions)
    .leftJoin(users, eq(recurrenceDefinitions.assigneeId, users.id))
    .where(
      and(
        eq(recurrenceDefinitions.organizationId, orgId),
        eq(recurrenceDefinitions.companyId, companyId),
        isNull(recurrenceDefinitions.archivedAt),
      ),
    )
    .orderBy(desc(recurrenceDefinitions.updatedAt));
}

/* ------------------------------------------------------- Project integration */

export async function getProjectRecurrences(orgId: number, projectId: number) {
  return db
    .select({ def: recurrenceDefinitions, assigneeName: users.name })
    .from(recurrenceDefinitions)
    .leftJoin(users, eq(recurrenceDefinitions.assigneeId, users.id))
    .where(
      and(
        eq(recurrenceDefinitions.organizationId, orgId),
        eq(recurrenceDefinitions.projectId, projectId),
        isNull(recurrenceDefinitions.archivedAt),
      ),
    )
    .orderBy(desc(recurrenceDefinitions.updatedAt));
}

export { describeSchedule, toSchedule };
