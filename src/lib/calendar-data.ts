import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { activities, companies, tickets, users, workItems } from "@/db/schema";
import { ACTIVE_ACTIVITY_STATUSES, ACTIVE_TICKET_STATUSES } from "@/lib/today-rules";

/**
 * Data layer for /calendar. Reuses the exact same "still open" status lists
 * Today already established (today-rules.ts) rather than defining a second
 * one, and the same anchor-date convention: activities → dueDate. Tickets
 * carry two independent dates — resolutionTargetAt (SLA target) and dueDate
 * ("Fecha agendada", scheduled with the client — never feeds the SLA) — so a
 * ticket can render up to two chips, one per date, tagged via `dateKind` so
 * the grid can style them distinctly. When both land on the same day only
 * the "scheduled" chip renders, to avoid a literal duplicate.
 * Scoped to an explicit [from, to] date window (unlike getTodayItems, which
 * has no date filter and relies on a row cap) so a month/week view never
 * silently drops items past a cap.
 */

export type CalendarItem = {
  kind: "ticket" | "activity";
  id: number;
  workItemId: number;
  folio: string | null;
  title: string;
  date: string; // YYYY-MM-DD — the anchor date this item renders under
  /** Only meaningful for tickets: which of the two dates this chip anchors on. */
  dateKind?: "sla" | "scheduled";
  status: string;
  priority: string;
  companyName: string | null;
  assigneeId: number | null;
  assigneeName: string | null;
};

export async function getCalendarItems(
  orgId: number,
  from: string,
  to: string,
  assigneeId: number | null,
  kind: "ticket" | "activity" | null,
): Promise<CalendarItem[]> {
  if (kind === "activity") {
    return getCalendarActivities(orgId, from, to, assigneeId);
  }
  if (kind === "ticket") {
    return getCalendarTickets(orgId, from, to, assigneeId);
  }
  const [ticketItems, activityItems] = await Promise.all([
    getCalendarTickets(orgId, from, to, assigneeId),
    getCalendarActivities(orgId, from, to, assigneeId),
  ]);
  return [...ticketItems, ...activityItems];
}

async function getCalendarTickets(
  orgId: number,
  from: string,
  to: string,
  assigneeId: number | null,
): Promise<CalendarItem[]> {
  const conditions = [
    eq(workItems.organizationId, orgId),
    eq(workItems.type, "ticket"),
    inArray(workItems.status, ACTIVE_TICKET_STATUSES),
    or(
      sql`${tickets.resolutionTargetAt}::date between ${from} and ${to}`,
      sql`${workItems.dueDate} between ${from} and ${to}`,
    )!,
  ];
  if (assigneeId !== null) conditions.push(eq(workItems.assigneeId, assigneeId));

  const rows = await db
    .select({
      id: tickets.id,
      workItemId: workItems.id,
      folio: tickets.folio,
      title: workItems.title,
      slaDate: sql<string | null>`${tickets.resolutionTargetAt}::date::text`,
      scheduledDate: workItems.dueDate,
      status: workItems.status,
      priority: workItems.priority,
      companyName: companies.name,
      assigneeId: workItems.assigneeId,
      assigneeName: users.name,
    })
    .from(tickets)
    .innerJoin(workItems, eq(tickets.workItemId, workItems.id))
    .leftJoin(companies, eq(workItems.companyId, companies.id))
    .leftJoin(users, eq(workItems.assigneeId, users.id))
    .where(and(...conditions));

  const items: CalendarItem[] = [];
  for (const { slaDate, scheduledDate, ...base } of rows) {
    if (slaDate && slaDate >= from && slaDate <= to) {
      items.push({ kind: "ticket", dateKind: "sla", date: slaDate, ...base });
    }
    if (scheduledDate && scheduledDate >= from && scheduledDate <= to && scheduledDate !== slaDate) {
      items.push({ kind: "ticket", dateKind: "scheduled", date: scheduledDate, ...base });
    }
  }
  return items;
}

async function getCalendarActivities(
  orgId: number,
  from: string,
  to: string,
  assigneeId: number | null,
): Promise<CalendarItem[]> {
  const conditions = [
    eq(workItems.organizationId, orgId),
    eq(workItems.type, "activity"),
    inArray(workItems.status, ACTIVE_ACTIVITY_STATUSES),
    isNull(activities.archivedAt),
    isNull(activities.convertedAt),
    sql`${workItems.dueDate} between ${from} and ${to}`,
  ];
  if (assigneeId !== null) conditions.push(eq(workItems.assigneeId, assigneeId));

  const rows = await db
    .select({
      id: activities.id,
      workItemId: workItems.id,
      title: workItems.title,
      date: workItems.dueDate,
      status: workItems.status,
      priority: workItems.priority,
      companyName: companies.name,
      assigneeId: workItems.assigneeId,
      assigneeName: users.name,
    })
    .from(activities)
    .innerJoin(workItems, eq(activities.workItemId, workItems.id))
    .leftJoin(companies, eq(workItems.companyId, companies.id))
    .leftJoin(users, eq(workItems.assigneeId, users.id))
    .where(and(...conditions));

  return rows.filter((a) => a.date).map((a) => ({ kind: "activity" as const, folio: null, ...a, date: a.date as string }));
}
