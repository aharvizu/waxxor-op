import { and, eq, gte, isNull, lte, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  activities,
  clients,
  messages,
  projects,
  recurrenceExecutions,
  tickets,
  timeEntries,
  users,
  workItems,
} from "@/db/schema";
import { zonedTimeToUtc, type LocalDate } from "@/lib/recurrence";
import { ORG_TIMEZONE } from "@/lib/reports";

/**
 * THE central metrics layer: one place computes every number that Reports
 * snapshot and Indicators display — formulas never live in components.
 * Temporal criteria (documented, spec §9):
 *   - tickets created  → work_items.created_at
 *   - tickets closed   → tickets.closed_at
 *   - time             → time_entries.date (local date, no tz drift)
 *   - messages         → messages.occurred_at
 *   - SLA              → final flags frozen at close (sla_*_met) of tickets closed in period
 * Period boundaries are the org-timezone day edges converted to UTC instants.
 * See docs/architecture/analytics-queries.md.
 */

export type MetricsScope = {
  clientId?: number | null;
  projectId?: number | null;
  userId?: number | null;
};

export type Period = { start: LocalDate; end: LocalDate };

export function periodBounds(period: Period, timezone = ORG_TIMEZONE): { from: Date; to: Date } {
  return {
    from: zonedTimeToUtc(period.start, "00:00", timezone),
    to: new Date(zonedTimeToUtc(period.end, "23:59", timezone).getTime() + 59_999),
  };
}

const int = (expr: SQL<unknown>) => sql<number>`coalesce(${expr}, 0)::int`;

function scopeWork(scope: MetricsScope): SQL[] {
  const conds: SQL[] = [];
  if (scope.clientId) conds.push(sql`${workItems.clientId} = ${scope.clientId}`);
  if (scope.userId) conds.push(sql`${workItems.assigneeId} = ${scope.userId}`);
  return conds;
}

/* -------------------------------------------------------------------- tickets */

export async function ticketMetrics(orgId: number, period: Period, scope: MetricsScope = {}) {
  const { from, to } = periodBounds(period);
  const base = and(
    eq(workItems.organizationId, orgId),
    eq(workItems.type, "ticket"),
    ...scopeWork(scope),
  );
  const [row] = await db
    .select({
      created: int(sql`count(*) filter (where ${workItems.createdAt} between ${from} and ${to})`),
      closed: int(sql`count(*) filter (where ${tickets.closedAt} between ${from} and ${to})`),
      cancelled: int(
        sql`count(*) filter (where ${workItems.status} = 'cancelled' and ${workItems.updatedAt} between ${from} and ${to})`,
      ),
      reopened: int(sql`count(*) filter (where ${tickets.lastReopenedAt} between ${from} and ${to})`),
      openAtEnd: int(
        sql`count(*) filter (where ${workItems.createdAt} <= ${to}
          and (${tickets.closedAt} is null or ${tickets.closedAt} > ${to})
          and ${workItems.status} != 'cancelled')`,
      ),
      overdueNow: int(
        sql`count(*) filter (where ${workItems.status} in ('new','assigned','in_progress','scheduled','reopened')
          and ${tickets.resolutionTargetAt} < now() and ${tickets.slaPausedAt} is null)`,
      ),
      pendingConfirmation: int(sql`count(*) filter (where ${workItems.status} = 'pending_confirmation')`),
      billableClosed: int(
        sql`count(*) filter (where ${tickets.closedAt} between ${from} and ${to}
          and ${tickets.billingStatus} in ('billable','contract_overage'))`,
      ),
      avgFirstResponseMinutes: sql<number | null>`round(avg(
        extract(epoch from (${tickets.firstResponseAt} - ${workItems.createdAt})) / 60
      ) filter (where ${tickets.firstResponseAt} between ${from} and ${to}))::int`,
      avgResolutionMinutes: sql<number | null>`round(avg(
        extract(epoch from (${tickets.resolvedAt} - ${workItems.createdAt})) / 60
      ) filter (where ${tickets.resolvedAt} between ${from} and ${to}))::int`,
    })
    .from(tickets)
    .innerJoin(workItems, eq(tickets.workItemId, workItems.id))
    .where(base);

  const byDimension = (dim: SQL) =>
    db
      .select({
        key: sql<string>`coalesce(${dim}, '—')`,
        created: int(sql`count(*) filter (where ${workItems.createdAt} between ${from} and ${to})`),
        closed: int(sql`count(*) filter (where ${tickets.closedAt} between ${from} and ${to})`),
      })
      .from(tickets)
      .innerJoin(workItems, eq(tickets.workItemId, workItems.id))
      .where(
        and(
          base,
          sql`(${workItems.createdAt} between ${from} and ${to} or ${tickets.closedAt} between ${from} and ${to})`,
        ),
      )
      .groupBy(sql`1`)
      .orderBy(sql`2 desc`)
      .limit(12);

  const [byStatus, byPriority, byCategory, byAssignee, topByTime] = await Promise.all([
    byDimension(sql`${workItems.status}::text`),
    byDimension(sql`${workItems.priority}::text`),
    byDimension(sql`${tickets.category}`),
    db
      .select({
        key: sql<string>`coalesce(${users.name}, 'Sin asignar')`,
        created: int(sql`count(*) filter (where ${workItems.createdAt} between ${from} and ${to})`),
        closed: int(sql`count(*) filter (where ${tickets.closedAt} between ${from} and ${to})`),
      })
      .from(tickets)
      .innerJoin(workItems, eq(tickets.workItemId, workItems.id))
      .leftJoin(users, eq(workItems.assigneeId, users.id))
      .where(
        and(
          base,
          sql`(${workItems.createdAt} between ${from} and ${to} or ${tickets.closedAt} between ${from} and ${to})`,
        ),
      )
      .groupBy(sql`1`)
      .orderBy(sql`2 desc`)
      .limit(12),
    db
      .select({
        folio: tickets.folio,
        title: workItems.title,
        minutes: int(sql`(select sum(te.duration_minutes) from ${timeEntries} te
          where te.work_item_id = ${workItems.id} and te.voided_at is null)`),
      })
      .from(tickets)
      .innerJoin(workItems, eq(tickets.workItemId, workItems.id))
      .where(and(base, sql`${workItems.createdAt} between ${from} and ${to}`))
      .orderBy(sql`3 desc`)
      .limit(5),
  ]);
  return { ...row, byStatus, byPriority, byCategory, byAssignee, topByTime };
}

/* ------------------------------------------------------------------------ SLA */

/**
 * SLA Compliance formula (documented, spec §25):
 *   numerator = closed-in-period tickets with final flag met
 *   denominator = closed-in-period tickets with a final flag recorded
 * Cancelled tickets and tickets without an SLA snapshot are excluded by
 * construction (they never get final flags).
 */
export async function slaMetrics(orgId: number, period: Period, scope: MetricsScope = {}) {
  const { from, to } = periodBounds(period);
  const base = and(
    eq(workItems.organizationId, orgId),
    eq(workItems.type, "ticket"),
    sql`${tickets.closedAt} between ${from} and ${to}`,
    ...scopeWork(scope),
  );
  const [row] = await db
    .select({
      evaluatedFirstResponse: int(sql`count(*) filter (where ${tickets.slaFirstResponseMet} is not null)`),
      metFirstResponse: int(sql`count(*) filter (where ${tickets.slaFirstResponseMet})`),
      evaluatedResolution: int(sql`count(*) filter (where ${tickets.slaResolutionMet} is not null)`),
      metResolution: int(sql`count(*) filter (where ${tickets.slaResolutionMet})`),
      excludedNoSla: int(sql`count(*) filter (where ${tickets.slaResolutionMet} is null)`),
      pausedMinutesTotal: int(sql`sum(${tickets.slaPausedMinutes})`),
      timeExceptions: int(sql`count(*) filter (where ${tickets.timeExceptionAt} is not null)`),
    })
    .from(tickets)
    .innerJoin(workItems, eq(tickets.workItemId, workItems.id))
    .where(base);
  const byPriority = await db
    .select({
      key: sql<string>`${workItems.priority}::text`,
      evaluated: int(sql`count(*) filter (where ${tickets.slaResolutionMet} is not null)`),
      met: int(sql`count(*) filter (where ${tickets.slaResolutionMet})`),
    })
    .from(tickets)
    .innerJoin(workItems, eq(tickets.workItemId, workItems.id))
    .where(base)
    .groupBy(sql`1`);
  const evaluated = row.evaluatedResolution;
  const met = row.metResolution;
  return {
    ...row,
    evaluated,
    met,
    compliancePct: evaluated > 0 ? Math.round((met / evaluated) * 100) : null,
    firstResponsePct:
      row.evaluatedFirstResponse > 0
        ? Math.round((row.metFirstResponse / row.evaluatedFirstResponse) * 100)
        : null,
    byPriority,
  };
}

/* ------------------------------------------------------------------ activities */

export async function activityMetrics(orgId: number, period: Period, scope: MetricsScope = {}) {
  const { from, to } = periodBounds(period);
  const base = and(
    eq(workItems.organizationId, orgId),
    eq(workItems.type, "activity"),
    isNull(activities.convertedAt),
    ...scopeWork(scope),
    ...(scope.projectId ? [sql`${activities.projectId} = ${scope.projectId}`] : []),
  );
  const [row] = await db
    .select({
      created: int(sql`count(*) filter (where ${workItems.createdAt} between ${from} and ${to})`),
      completed: int(sql`count(*) filter (where ${workItems.completedAt} between ${from} and ${to})`),
      openNow: int(sql`count(*) filter (where ${workItems.status} in ('pending','in_progress','waiting','blocked'))`),
      overdueNow: int(
        sql`count(*) filter (where ${workItems.status} in ('pending','in_progress','waiting','blocked')
          and ${workItems.dueDate} < current_date)`,
      ),
      unassignedNow: int(
        sql`count(*) filter (where ${workItems.status} in ('pending','in_progress','waiting','blocked')
          and ${workItems.assigneeId} is null)`,
      ),
      relatedToTickets: int(
        sql`count(*) filter (where ${activities.parentTicketId} is not null
          and ${workItems.createdAt} between ${from} and ${to})`,
      ),
      inProjects: int(
        sql`count(*) filter (where ${activities.projectId} is not null
          and ${workItems.createdAt} between ${from} and ${to})`,
      ),
    })
    .from(activities)
    .innerJoin(workItems, eq(activities.workItemId, workItems.id))
    .where(base);
  const byType = await db
    .select({
      key: sql<string>`${activities.activityType}::text`,
      created: int(sql`count(*) filter (where ${workItems.createdAt} between ${from} and ${to})`),
      completed: int(sql`count(*) filter (where ${workItems.completedAt} between ${from} and ${to})`),
    })
    .from(activities)
    .innerJoin(workItems, eq(activities.workItemId, workItems.id))
    .where(
      and(base, sql`(${workItems.createdAt} between ${from} and ${to} or ${workItems.completedAt} between ${from} and ${to})`),
    )
    .groupBy(sql`1`)
    .orderBy(sql`2 desc`)
    .limit(12);
  return { ...row, byType };
}

/* -------------------------------------------------------------------- projects */

export async function projectMetrics(orgId: number, period: Period, scope: MetricsScope = {}) {
  const { from, to } = periodBounds(period);
  const conds = [eq(projects.organizationId, orgId)];
  if (scope.clientId) conds.push(eq(projects.clientId, scope.clientId));
  if (scope.projectId) conds.push(eq(projects.id, scope.projectId));
  const [row] = await db
    .select({
      active: int(sql`count(*) filter (where ${projects.status} in ('planning','active','on_hold','at_risk'))`),
      completedInPeriod: int(sql`count(*) filter (where ${projects.completedAt} between ${from} and ${to})`),
      atRisk: int(sql`count(*) filter (where ${projects.status} = 'at_risk' or ${projects.healthStatus} in ('at_risk','blocked'))`),
      overdue: int(
        sql`count(*) filter (where ${projects.status} in ('planning','active','on_hold','at_risk')
          and ${projects.targetDate} < current_date)`,
      ),
      milestonesOverdue: int(sql`(select count(*) from project_milestones m
        join projects p2 on p2.id = m.project_id
        where p2.organization_id = ${orgId}
        ${scope.clientId ? sql`and p2.client_id = ${scope.clientId}` : sql``}
        ${scope.projectId ? sql`and p2.id = ${scope.projectId}` : sql``}
        and m.status in ('pending','in_progress','delayed') and m.target_date < current_date)`),
      highRisks: int(sql`(select count(*) from project_risks r
        join projects p3 on p3.id = r.project_id
        where p3.organization_id = ${orgId}
        ${scope.clientId ? sql`and p3.client_id = ${scope.clientId}` : sql``}
        ${scope.projectId ? sql`and p3.id = ${scope.projectId}` : sql``}
        and r.status in ('open','monitoring','occurred')
        and (r.probability = 'high' and r.impact in ('high','critical')
          or r.impact = 'critical' and r.probability in ('medium','high')))`),
      staleProjects: int(
        sql`count(*) filter (where ${projects.status} in ('planning','active','on_hold','at_risk')
          and ${projects.updatedAt} < now() - interval '14 days')`,
      ),
    })
    .from(projects)
    .where(and(...conds));
  return row;
}

/* ------------------------------------------------------------------------ time */

export async function timeMetrics(orgId: number, period: Period, scope: MetricsScope = {}) {
  const base = and(
    eq(timeEntries.organizationId, orgId),
    isNull(timeEntries.voidedAt),
    gte(timeEntries.date, period.start),
    lte(timeEntries.date, period.end),
    ...(scope.userId ? [eq(timeEntries.userId, scope.userId)] : []),
    ...(scope.clientId ? [sql`${workItems.clientId} = ${scope.clientId}`] : []),
    ...(scope.projectId
      ? [sql`exists (select 1 from ${activities} a where a.work_item_id = ${workItems.id} and a.project_id = ${scope.projectId})`]
      : []),
  );
  const joined = () =>
    db
      .select({
        total: int(sql`sum(${timeEntries.durationMinutes})`),
        billable: int(sql`sum(${timeEntries.durationMinutes}) filter (where ${timeEntries.billingStatus} = 'billable')`),
        nonBillable: int(sql`sum(${timeEntries.durationMinutes}) filter (where ${timeEntries.billingStatus} = 'non_billable')`),
        inContract: int(sql`sum(${timeEntries.durationMinutes}) filter (where ${timeEntries.billingStatus} = 'included_in_contract')`),
        pendingReview: int(sql`sum(${timeEntries.durationMinutes}) filter (where ${timeEntries.billingStatus} = 'pending_review')`),
      })
      .from(timeEntries)
      .innerJoin(workItems, eq(timeEntries.workItemId, workItems.id))
      .where(base);
  const [totals] = await joined();
  const [byUser, byClient, byItemType, byModality] = await Promise.all([
    db
      .select({ key: sql<string>`coalesce(${users.name}, '—')`, minutes: int(sql`sum(${timeEntries.durationMinutes})`) })
      .from(timeEntries)
      .innerJoin(workItems, eq(timeEntries.workItemId, workItems.id))
      .leftJoin(users, eq(timeEntries.userId, users.id))
      .where(base)
      .groupBy(sql`1`)
      .orderBy(sql`2 desc`)
      .limit(12),
    db
      .select({ key: sql<string>`coalesce(${clients.name}, 'Interno')`, minutes: int(sql`sum(${timeEntries.durationMinutes})`) })
      .from(timeEntries)
      .innerJoin(workItems, eq(timeEntries.workItemId, workItems.id))
      .leftJoin(clients, eq(workItems.clientId, clients.id))
      .where(base)
      .groupBy(sql`1`)
      .orderBy(sql`2 desc`)
      .limit(12),
    db
      .select({ key: sql<string>`${workItems.type}::text`, minutes: int(sql`sum(${timeEntries.durationMinutes})`) })
      .from(timeEntries)
      .innerJoin(workItems, eq(timeEntries.workItemId, workItems.id))
      .where(base)
      .groupBy(sql`1`),
    db
      .select({ key: sql<string>`${timeEntries.modality}::text`, minutes: int(sql`sum(${timeEntries.durationMinutes})`) })
      .from(timeEntries)
      .innerJoin(workItems, eq(timeEntries.workItemId, workItems.id))
      .where(base)
      .groupBy(sql`1`),
  ]);
  return { ...totals, byUser, byClient, byItemType, byModality };
}

/* ---------------------------------------------------------------- conversations */

export async function conversationMetrics(orgId: number, period: Period, scope: MetricsScope = {}) {
  const { from, to } = periodBounds(period);
  const clientCond = scope.clientId
    ? sql`and c.client_id = ${scope.clientId}`
    : sql``;
  const [row] = await db
    .select({
      totalMessages: int(sql`count(*) filter (where ${messages.direction} != 'internal')`),
      inbound: int(sql`count(*) filter (where ${messages.direction} = 'inbound')`),
      outbound: int(sql`count(*) filter (where ${messages.direction} = 'outbound')`),
      // internal notes are counted but NEVER included in external report content
      internalNotes: int(sql`count(*) filter (where ${messages.direction} = 'internal')`),
    })
    .from(messages)
    .where(
      and(
        eq(messages.organizationId, orgId),
        sql`${messages.occurredAt} between ${from} and ${to}`,
        sql`exists (select 1 from conversations c where c.id = ${messages.conversationId} ${clientCond})`,
      ),
    );
  const [pending] = await db
    .select({
      pendingConversations: int(
        sql`count(*) filter (where status != 'attended')`,
      ),
    })
    .from(sql`conversations`)
    .where(
      sql`organization_id = ${orgId} ${scope.clientId ? sql`and client_id = ${scope.clientId}` : sql``}`,
    );
  return { ...row, ...pending };
}

/* --------------------------------------------------------------------- billing */

export async function billingMetrics(orgId: number, period: Period, scope: MetricsScope = {}) {
  const { from, to } = periodBounds(period);
  const base = and(
    eq(workItems.organizationId, orgId),
    eq(workItems.type, "ticket"),
    sql`(${workItems.createdAt} between ${from} and ${to} or ${tickets.closedAt} between ${from} and ${to})`,
    ...scopeWork(scope),
  );
  const [row] = await db
    .select({
      pendingReview: int(sql`count(*) filter (where ${tickets.billingStatus} = 'pending_review')`),
      billable: int(sql`count(*) filter (where ${tickets.billingStatus} in ('billable','contract_overage'))`),
      inContract: int(sql`count(*) filter (where ${tickets.billingStatus} = 'included_in_contract')`),
      fixedPrice: int(sql`count(*) filter (where ${tickets.billingStatus} = 'fixed_price')`),
      monthly: int(sql`count(*) filter (where ${tickets.billingStatus} = 'included_in_monthly_charge')`),
      charged: int(sql`count(*) filter (where ${tickets.billingStatus} = 'charged')`),
      noCharge: int(sql`count(*) filter (where ${tickets.billingStatus} = 'no_charge')`),
      potentialAmount: sql<string>`coalesce(sum(${tickets.calculatedAmount}) filter (where ${tickets.billingStatus} in ('billable','contract_overage','fixed_price')), 0)::text`,
      chargedAmount: sql<string>`coalesce(sum(${tickets.calculatedAmount}) filter (where ${tickets.billingStatus} = 'charged'), 0)::text`,
    })
    .from(tickets)
    .innerJoin(workItems, eq(tickets.workItemId, workItems.id))
    .where(base);
  const [billableTime] = await db
    .select({
      billableMinutes: int(sql`sum(${timeEntries.durationMinutes}) filter (where ${timeEntries.billingStatus} = 'billable')`),
    })
    .from(timeEntries)
    .innerJoin(workItems, eq(timeEntries.workItemId, workItems.id))
    .where(
      and(
        eq(timeEntries.organizationId, orgId),
        isNull(timeEntries.voidedAt),
        gte(timeEntries.date, period.start),
        lte(timeEntries.date, period.end),
        ...scopeWork(scope),
      ),
    );
  return { ...row, ...billableTime };
}

/* ------------------------------------------------------------------- recurring */

export async function recurringMetrics(orgId: number, period: Period, scope: MetricsScope = {}) {
  const { from, to } = periodBounds(period);
  const clientCond = scope.clientId
    ? sql`and d.client_id = ${scope.clientId}`
    : sql``;
  const [row] = await db
    .select({
      executions: int(sql`count(*)`),
      succeeded: int(sql`count(*) filter (where ${recurrenceExecutions.status} = 'succeeded')`),
      failed: int(sql`count(*) filter (where ${recurrenceExecutions.status} = 'failed')`),
      skipped: int(sql`count(*) filter (where ${recurrenceExecutions.status} = 'skipped')`),
      generated: int(sql`count(*) filter (where ${recurrenceExecutions.generatedEntityId} is not null)`),
    })
    .from(recurrenceExecutions)
    .where(
      and(
        eq(recurrenceExecutions.organizationId, orgId),
        sql`${recurrenceExecutions.scheduledFor} between ${from} and ${to}`,
        sql`exists (select 1 from recurrence_definitions d
          where d.id = ${recurrenceExecutions.recurrenceDefinitionId} ${clientCond})`,
      ),
    );
  const [defs] = await db
    .select({
      activeDefinitions: int(sql`count(*) filter (where status = 'active')`),
      inError: int(sql`count(*) filter (where status = 'error')`),
      overdueUnprocessed: int(sql`count(*) filter (where status = 'active' and next_run_at < now())`),
    })
    .from(sql`recurrence_definitions`)
    .where(
      sql`organization_id = ${orgId} and archived_at is null
        ${scope.clientId ? sql`and client_id = ${scope.clientId}` : sql``}`,
    );
  return { ...row, ...defs };
}

/* ---------------------------------------------------------------- full snapshot */

export type PeriodMetrics = Awaited<ReturnType<typeof computePeriodMetrics>>;

/** Everything a report snapshot (or the Indicators screen) needs, in parallel. */
export async function computePeriodMetrics(orgId: number, period: Period, scope: MetricsScope = {}) {
  const [ticketsM, sla, activitiesM, projectsM, time, conversations, billing, recurring] =
    await Promise.all([
      ticketMetrics(orgId, period, scope),
      slaMetrics(orgId, period, scope),
      activityMetrics(orgId, period, scope),
      projectMetrics(orgId, period, scope),
      timeMetrics(orgId, period, scope),
      conversationMetrics(orgId, period, scope),
      billingMetrics(orgId, period, scope),
      recurringMetrics(orgId, period, scope),
    ]);
  return {
    period,
    scope: { clientId: scope.clientId ?? null, projectId: scope.projectId ?? null, userId: scope.userId ?? null },
    computedAt: new Date().toISOString(),
    tickets: ticketsM,
    sla,
    activities: activitiesM,
    projects: projectsM,
    time,
    conversations,
    billing,
    recurring,
  };
}
