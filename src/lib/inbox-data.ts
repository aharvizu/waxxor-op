import { and, desc, eq, exists, ilike, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  attachments,
  clients,
  contacts,
  conversationParticipants,
  conversations,
  messageMentions,
  messages,
  projects,
  tickets,
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
  clientId?: number;
  projectId?: number;
  workItemId?: number;
  ticketId?: number;
  q?: string;
};

const LIST_LIMIT = 100;

/** Conversation list with per-user unread/pin/favorite state. One round-trip. */
export async function listConversations(orgId: number, userId: number, f: InboxFilters) {
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
  if (f.clientId) conditions.push(eq(conversations.clientId, f.clientId));
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
      ilike(clients.name, term),
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
      clientId: conversations.clientId,
      clientName: clients.name,
      ticketId: conversations.ticketId,
      ticketFolio: tickets.folio,
      ticketTitle: workItems.title,
      projectId: conversations.projectId,
      projectName: projects.name,
      activityId: conversations.workItemId,
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
    .leftJoin(clients, eq(conversations.clientId, clients.id))
    .leftJoin(tickets, eq(conversations.ticketId, tickets.id))
    .leftJoin(workItems, eq(tickets.workItemId, workItems.id))
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
      clientName: clients.name,
      contactName: sql<string | null>`${contacts.firstName} || ' ' || coalesce(${contacts.lastName}, '')`,
      ticketFolio: tickets.folio,
      ticketWorkItemId: tickets.workItemId,
      projectName: projects.name,
      projectFolio: projects.folio,
    })
    .from(conversations)
    .leftJoin(clients, eq(conversations.clientId, clients.id))
    .leftJoin(contacts, eq(conversations.contactId, contacts.id))
    .leftJoin(tickets, eq(conversations.ticketId, tickets.id))
    .leftJoin(projects, eq(conversations.projectId, projects.id))
    .where(and(eq(conversations.id, id), eq(conversations.organizationId, orgId)));
  if (!conv) return null;

  const [activity] = conv.conversation.workItemId
    ? await db
        .select({ id: workItems.id, title: workItems.title })
        .from(workItems)
        .where(eq(workItems.id, conv.conversation.workItemId))
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
      clientName: clients.name,
      ticketFolio: tickets.folio,
    })
    .from(messageMentions)
    .innerJoin(messages, eq(messageMentions.messageId, messages.id))
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .leftJoin(users, eq(messages.authorUserId, users.id))
    .leftJoin(clients, eq(conversations.clientId, clients.id))
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
  scope: { clientId?: number; projectId?: number; workItemId?: number },
) {
  const conditions: SQL[] = [eq(conversations.organizationId, orgId), ne(conversations.status, "archived")];
  if (scope.clientId) conditions.push(eq(conversations.clientId, scope.clientId));
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
