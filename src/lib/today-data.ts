import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  activities,
  companies,
  conversations,
  messages,
  operationalReminders,
  tickets,
  timeEntries,
  userPreferences,
  users,
  workItems,
} from "@/db/schema";
import type { SessionUser } from "@/lib/session";
import type { Role } from "@/lib/roles";
import type { ReminderMark, TodayItem } from "@/lib/today-rules";

/**
 * Data layer for /today. One work-items sweep feeds summary, attention, focus,
 * my-work, waiting and agenda (no per-section re-queries); reminders and
 * messages load in their own Suspense boundaries. Time and last-message are
 * aggregated with CTEs — no N+1. Everything is org-scoped from the session.
 */

export type TodayScope = "mine" | "team" | "org";

/** Team entity doesn't exist yet (OQ-02): "team" behaves as "org" — documented. */
export function defaultScopeFor(role: Role): TodayScope {
  if (role === "technician") return "mine";
  if (role === "project_manager") return "team";
  return "org";
}

const ITEM_LIMIT = 300;

export async function getTodayItems(
  user: SessionUser,
  scope: TodayScope,
): Promise<TodayItem[]> {
  const orgId = user.organizationId;
  const mineOnly = scope === "mine";

  const timeByItem = db.$with("time_by_item").as(
    db
      .select({
        workItemId: timeEntries.workItemId,
        minutes: sql<number>`coalesce(sum(${timeEntries.durationMinutes}), 0)::int`.as(
          "minutes",
        ),
      })
      .from(timeEntries)
      .where(isNull(timeEntries.voidedAt))
      .groupBy(timeEntries.workItemId),
  );

  // last message per conversation (direction + timestamp) to flag unanswered inbound
  const lastMessage = db.$with("last_message").as(
    db
      .selectDistinctOn([messages.conversationId], {
        conversationId: messages.conversationId,
        direction: messages.direction,
        occurredAt: messages.occurredAt,
      })
      .from(messages)
      .orderBy(messages.conversationId, desc(messages.occurredAt)),
  );

  const ticketConditions = [eq(tickets.organizationId, orgId)];
  const activityConditions = [
    eq(activities.organizationId, orgId),
    isNull(activities.archivedAt),
    isNull(activities.convertedAt),
  ];
  if (mineOnly) {
    ticketConditions.push(eq(workItems.assigneeId, Number(user.id)));
    activityConditions.push(eq(workItems.assigneeId, Number(user.id)));
  }

  const [ticketRows, activityRows] = await Promise.all([
    db
      .with(timeByItem, lastMessage)
      .select({
        id: tickets.id,
        workItemId: workItems.id,
        folio: tickets.folio,
        title: workItems.title,
        companyId: workItems.companyId,
        companyName: companies.name,
        assigneeId: workItems.assigneeId,
        assigneeName: users.name,
        status: workItems.status,
        priority: workItems.priority,
        category: tickets.category,
        dueDate: workItems.dueDate,
        createdAt: workItems.createdAt,
        updatedAt: workItems.updatedAt,
        firstResponseAt: tickets.firstResponseAt,
        firstResponseTargetAt: tickets.firstResponseTargetAt,
        resolutionTargetAt: tickets.resolutionTargetAt,
        slaName: tickets.slaName,
        slaResolutionMinutes: tickets.slaResolutionMinutes,
        slaPausedAt: tickets.slaPausedAt,
        reopenCount: tickets.reopenCount,
        billingStatus: tickets.billingStatus,
        minutes: sql<number>`coalesce(${timeByItem.minutes}, 0)::int`,
        lastDirection: lastMessage.direction,
        lastMessageAt: lastMessage.occurredAt,
      })
      .from(tickets)
      .innerJoin(workItems, eq(tickets.workItemId, workItems.id))
      .leftJoin(companies, eq(workItems.companyId, companies.id))
      .leftJoin(users, eq(workItems.assigneeId, users.id))
      .leftJoin(timeByItem, eq(timeByItem.workItemId, workItems.id))
      .leftJoin(conversations, eq(conversations.ticketId, tickets.id))
      .leftJoin(lastMessage, eq(lastMessage.conversationId, conversations.id))
      .where(and(...ticketConditions))
      .orderBy(desc(workItems.updatedAt))
      .limit(ITEM_LIMIT),
    db
      .with(timeByItem)
      .select({
        id: activities.id,
        workItemId: workItems.id,
        title: workItems.title,
        companyId: workItems.companyId,
        companyName: companies.name,
        assigneeId: workItems.assigneeId,
        assigneeName: users.name,
        status: workItems.status,
        priority: workItems.priority,
        activityType: activities.activityType,
        parentTicketId: activities.parentTicketId,
        projectId: activities.projectId,
        parentActivityId: activities.parentActivityId,
        dueDate: workItems.dueDate,
        createdAt: workItems.createdAt,
        updatedAt: workItems.updatedAt,
        minutes: sql<number>`coalesce(${timeByItem.minutes}, 0)::int`,
      })
      .from(activities)
      .innerJoin(workItems, eq(activities.workItemId, workItems.id))
      .leftJoin(companies, eq(workItems.companyId, companies.id))
      .leftJoin(users, eq(workItems.assigneeId, users.id))
      .leftJoin(timeByItem, eq(timeByItem.workItemId, workItems.id))
      .where(and(...activityConditions))
      .orderBy(desc(workItems.updatedAt))
      .limit(ITEM_LIMIT),
  ]);

  const items: TodayItem[] = [];
  for (const t of ticketRows) {
    items.push({
      kind: "ticket",
      id: t.id,
      workItemId: t.workItemId,
      folio: t.folio,
      title: t.title,
      companyId: t.companyId,
      companyName: t.companyName,
      assigneeId: t.assigneeId,
      assigneeName: t.assigneeName,
      status: t.status,
      priority: t.priority,
      activityType: null,
      category: t.category,
      dueDate: t.dueDate,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      firstResponseAt: t.firstResponseAt,
      firstResponseTargetAt: t.firstResponseTargetAt,
      resolutionTargetAt: t.resolutionTargetAt,
      slaName: t.slaName,
      slaResolutionMinutes: t.slaResolutionMinutes,
      slaPausedAt: t.slaPausedAt,
      reopenCount: t.reopenCount,
      billingStatus: t.billingStatus,
      unansweredInbound: t.lastDirection === "inbound",
      lastInboundAt: t.lastDirection === "inbound" ? t.lastMessageAt : null,
      minutes: t.minutes,
      projectId: null,
      parentActivityId: null,
    });
  }
  for (const a of activityRows) {
    items.push({
      kind: a.parentTicketId ? "related_activity" : "activity",
      id: a.id,
      workItemId: a.workItemId,
      folio: null,
      title: a.title,
      companyId: a.companyId,
      companyName: a.companyName,
      assigneeId: a.assigneeId,
      assigneeName: a.assigneeName,
      status: a.status,
      priority: a.priority,
      activityType: a.activityType,
      category: null,
      dueDate: a.dueDate,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
      firstResponseAt: null,
      firstResponseTargetAt: null,
      resolutionTargetAt: null,
      slaName: null,
      slaResolutionMinutes: null,
      slaPausedAt: null,
      reopenCount: 0,
      billingStatus: null,
      unansweredInbound: false,
      lastInboundAt: null,
      minutes: a.minutes,
      projectId: a.projectId,
      parentActivityId: a.parentActivityId,
    });
  }
  return items;
}

/** Last touch per client = latest work item update (client creation as floor). */
export async function getClientsLastTouch(orgId: number) {
  const rows = await db
    .select({
      companyId: companies.id,
      companyName: companies.name,
      lastTouchAt: sql<Date | null>`greatest(max(${workItems.updatedAt}), ${companies.createdAt})`,
    })
    .from(companies)
    .leftJoin(workItems, eq(workItems.companyId, companies.id))
    .where(eq(companies.organizationId, orgId))
    .groupBy(companies.id, companies.name, companies.createdAt);
  return rows.map((r) => ({
    ...r,
    lastTouchAt: r.lastTouchAt ? new Date(r.lastTouchAt) : null,
  }));
}

export async function getReminderMarks(orgId: number): Promise<ReminderMark[]> {
  const rows = await db
    .select()
    .from(operationalReminders)
    .where(eq(operationalReminders.organizationId, orgId));
  return rows.map((r) => ({
    ruleKey: r.ruleKey,
    entityType: r.entityType,
    entityId: r.entityId,
    status: r.status,
    snoozedUntil: r.snoozedUntil,
    actedAt: r.actedAt,
  }));
}

/** Minutes logged on a given date (scope-aware). */
export async function getTimeLoggedOn(
  user: SessionUser,
  scope: TodayScope,
  date: string,
): Promise<number> {
  const conditions = [
    eq(timeEntries.organizationId, user.organizationId),
    eq(timeEntries.date, date),
    isNull(timeEntries.voidedAt),
  ];
  if (scope === "mine") conditions.push(eq(timeEntries.userId, Number(user.id)));
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${timeEntries.durationMinutes}), 0)::int`,
    })
    .from(timeEntries)
    .where(and(...conditions));
  return row.total;
}

export type RecentMessage = {
  conversationId: number;
  ticketId: number;
  folio: string;
  ticketTitle: string;
  companyName: string | null;
  contact: string | null;
  assigneeName: string | null;
  channel: string;
  direction: string;
  body: string;
  occurredAt: Date;
  conversationStatus: string;
};

export async function getRecentMessages(
  orgId: number,
  limit = 12,
): Promise<RecentMessage[]> {
  const lastMessage = db.$with("last_message").as(
    db
      .selectDistinctOn([messages.conversationId], {
        conversationId: messages.conversationId,
        direction: messages.direction,
        occurredAt: messages.occurredAt,
        body: messages.body,
        channel: messages.channel,
      })
      .from(messages)
      .orderBy(messages.conversationId, desc(messages.occurredAt)),
  );
  const rows = await db
    .with(lastMessage)
    .select({
      conversationId: conversations.id,
      ticketId: tickets.id,
      folio: tickets.folio,
      ticketTitle: workItems.title,
      companyName: companies.name,
      contact: tickets.contact,
      assigneeName: users.name,
      channel: lastMessage.channel,
      direction: lastMessage.direction,
      body: lastMessage.body,
      occurredAt: lastMessage.occurredAt,
      conversationStatus: conversations.status,
    })
    .from(conversations)
    .innerJoin(lastMessage, eq(lastMessage.conversationId, conversations.id))
    .innerJoin(tickets, eq(conversations.ticketId, tickets.id))
    .innerJoin(workItems, eq(tickets.workItemId, workItems.id))
    .leftJoin(companies, eq(workItems.companyId, companies.id))
    .leftJoin(users, eq(workItems.assigneeId, users.id))
    .where(
      and(
        eq(conversations.organizationId, orgId),
        ne(lastMessage.direction, "internal"),
      ),
    )
    .orderBy(desc(lastMessage.occurredAt))
    .limit(limit);
  return rows;
}

/* ------------------------------------------------------------- preferences */

export type TodayPreferences = {
  scope?: TodayScope;
  view?: "list" | "agenda" | "table";
  filter?: string;
  group?: string;
};

export async function getTodayPreferences(userId: number): Promise<TodayPreferences> {
  const [row] = await db
    .select({ today: userPreferences.today })
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId));
  return (row?.today as TodayPreferences) ?? {};
}

// re-exported for the summary of unassigned queues (always org-wide: shared queues)
export async function getUnassignedCounts(orgId: number) {
  const [row] = await db
    .select({
      tickets: sql<number>`count(*) filter (where ${workItems.type} = 'ticket' and ${workItems.status} in ('new','assigned','in_progress','waiting_customer','waiting_third_party','scheduled','reopened'))::int`,
      activities: sql<number>`count(*) filter (where ${workItems.type} = 'activity' and ${workItems.status} in ('pending','in_progress','waiting','blocked'))::int`,
    })
    .from(workItems)
    .where(and(eq(workItems.organizationId, orgId), isNull(workItems.assigneeId)));
  return row;
}
