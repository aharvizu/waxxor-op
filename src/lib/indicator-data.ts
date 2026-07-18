import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { clients, indicatorThresholds, reports, tickets, timeEntries, workItems } from "@/db/schema";
import { mergeThresholds, type Thresholds } from "@/lib/indicators";
import { periodBounds, type Period } from "@/lib/report-metrics";

/**
 * Indicator-specific aggregates that complement computePeriodMetrics:
 * thresholds, the reports pipeline, per-client health and the backlog trend.
 * All single-pass, org-scoped queries — see docs/architecture/analytics-queries.md.
 */

export async function getThresholds(orgId: number): Promise<Thresholds> {
  const rows = await db
    .select({ key: indicatorThresholds.key, value: indicatorThresholds.value })
    .from(indicatorThresholds)
    .where(eq(indicatorThresholds.organizationId, orgId));
  return mergeThresholds(rows);
}

export async function getThresholdRows(orgId: number) {
  return db
    .select()
    .from(indicatorThresholds)
    .where(eq(indicatorThresholds.organizationId, orgId));
}

/** Reports pipeline counts (excludes archived). */
export async function getReportsPipeline(orgId: number, thresholds: Thresholds) {
  const [row] = await db
    .select({
      draft: sql<number>`count(*) filter (where ${reports.status} in ('draft','generating'))::int`,
      readyForReview: sql<number>`count(*) filter (where ${reports.status} = 'ready_for_review')::int`,
      changesRequested: sql<number>`count(*) filter (where ${reports.status} = 'changes_requested')::int`,
      approved: sql<number>`count(*) filter (where ${reports.status} = 'approved')::int`,
      approvedUnsent: sql<number>`count(*) filter (where ${reports.status} = 'approved' and ${reports.sentAt} is null)::int`,
      sent: sql<number>`count(*) filter (where ${reports.status} = 'sent')::int`,
      failed: sql<number>`count(*) filter (where ${reports.status} = 'failed')::int`,
      overdue: sql<number>`count(*) filter (where ${reports.status} in ('draft','ready_for_review','changes_requested')
        and ${reports.periodEnd} is not null
        and ${reports.periodEnd} < (current_date - ${Math.round(thresholds.report_overdue_days)}::int))::int`,
    })
    .from(reports)
    .where(and(eq(reports.organizationId, orgId), ne(reports.status, "archived")));
  return row;
}

/** Backlog at an instant: tickets created ≤ t, not closed ≤ t, not cancelled. */
export async function backlogAt(orgId: number, at: Date): Promise<number> {
  const [row] = await db
    .select({
      n: sql<number>`count(*)::int`,
    })
    .from(tickets)
    .innerJoin(workItems, eq(tickets.workItemId, workItems.id))
    .where(
      and(
        eq(workItems.organizationId, orgId),
        sql`${workItems.createdAt} <= ${at}`,
        sql`(${tickets.closedAt} is null or ${tickets.closedAt} > ${at})`,
        ne(workItems.status, "cancelled"),
      ),
    );
  return row.n;
}

/** Per-client operational health for the Executive panel — one pass, limit 15. */
export async function clientHealthBoard(orgId: number, period: Period, thresholds: Thresholds) {
  const { from, to } = periodBounds(period);
  return db
    .select({
      clientId: clients.id,
      clientName: clients.name,
      openTickets: sql<number>`(select count(*)::int from ${workItems} w
        where w.client_id = "clients"."id" and w.type = 'ticket'
        and w.status in ('new','assigned','in_progress','waiting_customer','waiting_third_party','scheduled','reopened'))`,
      overdueTickets: sql<number>`(select count(*)::int from ${tickets} t
        join ${workItems} w on w.id = t.work_item_id
        where w.client_id = "clients"."id"
        and w.status in ('new','assigned','in_progress','scheduled','reopened')
        and t.resolution_target_at < now() and t.sla_paused_at is null)`,
      pendingBilling: sql<number>`(select count(*)::int from ${tickets} t
        join ${workItems} w on w.id = t.work_item_id
        where w.client_id = "clients"."id" and t.billing_status = 'pending_review')`,
      minutesInPeriod: sql<number>`coalesce((select sum(te.duration_minutes)::int from ${timeEntries} te
        join ${workItems} w on w.id = te.work_item_id
        where w.client_id = "clients"."id" and te.voided_at is null
        and te.created_at between ${from} and ${to}), 0)`,
      lastTouch: sql<Date | null>`(select max(w.updated_at) from ${workItems} w where w.client_id = "clients"."id")`,
      pendingReports: sql<number>`(select count(*)::int from ${reports} r
        where r.client_id = "clients"."id"
        and r.status in ('draft','ready_for_review','changes_requested','failed'))`,
    })
    .from(clients)
    .where(and(eq(clients.organizationId, orgId), ne(clients.status, "archived")))
    .orderBy(sql`5 desc`)
    .limit(15)
    .then((rows) =>
      rows.map((r) => ({
        ...r,
        inactive:
          r.lastTouch === null ||
          Date.now() - new Date(r.lastTouch).getTime() > thresholds.client_inactive_days * 86_400_000,
      })),
    );
}

/** Work without any active (non-voided) time entry — closed in period. */
export async function closedWithoutTime(orgId: number, period: Period): Promise<number> {
  const { from, to } = periodBounds(period);
  const [row] = await db
    .select({
      n: sql<number>`count(*)::int`,
    })
    .from(tickets)
    .innerJoin(workItems, eq(tickets.workItemId, workItems.id))
    .where(
      and(
        eq(workItems.organizationId, orgId),
        sql`${tickets.closedAt} between ${from} and ${to}`,
        sql`not exists (select 1 from ${timeEntries} te
          where te.work_item_id = ${workItems.id} and te.voided_at is null)`,
      ),
    );
  return row.n;
}

/** Open workload per assignee for the Operations panel. */
export async function workloadByAssignee(orgId: number) {
  return db
    .select({
      key: sql<string>`coalesce(u.name, 'Sin asignar')`,
      openTickets: sql<number>`count(*) filter (where ${workItems.type} = 'ticket')::int`,
      openActivities: sql<number>`count(*) filter (where ${workItems.type} = 'activity')::int`,
      overdue: sql<number>`count(*) filter (where ${workItems.dueDate} < current_date)::int`,
    })
    .from(workItems)
    .leftJoin(sql`users u`, sql`u.id = ${workItems.assigneeId}`)
    .where(
      and(
        eq(workItems.organizationId, orgId),
        sql`${workItems.status} in ('new','assigned','in_progress','waiting_customer','waiting_third_party','scheduled','reopened','pending','waiting','blocked')`,
        isNull(sql`(select a.converted_at from activities a where a.work_item_id = ${workItems.id})`),
      ),
    )
    .groupBy(sql`1`)
    .orderBy(sql`2 desc`)
    .limit(15);
}

/* --------------------------------------------------------- Today integration */

export type ReportSignal = {
  id: number;
  title: string;
  reason: "ready_for_review" | "changes_requested" | "approved_unsent" | "failed";
  detail: string;
};

/**
 * Per-user report signals for Hoy — bounded to reports the user is responsible
 * for (or created), never an org-wide sweep.
 */
export async function getUserReportSignals(orgId: number, userId: number): Promise<ReportSignal[]> {
  const rows = await db
    .select({
      id: reports.id,
      title: reports.title,
      status: reports.status,
      sentAt: reports.sentAt,
      failureReason: reports.failureReason,
      periodEnd: reports.periodEnd,
    })
    .from(reports)
    .where(
      and(
        eq(reports.organizationId, orgId),
        sql`(${reports.responsibleUserId} = ${userId} or ${reports.createdById} = ${userId})`,
        sql`${reports.status} in ('ready_for_review','changes_requested','approved','failed')`,
      ),
    )
    .limit(50);
  const out: ReportSignal[] = [];
  for (const r of rows) {
    if (r.status === "ready_for_review") {
      out.push({ id: r.id, title: r.title, reason: "ready_for_review", detail: "Listo para revisión." });
    } else if (r.status === "changes_requested") {
      out.push({ id: r.id, title: r.title, reason: "changes_requested", detail: "Tiene cambios solicitados." });
    } else if (r.status === "approved" && !r.sentAt) {
      out.push({ id: r.id, title: r.title, reason: "approved_unsent", detail: "Aprobado sin marcar enviado." });
    } else if (r.status === "failed") {
      out.push({
        id: r.id,
        title: r.title,
        reason: "failed",
        detail: r.failureReason ? `Generación fallida: ${r.failureReason}` : "Generación fallida.",
      });
    }
  }
  return out;
}
