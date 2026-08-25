import { and, desc, eq, exists, ilike, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import {
  activities,
  attachments,
  companies,
  contacts,
  conversationParticipants,
  conversations,
  messageMentions,
  messages,
  projects,
  tickets,
  timeEntries,
  users,
  workItems,
} from "@/db/schema";

/** Org-scoped reads for /inbox and its integrations. Writes live in inbox/actions.ts. */

export const INBOX_VIEWS = [
  "all",
  "unread",
  "mine",
  "pinned",
  "favorites",
  "mentions",
  "no_reply",
  "archived",
] as const;
export type InboxView = (typeof INBOX_VIEWS)[number];

export type InboxFilters = {
  view?: InboxView;
  status?: string;
  channel?: string;
  companyId?: number;
  projectId?: number;
  workItemId?: number;
  ticketId?: number;
  q?: string;
};

const LIST_LIMIT = 100;

/** Conversation list with per-user unread/pin/favorite state. One round-trip. */
export async function listConversations(orgId: number, userId: number, f: InboxFilters) {
  const activityWorkItems = alias(workItems, "list_activity_work_items");
  const lastMessage = db.$with("last_message").as(
    db
      .selectDistinctOn([messages.conversationId], {
        conversationId: messages.conversationId,
        body: messages.body,
        direction: messages.direction,
        occurredAt: messages.occurredAt,
        authorUserId: messages.authorUserId,
        deletedAt: messages.deletedAt,
      })
      .from(messages)
      .where(ne(messages.direction, "system"))
      .orderBy(messages.conversationId, desc(messages.occurredAt)),
  );

  const conditions: SQL[] = [eq(conversations.organizationId, orgId)];
  const view = f.view ?? "all";
  if (view === "archived") conditions.push(eq(conversations.status, "archived"));
  else conditions.push(ne(conversations.status, "archived"));
  if (f.status && view !== "archived") conditions.push(eq(conversations.status, f.status));
  if (f.channel) conditions.push(eq(conversations.channel, f.channel as typeof conversations.$inferSelect.channel));
  if (f.companyId) conditions.push(eq(conversations.companyId, f.companyId));
  if (f.projectId) conditions.push(eq(conversations.projectId, f.projectId));
  if (f.workItemId) conditions.push(eq(conversations.workItemId, f.workItemId));
  if (f.ticketId) conditions.push(eq(conversations.ticketId, f.ticketId));
  if (f.q) {
    const term = `%${f.q}%`;
    const bodyMatch = exists(
      db
        .select({ one: sql`1` })
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, conversations.id),
            isNull(messages.deletedAt),
            ilike(messages.body, term),
          ),
        ),
    );
    const cond = or(
      ilike(conversations.subject, term),
      ilike(companies.name, term),
      ilike(tickets.folio, term),
      bodyMatch,
    );
    if (cond) conditions.push(cond);
  }

  const unreadCount = sql<number>`(
    select count(*)::int from messages m
    where m.conversation_id = ${conversations.id}
      and m.deleted_at is null
      and m.direction <> 'system'
      and coalesce(m.author_user_id, 0) <> ${userId}
      and m.occurred_at > coalesce(${conversationParticipants.lastReadAt}, 'epoch'::timestamp)
  )`;
  const unreadMentions = sql<number>`(
    select count(*)::int from message_mentions mm
    join messages m on m.id = mm.message_id
    where m.conversation_id = ${conversations.id}
      and mm.user_id = ${userId}
      and mm.read_at is null
  )`;

  const rows = await db
    .with(lastMessage)
    .select({
      id: conversations.id,
      subject: conversations.subject,
      status: conversations.status,
      channel: conversations.channel,
      updatedAt: conversations.updatedAt,
      companyId: conversations.companyId,
      companyName: companies.name,
      ticketId: conversations.ticketId,
      ticketFolio: tickets.folio,
      ticketTitle: workItems.title,
      projectId: conversations.projectId,
      projectName: projects.name,
      activityId: conversations.workItemId,
      activityTitle: activityWorkItems.title,
      activityFolio: activities.folio,
      lastBody: lastMessage.body,
      lastDirection: lastMessage.direction,
      lastAt: lastMessage.occurredAt,
      lastDeletedAt: lastMessage.deletedAt,
      pinnedAt: conversationParticipants.pinnedAt,
      favoriteAt: conversationParticipants.favoriteAt,
      lastReadAt: conversationParticipants.lastReadAt,
      unreadCount,
      unreadMentions,
    })
    .from(conversations)
    .leftJoin(lastMessage, eq(lastMessage.conversationId, conversations.id))
    .leftJoin(companies, eq(conversations.companyId, companies.id))
    .leftJoin(tickets, eq(conversations.ticketId, tickets.id))
    .leftJoin(workItems, eq(tickets.workItemId, workItems.id))
    .leftJoin(activityWorkItems, eq(activityWorkItems.id, conversations.workItemId))
    .leftJoin(activities, eq(activities.workItemId, conversations.workItemId))
    .leftJoin(projects, eq(conversations.projectId, projects.id))
    .leftJoin(
      conversationParticipants,
      and(
        eq(conversationParticipants.conversationId, conversations.id),
        eq(conversationParticipants.userId, userId),
      ),
    )
    .where(and(...conditions))
    .orderBy(
      sql`${conversationParticipants.pinnedAt} desc nulls last`,
      desc(conversations.updatedAt),
    )
    .limit(LIST_LIMIT);

  return rows.filter((r) => {
    if (view === "unread") return Number(r.unreadCount) > 0;
    if (view === "pinned") return r.pinnedAt !== null;
    if (view === "favorites") return r.favoriteAt !== null;
    if (view === "mentions") return Number(r.unreadMentions) > 0;
    if (view === "no_reply") return r.lastDirection === "inbound";
    if (view === "mine") return r.lastReadAt !== null || r.pinnedAt !== null || r.favoriteAt !== null;
    return true;
  });
}

export type InboxListRow = Awaited<ReturnType<typeof listConversations>>[number];

const MESSAGE_LIMIT = 200;

/** Full chat view: conversation + entity links + messages + mentions + attachments + participants. */
export async function getConversationDetail(orgId: number, userId: number, id: number) {
  const [conv] = await db
    .select({
      conversation: conversations,
      companyName: companies.name,
      contactName: sql<string | null>`${contacts.firstName} || ' ' || coalesce(${contacts.lastName}, '')`,
      ticketFolio: tickets.folio,
      ticketWorkItemId: tickets.workItemId,
      projectName: projects.name,
      projectFolio: projects.folio,
    })
    .from(conversations)
    .leftJoin(companies, eq(conversations.companyId, companies.id))
    .leftJoin(contacts, eq(conversations.contactId, contacts.id))
    .leftJoin(tickets, eq(conversations.ticketId, tickets.id))
    .leftJoin(projects, eq(conversations.projectId, projects.id))
    .where(and(eq(conversations.id, id), eq(conversations.organizationId, orgId)));
  if (!conv) return null;

  const [activity] = conv.conversation.workItemId
    ? await db
        .select({ id: activities.id, folio: activities.folio, title: workItems.title })
        .from(activities)
        .innerJoin(workItems, eq(activities.workItemId, workItems.id))
        .where(eq(activities.workItemId, conv.conversation.workItemId))
    : [];
  const [ticketItem] = conv.ticketWorkItemId
    ? await db
        .select({ title: workItems.title })
        .from(workItems)
        .where(eq(workItems.id, conv.ticketWorkItemId))
    : [];

  const msgs = await db
    .select({
      id: messages.id,
      direction: messages.direction,
      body: messages.body,
      channel: messages.channel,
      occurredAt: messages.occurredAt,
      editedAt: messages.editedAt,
      deletedAt: messages.deletedAt,
      authorUserId: messages.authorUserId,
      authorName: users.name,
      metadata: messages.metadata,
    })
    .from(messages)
    .leftJoin(users, eq(messages.authorUserId, users.id))
    .where(eq(messages.conversationId, id))
    .orderBy(messages.occurredAt, messages.id)
    .limit(MESSAGE_LIMIT);

  const messageIds = msgs.map((m) => m.id);
  const [mentionRows, attachmentRows, participantRows] = await Promise.all([
    messageIds.length
      ? db
          .select({
            messageId: messageMentions.messageId,
            userId: messageMentions.userId,
            userName: users.name,
          })
          .from(messageMentions)
          .innerJoin(users, eq(messageMentions.userId, users.id))
          .where(inArray(messageMentions.messageId, messageIds))
      : Promise.resolve([]),
    messageIds.length
      ? db
          .select({
            id: attachments.id,
            messageId: attachments.messageId,
            filename: attachments.filename,
            size: attachments.size,
          })
          .from(attachments)
          .where(inArray(attachments.messageId, messageIds))
      : Promise.resolve([]),
    db
      .select({
        id: conversationParticipants.id,
        userId: conversationParticipants.userId,
        userName: users.name,
        lastReadAt: conversationParticipants.lastReadAt,
        pinnedAt: conversationParticipants.pinnedAt,
        favoriteAt: conversationParticipants.favoriteAt,
      })
      .from(conversationParticipants)
      .innerJoin(users, eq(conversationParticipants.userId, users.id))
      .where(eq(conversationParticipants.conversationId, id))
      .orderBy(users.name),
  ]);

  const [me] = participantRows.filter((p) => p.userId === userId);

  return {
    ...conv,
    activity: activity ?? null,
    ticketTitle: ticketItem?.title ?? null,
    messages: msgs,
    mentionsByMessage: groupBy(mentionRows, (m) => m.messageId),
    attachmentsByMessage: groupBy(attachmentRows, (a) => a.messageId ?? 0),
    participants: participantRows,
    myState: me ?? null,
  };
}

function groupBy<T, K extends number | string>(rows: T[], key: (row: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = map.get(k);
    if (list) list.push(row);
    else map.set(k, [row]);
  }
  return map;
}

/** Unread mentions for Today's "No olvides" and the shell badge. Bounded. */
export async function getUserUnreadMentions(orgId: number, userId: number, limit = 20) {
  return db
    .select({
      mentionId: messageMentions.id,
      messageId: messages.id,
      conversationId: messages.conversationId,
      body: messages.body,
      occurredAt: messages.occurredAt,
      authorName: users.name,
      subject: conversations.subject,
      companyName: companies.name,
      ticketFolio: tickets.folio,
    })
    .from(messageMentions)
    .innerJoin(messages, eq(messageMentions.messageId, messages.id))
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .leftJoin(users, eq(messages.authorUserId, users.id))
    .leftJoin(companies, eq(conversations.companyId, companies.id))
    .leftJoin(tickets, eq(conversations.ticketId, tickets.id))
    .where(
      and(
        eq(conversations.organizationId, orgId),
        eq(messageMentions.userId, userId),
        isNull(messageMentions.readAt),
        isNull(messages.deletedAt),
      ),
    )
    .orderBy(desc(messages.occurredAt))
    .limit(limit);
}

/**
 * Compact summary for integration surfaces (Cliente 360, Proyectos,
 * Actividades): recent / pending / awaiting-reply conversation counts.
 */
export async function getConversationSummary(
  orgId: number,
  scope: { companyId?: number; projectId?: number; workItemId?: number },
) {
  const conditions: SQL[] = [eq(conversations.organizationId, orgId), ne(conversations.status, "archived")];
  if (scope.companyId) conditions.push(eq(conversations.companyId, scope.companyId));
  if (scope.projectId) conditions.push(eq(conversations.projectId, scope.projectId));
  if (scope.workItemId) conditions.push(eq(conversations.workItemId, scope.workItemId));

  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      open: sql<number>`count(*) filter (where ${conversations.status} = 'open')::int`,
      pending: sql<number>`count(*) filter (where ${conversations.status} = 'pending')::int`,
      awaitingReply: sql<number>`count(*) filter (where (
        select m.direction from messages m
        where m.conversation_id = ${conversations.id} and m.direction <> 'system'
        order by m.occurred_at desc limit 1
      ) = 'inbound')::int`,
      lastActivityAt: sql<string | null>`max(${conversations.updatedAt})`,
    })
    .from(conversations)
    .where(and(...conditions));

  return {
    total: Number(row?.total ?? 0),
    open: Number(row?.open ?? 0),
    pending: Number(row?.pending ?? 0),
    awaitingReply: Number(row?.awaitingReply ?? 0),
    lastActivityAt: row?.lastActivityAt ?? null,
  };
}

/* ============================================================ team feed */

export type TeamFeedFilters = { date: string; userId?: number };

export type TeamFeedItem = {
  kind: "time" | "message";
  id: number;
  at: Date;
  userId: number | null;
  userName: string | null;
  title: string | null;
  folio: string | null;
  companyName: string | null;
  ticketId: number | null;
  activityId: number | null;
  href: string;
  /** time-only */
  durationMinutes?: number;
  timeType?: string;
  description?: string;
  /** message-only */
  direction?: string;
  body?: string;
  channel?: string;
};

/**
 * Daily "what did the team do" review (Inbox, 2026-08-25): time logged on
 * Activities and Tickets, plus conversation messages, merged into one
 * chronological feed for a given day — the ClickUp-style Inbox reading the
 * PRD's "Improve operational execution" goal calls for, distinct from the
 * per-conversation inbox above.
 */
export async function getTeamActivityFeed(orgId: number, f: TeamFeedFilters): Promise<TeamFeedItem[]> {
  const activityWorkItems = alias(workItems, "feed_activity_work_items");
  const ticketWorkItems = alias(workItems, "feed_ticket_work_items");

  const timeConditions: SQL[] = [
    eq(timeEntries.organizationId, orgId),
    eq(timeEntries.date, f.date),
    isNull(timeEntries.voidedAt),
  ];
  if (f.userId) timeConditions.push(eq(timeEntries.userId, f.userId));

  const timeRows = await db
    .select({
      id: timeEntries.id,
      at: timeEntries.createdAt,
      userId: timeEntries.userId,
      userName: users.name,
      title: workItems.title,
      companyName: companies.name,
      ticketId: tickets.id,
      ticketFolio: tickets.folio,
      activityId: activities.id,
      activityFolio: activities.folio,
      durationMinutes: timeEntries.durationMinutes,
      timeType: timeEntries.timeType,
      description: timeEntries.description,
    })
    .from(timeEntries)
    .innerJoin(workItems, eq(timeEntries.workItemId, workItems.id))
    .leftJoin(tickets, eq(tickets.workItemId, workItems.id))
    .leftJoin(activities, eq(activities.workItemId, workItems.id))
    .leftJoin(companies, eq(workItems.companyId, companies.id))
    .leftJoin(users, eq(timeEntries.userId, users.id))
    .where(and(...timeConditions))
    .orderBy(desc(timeEntries.createdAt));

  const msgConditions: SQL[] = [
    eq(conversations.organizationId, orgId),
    ne(messages.direction, "system"),
    isNull(messages.deletedAt),
    sql`${messages.occurredAt}::date = ${f.date}::date`,
  ];
  if (f.userId) msgConditions.push(eq(messages.authorUserId, f.userId));

  const msgRows = await db
    .select({
      id: messages.id,
      at: messages.occurredAt,
      userId: messages.authorUserId,
      userName: users.name,
      direction: messages.direction,
      body: messages.body,
      channel: messages.channel,
      title: sql<string | null>`coalesce(${ticketWorkItems.title}, ${activityWorkItems.title})`,
      companyName: companies.name,
      ticketId: tickets.id,
      ticketFolio: tickets.folio,
      activityId: activities.id,
      activityFolio: activities.folio,
    })
    .from(messages)
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .leftJoin(tickets, eq(conversations.ticketId, tickets.id))
    .leftJoin(activities, eq(activities.workItemId, conversations.workItemId))
    .leftJoin(activityWorkItems, eq(activityWorkItems.id, conversations.workItemId))
    .leftJoin(ticketWorkItems, eq(ticketWorkItems.id, tickets.workItemId))
    .leftJoin(companies, eq(conversations.companyId, companies.id))
    .leftJoin(users, eq(messages.authorUserId, users.id))
    .where(and(...msgConditions))
    .orderBy(desc(messages.occurredAt));

  const items: TeamFeedItem[] = [
    ...timeRows.map((r) => ({
      kind: "time" as const,
      id: r.id,
      at: r.at,
      userId: r.userId,
      userName: r.userName,
      title: r.title,
      folio: r.ticketFolio ?? r.activityFolio,
      companyName: r.companyName,
      ticketId: r.ticketId,
      activityId: r.activityId,
      href: r.ticketId ? `/helpdesk/${r.ticketId}?tab=time` : `/activities/${r.activityId}`,
      durationMinutes: r.durationMinutes,
      timeType: r.timeType,
      description: r.description,
    })),
    ...msgRows.map((r) => ({
      kind: "message" as const,
      id: r.id,
      at: r.at,
      userId: r.userId,
      userName: r.userName,
      title: r.title,
      folio: r.ticketFolio ?? r.activityFolio,
      companyName: r.companyName,
      ticketId: r.ticketId,
      activityId: r.activityId,
      href: r.ticketId
        ? `/helpdesk/${r.ticketId}?tab=conversation`
        : r.activityId
          ? `/activities/${r.activityId}`
          : "/inbox",
      direction: r.direction,
      body: r.body,
      channel: r.channel,
    })),
  ];
  items.sort((a, b) => b.at.getTime() - a.at.getTime());
  return items;
}
