import { and, eq, gte, isNull, lte, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  activities,
  companies,
  messages,
  projects,
  recurrenceExecutions,
  ticketBillingStatuses,
  tickets,
  timeEntries,
  users,
  workItems,
} from "@/db/schema";
import { zonedTimeToUtc, type LocalDate } from "@/lib/recurrence";
import { ORG_TIMEZONE, resolveMonthOffset } from "@/lib/reports";
import { getBillingInvoiceStatuses } from "@/lib/billing-invoices";

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
  companyId?: number | null;
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
  if (scope.companyId) conds.push(sql`${workItems.companyId} = ${scope.companyId}`);
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
  if (scope.companyId) conds.push(eq(projects.companyId, scope.companyId));
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
        ${scope.companyId ? sql`and p2.company_id = ${scope.companyId}` : sql``}
        ${scope.projectId ? sql`and p2.id = ${scope.projectId}` : sql``}
        and m.status in ('pending','in_progress','delayed') and m.target_date < current_date)`),
      highRisks: int(sql`(select count(*) from project_risks r
        join projects p3 on p3.id = r.project_id
        where p3.organization_id = ${orgId}
        ${scope.companyId ? sql`and p3.company_id = ${scope.companyId}` : sql``}
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
    ...(scope.companyId ? [sql`${workItems.companyId} = ${scope.companyId}`] : []),
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
      .select({ key: sql<string>`coalesce(${companies.name}, 'Interno')`, minutes: int(sql`sum(${timeEntries.durationMinutes})`) })
      .from(timeEntries)
      .innerJoin(workItems, eq(timeEntries.workItemId, workItems.id))
      .leftJoin(companies, eq(workItems.companyId, companies.id))
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
  const clientCond = scope.companyId
    ? sql`and c.company_id = ${scope.companyId}`
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
      sql`organization_id = ${orgId} ${scope.companyId ? sql`and company_id = ${scope.companyId}` : sql``}`,
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
  const clientCond = scope.companyId
    ? sql`and d.company_id = ${scope.companyId}`
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
        ${scope.companyId ? sql`and company_id = ${scope.companyId}` : sql``}`,
    );
  return { ...row, ...defs };
}

/* ---------------------------------------------------------------- legacy kpis */

/**
 * Monthly KPI set migrated from the previous ticketing portal (Indicadores →
 * Mensual, 2026-08-10). Ticket-scoped fields use created_at, same criterion as
 * ticketMetrics. Distinct from billingMetrics (which splits amounts by
 * billing_status): here "costo generado" is the raw calculated_amount total
 * across every ticket created in the period, so "sin costo" is simply the
 * tickets where that amount is null/0 — matches the portal's original phrasing
 * ("tickets cobrables (costo > $0)").
 */
export async function generalKpis(orgId: number, period: Period, scope: MetricsScope = {}) {
  const { from, to } = periodBounds(period);
  const base = and(
    eq(workItems.organizationId, orgId),
    eq(workItems.type, "ticket"),
    sql`${workItems.createdAt} between ${from} and ${to}`,
    ...scopeWork(scope),
  );
  const timeBase = and(
    eq(timeEntries.organizationId, orgId),
    isNull(timeEntries.voidedAt),
    gte(timeEntries.date, period.start),
    lte(timeEntries.date, period.end),
    ...scopeWork(scope),
  );

  const [[row], assigneeRows, timeUserRows, [hoursRow]] = await Promise.all([
    db
      .select({
        totalTickets: int(sql`count(*)`),
        clientsAttended: int(sql`count(distinct ${workItems.companyId})`),
        costTotal: sql<string>`coalesce(sum(${tickets.calculatedAmount}), 0)::text`,
        // "Facturable" narrows costTotal to tickets whose billing status will
        // actually generate a charge (approved/billed category) — distinct
        // from costTotal, which also counts amounts computed on tickets
        // classified In Contract/No Charge (tracked for cost visibility,
        // never separately invoiced).
        totalFacturable: sql<string>`coalesce(sum(${tickets.calculatedAmount}) filter (
          where ${ticketBillingStatuses.category} in ('approved', 'billed')
        ), 0)::text`,
        billableTickets: int(sql`count(*) filter (where ${tickets.calculatedAmount} > 0)`),
        remoteTickets: int(sql`count(*) filter (where ${tickets.billingModality} = 'remote')`),
        onsiteTickets: int(sql`count(*) filter (where ${tickets.billingModality} = 'onsite')`),
      })
      .from(tickets)
      .innerJoin(workItems, eq(tickets.workItemId, workItems.id))
      .leftJoin(ticketBillingStatuses, eq(tickets.billingStatusId, ticketBillingStatuses.id))
      .where(base),
    db
      .select({ userId: workItems.assigneeId })
      .from(tickets)
      .innerJoin(workItems, eq(tickets.workItemId, workItems.id))
      .where(and(base, sql`${workItems.assigneeId} is not null`))
      .groupBy(workItems.assigneeId),
    db
      .select({ userId: timeEntries.userId })
      .from(timeEntries)
      .innerJoin(workItems, eq(timeEntries.workItemId, workItems.id))
      .where(timeBase)
      .groupBy(timeEntries.userId),
    db
      .select({ minutes: int(sql`sum(${timeEntries.durationMinutes})`) })
      .from(timeEntries)
      .innerJoin(workItems, eq(timeEntries.workItemId, workItems.id))
      .where(timeBase),
  ]);

  const activeTechnicianIds = new Set(
    [...assigneeRows.map((r) => r.userId), ...timeUserRows.map((r) => r.userId)].filter(
      (id): id is number => id != null,
    ),
  );
  const hoursWorked = hoursRow?.minutes ?? 0;
  const costTotal = Number(row.costTotal);
  const noCostTickets = row.totalTickets - row.billableTickets;

  return {
    totalTickets: row.totalTickets,
    clientsAttended: row.clientsAttended,
    techniciansActive: activeTechnicianIds.size,
    hoursWorked,
    costTotal,
    totalFacturable: Number(row.totalFacturable),
    avgHoursPerTicket: row.totalTickets > 0 ? Math.round(hoursWorked / row.totalTickets) : null,
    avgCostPerTicket: row.totalTickets > 0 ? costTotal / row.totalTickets : null,
    billableTickets: row.billableTickets,
    noCostTickets,
    remoteTickets: row.remoteTickets,
    onsiteTickets: row.onsiteTickets,
    remotePct: row.totalTickets > 0 ? Math.round((row.remoteTickets / row.totalTickets) * 100) : null,
    onsitePct: row.totalTickets > 0 ? Math.round((row.onsiteTickets / row.totalTickets) * 100) : null,
  };
}

/** Per-category ticket count/hours/cost — rankings are just this list sorted three ways. */
export async function categoryKpis(orgId: number, period: Period, scope: MetricsScope = {}) {
  const { from, to } = periodBounds(period);
  const base = and(
    eq(workItems.organizationId, orgId),
    eq(workItems.type, "ticket"),
    sql`${workItems.createdAt} between ${from} and ${to}`,
    ...scopeWork(scope),
  );
  const rows = await db
    .select({
      key: sql<string>`coalesce(${tickets.category}, '—')`,
      ticketCount: int(sql`count(*)`),
      cost: sql<string>`coalesce(sum(${tickets.calculatedAmount}), 0)::text`,
      hours: int(sql`coalesce(sum((
        select sum(te.duration_minutes) from ${timeEntries} te
        where te.work_item_id = ${workItems.id} and te.voided_at is null
      )), 0)`),
    })
    .from(tickets)
    .innerJoin(workItems, eq(tickets.workItemId, workItems.id))
    .where(base)
    .groupBy(sql`1`)
    .orderBy(sql`2 desc`);
  return rows.map((r) => ({ key: r.key, ticketCount: r.ticketCount, hours: r.hours, cost: Number(r.cost) }));
}

/** Ticket count + cost by billing modality (remote/onsite/fixed_price/not_applicable). Hours by modality already exist on timeMetrics(...).byModality — reused, not duplicated. */
export async function modalityKpis(orgId: number, period: Period, scope: MetricsScope = {}) {
  const { from, to } = periodBounds(period);
  const base = and(
    eq(workItems.organizationId, orgId),
    eq(workItems.type, "ticket"),
    sql`${workItems.createdAt} between ${from} and ${to}`,
    ...scopeWork(scope),
  );
  const rows = await db
    .select({
      key: sql<string>`${tickets.billingModality}::text`,
      ticketCount: int(sql`count(*)`),
      cost: sql<string>`coalesce(sum(${tickets.calculatedAmount}), 0)::text`,
    })
    .from(tickets)
    .innerJoin(workItems, eq(tickets.workItemId, workItems.id))
    .where(base)
    .groupBy(sql`1`);
  return rows.map((r) => ({ key: r.key, ticketCount: r.ticketCount, cost: Number(r.cost) }));
}

/**
 * Per-client rollup for the monthly KPI set — tickets/hours/cost/billable
 * split, plus "categoría principal" and "técnico principal" (the highest-
 * count category/assignee for that client in the period). The top-1 picks
 * are done in JS from flat group-by rows rather than a window-function
 * query — simpler to read and verify, and the row counts here (clients ×
 * categories, clients × assignees) are always small.
 */
export async function clientKpis(orgId: number, period: Period, scope: MetricsScope = {}) {
  const { from, to } = periodBounds(period);
  const base = and(
    eq(workItems.organizationId, orgId),
    eq(workItems.type, "ticket"),
    sql`${workItems.createdAt} between ${from} and ${to}`,
    ...scopeWork(scope),
  );
  const [totals, byCategory, byAssignee] = await Promise.all([
    db
      .select({
        companyId: workItems.companyId,
        companyName: sql<string>`coalesce(${companies.name}, 'Sin empresa')`,
        ticketCount: int(sql`count(*)`),
        cost: sql<string>`coalesce(sum(${tickets.calculatedAmount}), 0)::text`,
        billableTickets: int(sql`count(*) filter (where ${tickets.calculatedAmount} > 0)`),
        hours: int(sql`coalesce(sum((
          select sum(te.duration_minutes) from ${timeEntries} te
          where te.work_item_id = ${workItems.id} and te.voided_at is null
        )), 0)`),
      })
      .from(tickets)
      .innerJoin(workItems, eq(tickets.workItemId, workItems.id))
      .leftJoin(companies, eq(workItems.companyId, companies.id))
      .where(base)
      .groupBy(workItems.companyId, companies.name),
    db
      .select({
        companyId: workItems.companyId,
        category: sql<string>`coalesce(${tickets.category}, '—')`,
        count: int(sql`count(*)`),
      })
      .from(tickets)
      .innerJoin(workItems, eq(tickets.workItemId, workItems.id))
      .where(base)
      .groupBy(workItems.companyId, tickets.category),
    db
      .select({
        companyId: workItems.companyId,
        assigneeName: sql<string>`coalesce(${users.name}, 'Sin asignar')`,
        count: int(sql`count(*)`),
      })
      .from(tickets)
      .innerJoin(workItems, eq(tickets.workItemId, workItems.id))
      .leftJoin(users, eq(workItems.assigneeId, users.id))
      .where(base)
      .groupBy(workItems.companyId, users.name),
  ]);

  const topOf = <T extends { companyId: number | null; count: number }>(rows: T[], pick: (r: T) => string) => {
    const best = new Map<number | null, { label: string; count: number }>();
    for (const r of rows) {
      const current = best.get(r.companyId);
      if (!current || r.count > current.count) best.set(r.companyId, { label: pick(r), count: r.count });
    }
    return best;
  };
  const topCategory = topOf(byCategory, (r) => r.category);
  const topAssignee = topOf(byAssignee, (r) => r.assigneeName);

  return totals
    .map((t) => ({
      companyId: t.companyId,
      companyName: t.companyName,
      ticketCount: t.ticketCount,
      hours: t.hours,
      cost: Number(t.cost),
      billableTickets: t.billableTickets,
      noCostTickets: t.ticketCount - t.billableTickets,
      topCategory: topCategory.get(t.companyId)?.label ?? "—",
      topAssignee: topAssignee.get(t.companyId)?.label ?? "Sin asignar",
    }))
    .sort((a, b) => b.ticketCount - a.ticketCount);
}

/**
 * Per-technician rollup. Ticket-scoped fields (counts, cost, remote/onsite
 * ticket split) attribute to the ticket's assignee; hour-scoped fields
 * attribute to whoever logged the time_entries row — same split
 * ticketMetrics.byAssignee / timeMetrics.byUser already use, not a new rule.
 */
export async function technicianKpis(orgId: number, period: Period, scope: MetricsScope = {}) {
  const { from, to } = periodBounds(period);
  const base = and(
    eq(workItems.organizationId, orgId),
    eq(workItems.type, "ticket"),
    sql`${workItems.createdAt} between ${from} and ${to}`,
    ...scopeWork(scope),
  );
  const timeBase = and(
    eq(timeEntries.organizationId, orgId),
    isNull(timeEntries.voidedAt),
    gte(timeEntries.date, period.start),
    lte(timeEntries.date, period.end),
    ...scopeWork(scope),
  );

  const [byAssignee, hoursByUser, hoursByUserModality, byAssigneeModality, byAssigneeCategory] = await Promise.all([
    db
      .select({
        assigneeId: workItems.assigneeId,
        assigneeName: sql<string>`coalesce(${users.name}, 'Sin asignar')`,
        ticketCount: int(sql`count(*)`),
        cost: sql<string>`coalesce(sum(${tickets.calculatedAmount}), 0)::text`,
      })
      .from(tickets)
      .innerJoin(workItems, eq(tickets.workItemId, workItems.id))
      .leftJoin(users, eq(workItems.assigneeId, users.id))
      .where(base)
      .groupBy(workItems.assigneeId, users.name),
    db
      .select({
        userId: timeEntries.userId,
        minutes: int(sql`sum(${timeEntries.durationMinutes})`),
      })
      .from(timeEntries)
      .innerJoin(workItems, eq(timeEntries.workItemId, workItems.id))
      .where(timeBase)
      .groupBy(timeEntries.userId),
    db
      .select({
        userId: timeEntries.userId,
        modality: sql<string>`${timeEntries.modality}::text`,
        minutes: int(sql`sum(${timeEntries.durationMinutes})`),
      })
      .from(timeEntries)
      .innerJoin(workItems, eq(timeEntries.workItemId, workItems.id))
      .where(timeBase)
      .groupBy(timeEntries.userId, timeEntries.modality),
    db
      .select({
        assigneeId: workItems.assigneeId,
        modality: sql<string>`${tickets.billingModality}::text`,
        ticketCount: int(sql`count(*)`),
      })
      .from(tickets)
      .innerJoin(workItems, eq(tickets.workItemId, workItems.id))
      .where(base)
      .groupBy(workItems.assigneeId, tickets.billingModality),
    db
      .select({
        assigneeId: workItems.assigneeId,
        assigneeName: sql<string>`coalesce(${users.name}, 'Sin asignar')`,
        category: sql<string>`coalesce(${tickets.category}, '—')`,
        ticketCount: int(sql`count(*)`),
        hours: int(sql`coalesce(sum((
          select sum(te.duration_minutes) from ${timeEntries} te
          where te.work_item_id = ${workItems.id} and te.voided_at is null
        )), 0)`),
      })
      .from(tickets)
      .innerJoin(workItems, eq(tickets.workItemId, workItems.id))
      .leftJoin(users, eq(workItems.assigneeId, users.id))
      .where(base)
      .groupBy(workItems.assigneeId, users.name, tickets.category),
  ]);

  const hoursMap = new Map(hoursByUser.map((r) => [r.userId, r.minutes]));
  const modalityHoursMap = new Map<string, number>();
  for (const r of hoursByUserModality) modalityHoursMap.set(`${r.userId}:${r.modality}`, r.minutes);
  const modalityTicketsMap = new Map<string, number>();
  for (const r of byAssigneeModality) modalityTicketsMap.set(`${r.assigneeId}:${r.modality}`, r.ticketCount);

  const summary = byAssignee
    .map((a) => {
      const hours = (a.assigneeId !== null ? hoursMap.get(a.assigneeId) : undefined) ?? 0;
      return {
        assigneeId: a.assigneeId,
        assigneeName: a.assigneeName,
        ticketCount: a.ticketCount,
        hours,
        avgHoursPerTicket: a.ticketCount > 0 ? Math.round(hours / a.ticketCount) : null,
        cost: Number(a.cost),
        remoteTickets: modalityTicketsMap.get(`${a.assigneeId}:remote`) ?? 0,
        remoteHours: modalityHoursMap.get(`${a.assigneeId}:remote`) ?? 0,
        onsiteTickets: modalityTicketsMap.get(`${a.assigneeId}:onsite`) ?? 0,
        onsiteHours: modalityHoursMap.get(`${a.assigneeId}:onsite`) ?? 0,
      };
    })
    .sort((a, b) => b.ticketCount - a.ticketCount);

  // Top 5 categories per technician by ticket count — a flat table, not
  // artificially collapsed to one row, since the brief wants a breakdown.
  const byTechnician = new Map<number | null, typeof byAssigneeCategory>();
  for (const r of byAssigneeCategory) {
    const list = byTechnician.get(r.assigneeId) ?? [];
    list.push(r);
    byTechnician.set(r.assigneeId, list);
  }
  const topCategories = [...byTechnician.values()]
    .flatMap((list) => list.sort((a, b) => b.ticketCount - a.ticketCount).slice(0, 5))
    .map((r) => ({
      assigneeName: r.assigneeName,
      category: r.category,
      ticketCount: r.ticketCount,
      hours: r.hours,
    }));

  return { summary, topCategories };
}

// timeZone: "UTC" is required — periods[i].start is formatted as a UTC
// midnight instant below, and without pinning the formatter to UTC too, a
// server running west of UTC (e.g. America/Mexico_City) renders the
// previous day's month (2026-03-01T00:00Z showing as "feb 2026").
const MONTH_LABEL = new Intl.DateTimeFormat("es-MX", { month: "short", year: "numeric", timeZone: "UTC" });

/**
 * generalKpis() computed for each of the last `months` calendar months
 * (oldest first, ending at the current month) — the data behind Indicadores
 * → Comparativa mensual. Deltas between consecutive months are computed by
 * the caller (UI concern: which pairs to show, how to render the arrow).
 */
export async function monthlySeries(orgId: number, months: number, scope: MetricsScope = {}) {
  const now = new Date();
  const periods = Array.from({ length: months }, (_, i) => resolveMonthOffset(-(months - 1) + i, ORG_TIMEZONE, now));
  const points = await Promise.all(periods.map((period) => generalKpis(orgId, period, scope)));
  return points.map((point, i) => ({
    ...point,
    monthKey: periods[i].start.slice(0, 7),
    monthLabel: MONTH_LABEL.format(new Date(`${periods[i].start}T00:00:00Z`)),
    billableRatePct: point.totalTickets > 0 ? Math.round((point.billableTickets / point.totalTickets) * 100) : null,
  }));
}

/** Data-quality signals for the "mejoras al proceso de captura" recommendation section. */
export async function ticketDataQuality(orgId: number, period: Period, scope: MetricsScope = {}) {
  const { from, to } = periodBounds(period);
  const base = and(
    eq(workItems.organizationId, orgId),
    eq(workItems.type, "ticket"),
    sql`${workItems.createdAt} between ${from} and ${to}`,
    ...scopeWork(scope),
  );
  const [row] = await db
    .select({
      noCategory: int(sql`count(*) filter (where ${tickets.category} is null or ${tickets.category} = '')`),
      noAssignee: int(sql`count(*) filter (where ${workItems.assigneeId} is null)`),
    })
    .from(tickets)
    .innerJoin(workItems, eq(tickets.workItemId, workItems.id))
    .where(base);
  return row;
}

/**
 * Per-client billable line items for Reportes → Cobros y facturación —
 * every ticket with a computed amount > 0, grouped by client. Only companies
 * with at least one such ticket are returned (spec: "solo clientes con al
 * menos un ticket cobrable"). Sorted alphabetically (a statement, not a
 * ranking); tickets within a client sorted chronologically.
 *
 * Once a client is marked "Facturado" for this period (billing_invoices),
 * a ticket created afterward — same calendar period, e.g. still this month —
 * must NOT silently inflate the already-sent statement (real incident: a
 * new ticket kept appearing merged into an invoiced client's report). Each
 * client's tickets are split at `invoicedAt`: `invoicedTickets`/`invoicedCost`
 * is the frozen set that matches what was actually invoiced (unchanged,
 * safe to keep re-printing), `pendingTickets`/`pendingCost` is anything
 * newer — kept visibly separate for a future invoice, never merged into the
 * frozen numbers. `totals` and each client's `billableCost`/`billableMinutes`/
 * `billableTicketCount` are the "Total a cobrar" headline: pending-only once
 * invoiced (already-billed money isn't "to bill" anymore), the full period
 * total otherwise.
 */
export async function billingSupportData(orgId: number, period: Period, scope: MetricsScope = {}) {
  const { from, to } = periodBounds(period);
  const base = and(
    eq(workItems.organizationId, orgId),
    eq(workItems.type, "ticket"),
    sql`${workItems.createdAt} between ${from} and ${to}`,
    sql`${tickets.calculatedAmount} > 0`,
    ...scopeWork(scope),
  );
  const rows = await db
    .select({
      companyId: workItems.companyId,
      companyName: sql<string>`coalesce(${companies.name}, 'Sin empresa')`,
      ticketId: tickets.id,
      folio: tickets.folio,
      date: sql<string>`${workItems.createdAt}::date::text`,
      createdAt: workItems.createdAt,
      title: workItems.title,
      technicianName: sql<string>`coalesce(${users.name}, 'Sin asignar')`,
      modality: sql<string>`${tickets.billingModality}::text`,
      minutes: int(sql`coalesce((
        select sum(te.duration_minutes) from ${timeEntries} te
        where te.work_item_id = ${workItems.id} and te.voided_at is null
      ), 0)`),
      cost: sql<string>`${tickets.calculatedAmount}::text`,
      comment: tickets.resolution,
    })
    .from(tickets)
    .innerJoin(workItems, eq(tickets.workItemId, workItems.id))
    .leftJoin(companies, eq(workItems.companyId, companies.id))
    .leftJoin(users, eq(workItems.assigneeId, users.id))
    .where(base)
    .orderBy(companies.name, workItems.createdAt);

  const byCompany = new Map<
    number | null,
    { companyId: number | null; companyName: string; tickets: typeof rows; totalMinutes: number; totalCost: number }
  >();
  for (const r of rows) {
    let group = byCompany.get(r.companyId);
    if (!group) {
      group = { companyId: r.companyId, companyName: r.companyName, tickets: [], totalMinutes: 0, totalCost: 0 };
      byCompany.set(r.companyId, group);
    }
    group.tickets.push(r);
    group.totalMinutes += r.minutes;
    group.totalCost += Number(r.cost);
  }

  const grouped = [...byCompany.values()]
    .map((g) => ({ ...g, tickets: g.tickets.map((t) => ({ ...t, cost: Number(t.cost) })) }))
    .sort((a, b) => a.companyName.localeCompare(b.companyName, "es"));

  const invoiceStatuses = await getBillingInvoiceStatuses(
    orgId,
    period.start,
    period.end,
    grouped.map((g) => g.companyId).filter((id): id is number => id !== null),
  );

  const clients = grouped.map((g) => {
    const invoiceStatus = g.companyId !== null ? invoiceStatuses.get(g.companyId) : undefined;
    const invoicedAt = invoiceStatus?.invoicedAt ?? null;
    const invoicedTickets = invoicedAt === null ? g.tickets : g.tickets.filter((t) => t.createdAt <= invoicedAt);
    const pendingTickets = invoicedAt === null ? [] : g.tickets.filter((t) => t.createdAt > invoicedAt);
    const sum = (list: typeof g.tickets) => ({
      minutes: list.reduce((acc, t) => acc + t.minutes, 0),
      cost: list.reduce((acc, t) => acc + t.cost, 0),
    });
    const invoicedSum = sum(invoicedTickets);
    const pendingSum = sum(pendingTickets);
    return {
      ...g,
      // totalMinutes/totalCost/tickets keep their original meaning — every
      // ticket in the period, invoiced or not (unchanged from before this
      // split; still what the printable statement's frozen section wants).
      invoiceStatus,
      invoicedTickets,
      pendingTickets,
      invoicedMinutes: invoicedSum.minutes,
      invoicedCost: invoicedSum.cost,
      pendingMinutes: pendingSum.minutes,
      pendingCost: pendingSum.cost,
      // What's still actionable to bill — pending-only once invoiced (the
      // already-invoiced amount is settled, not "to bill" anymore), the full
      // period total otherwise. Only the overview page's headline numbers
      // use these; the print statement uses invoiced*/pending* directly.
      billableMinutes: invoicedAt === null ? g.totalMinutes : pendingSum.minutes,
      billableCost: invoicedAt === null ? g.totalCost : pendingSum.cost,
      billableTicketCount: invoicedAt === null ? g.tickets.length : pendingTickets.length,
    };
  });

  const totals = clients.reduce(
    (acc, c) => ({
      tickets: acc.tickets + c.billableTicketCount,
      minutes: acc.minutes + c.billableMinutes,
      cost: acc.cost + c.billableCost,
    }),
    { tickets: 0, minutes: 0, cost: 0 },
  );

  return { clients, totals };
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
    scope: { companyId: scope.companyId ?? null, projectId: scope.projectId ?? null, userId: scope.userId ?? null },
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
