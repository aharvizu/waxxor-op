import { and, eq, isNull } from "drizzle-orm";
import type { DbExecutor } from "@/db";
import {
  conversationParticipants,
  conversations,
  messageMentions,
  messages,
  tickets,
  workItems,
} from "@/db/schema";
import { recordAudit } from "@/lib/audit";

/**
 * Shared conversation domain service (Inbox, 2026-07-18). Used by BOTH the
 * ticket composer (helpdesk logMessage) and /inbox — message writes, SLA
 * first-response stamping, mentions and system events live exactly once.
 */

export const CONVERSATION_STATUSES = ["open", "pending", "closed", "archived"] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

export const conversationStatusMeta: Record<string, { label: string; tone: "blue" | "amber" | "green" | "slate" }> = {
  open: { label: "Abierta", tone: "blue" },
  pending: { label: "Pendiente", tone: "amber" },
  closed: { label: "Cerrada", tone: "green" },
  archived: { label: "Archivada", tone: "slate" },
};

export function isConversationStatus(value: string): value is ConversationStatus {
  return (CONVERSATION_STATUSES as readonly string[]).includes(value);
}

/* ------------------------------------------------------------ pure rules */

type MessageLike = {
  authorUserId: number | null;
  direction: string;
  deletedAt: Date | null;
};

/** Own non-deleted, non-system messages and notes are editable by their author. */
export function canEditMessage(message: MessageLike, userId: number): boolean {
  return (
    message.deletedAt === null &&
    message.direction !== "system" &&
    message.authorUserId === userId
  );
}

/** Logical delete: same ownership rule (hard delete stays SuperAdmin, helpdesk). */
export function canSoftDeleteMessage(message: MessageLike, userId: number): boolean {
  return canEditMessage(message, userId);
}

/* --------------------------------------------------------- participants */

/** Lazily creates the per-user row for read/pin/favorite state. */
export async function ensureParticipant(
  tx: DbExecutor,
  conversationId: number,
  userId: number,
  addedById?: number,
) {
  const [existing] = await tx
    .select()
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, userId),
      ),
    );
  if (existing) return existing;
  const [created] = await tx
    .insert(conversationParticipants)
    .values({ conversationId, userId, addedById: addedById ?? userId })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  const [raced] = await tx
    .select()
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, userId),
      ),
    );
  return raced;
}

/* ------------------------------------------------------------- messages */

export type PostMessageInput = {
  organizationId: number;
  actorUserId: number;
  conversationId: number;
  direction: "inbound" | "outbound" | "internal" | "system";
  body: string;
  channel: string;
  mentionUserIds?: number[];
  metadata?: Record<string, unknown> | null;
  occurredAt?: Date;
};

/**
 * Writes one message inside the caller's transaction: inserts the row,
 * records selected mentions, bumps the conversation, marks the author's read
 * cursor, and — when the conversation belongs to a ticket — stamps the SLA
 * first response on the first outbound contact (IS NULL guard, never
 * overwritten; extracted from helpdesk logMessage so the rule lives once).
 */
export async function postConversationMessage(tx: DbExecutor, input: PostMessageInput) {
  const now = input.occurredAt ?? new Date();
  const [message] = await tx
    .insert(messages)
    .values({
      organizationId: input.organizationId,
      conversationId: input.conversationId,
      direction: input.direction,
      authorUserId: input.actorUserId,
      body: input.body,
      channel: input.channel as typeof messages.$inferInsert.channel,
      occurredAt: now,
      metadata: input.metadata ?? null,
    })
    .returning();

  const mentionIds = [...new Set(input.mentionUserIds ?? [])].filter(
    (id) => id !== input.actorUserId,
  );
  for (const userId of mentionIds) {
    await tx
      .insert(messageMentions)
      .values({ messageId: message.id, userId })
      .onConflictDoNothing();
  }

  await tx
    .update(conversations)
    .set({ updatedAt: now })
    .where(eq(conversations.id, input.conversationId));

  // The author has obviously read up to their own message.
  const participant = await ensureParticipant(tx, input.conversationId, input.actorUserId);
  if (participant) {
    await tx
      .update(conversationParticipants)
      .set({ lastReadAt: now })
      .where(eq(conversationParticipants.id, participant.id));
  }

  if (input.direction === "outbound") {
    await stampTicketFirstResponse(tx, input.organizationId, input.actorUserId, input.conversationId, now);
  }

  return message;
}

/** First outbound client contact freezes SLA first response — rule shared with helpdesk. */
async function stampTicketFirstResponse(
  tx: DbExecutor,
  organizationId: number,
  actorUserId: number,
  conversationId: number,
  now: Date,
) {
  const [conv] = await tx
    .select({ ticketId: conversations.ticketId })
    .from(conversations)
    .where(eq(conversations.id, conversationId));
  if (!conv?.ticketId) return;
  const [ticket] = await tx
    .select({ id: tickets.id, firstResponseAt: tickets.firstResponseAt, workItemId: tickets.workItemId })
    .from(tickets)
    .where(eq(tickets.id, conv.ticketId));
  if (!ticket || ticket.firstResponseAt) return;
  await tx
    .update(tickets)
    .set({ firstResponseAt: now })
    .where(and(eq(tickets.id, ticket.id), isNull(tickets.firstResponseAt)));
  await tx
    .update(workItems)
    .set({ updatedAt: now })
    .where(eq(workItems.id, ticket.workItemId));
  await recordAudit(tx, {
    organizationId,
    userId: actorUserId,
    entityType: "ticket",
    entityId: ticket.id,
    action: "update",
    field: "firstResponseAt",
    oldValue: null,
    newValue: now.toISOString(),
    metadata: { event: "first_response_registered", via: "message" },
  });
}

/**
 * System events are messages with direction "system" — they render inline in
 * the chat and never count as unread client communication.
 */
export async function recordSystemEvent(
  tx: DbExecutor,
  input: {
    organizationId: number;
    actorUserId: number;
    conversationId: number;
    body: string;
    metadata?: Record<string, unknown>;
  },
) {
  return postConversationMessage(tx, {
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    conversationId: input.conversationId,
    direction: "system",
    body: input.body,
    channel: "internal",
    metadata: { systemEvent: true, ...(input.metadata ?? {}) },
  });
}
