"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, type DbExecutor } from "@/db";
import {
  attachments,
  companies,
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
import {
  type ActionState,
  businessError,
  parseForm,
  success,
  unexpectedError,
} from "@/lib/action-result";
import { MAX_ATTACHMENT_BYTES, newStorageKey, saveAttachment } from "@/lib/attachments";
import { recordAudit } from "@/lib/audit";
import { channelAdapter } from "@/lib/channels";
import {
  canEditMessage,
  canSoftDeleteMessage,
  conversationStatusMeta,
  ensureParticipant,
  isConversationStatus,
  postConversationMessage,
  recordSystemEvent,
} from "@/lib/conversations";
import { requireUser, type SessionUser } from "@/lib/session";

class RuleError extends Error {}
class NotFoundError extends Error {}

function fail(err: unknown): ActionState {
  if (err instanceof NotFoundError) return businessError("La conversación ya no existe.");
  if (err instanceof RuleError) return businessError(err.message);
  return unexpectedError(err);
}

function refresh(id?: number) {
  revalidatePath("/inbox");
  if (id) revalidatePath(`/inbox?c=${id}`);
}

async function loadConversation(tx: DbExecutor, user: SessionUser, id: number) {
  const [row] = await tx
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.organizationId, user.organizationId)));
  if (!row) throw new NotFoundError();
  return row;
}

const optionalId = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
  z.number().int().positive().nullable(),
);

/* ------------------------------------------------------------ create/link */

const linksSchema = z.object({
  companyId: optionalId,
  contactId: optionalId,
  ticketId: optionalId,
  workItemId: optionalId,
  projectId: optionalId,
});

/** Re-validates every foreign id inside the org; contact must belong to the client. */
async function validateLinks(
  tx: DbExecutor,
  user: SessionUser,
  data: z.output<typeof linksSchema>,
) {
  const orgId = user.organizationId;
  let companyId = data.companyId;
  if (data.ticketId) {
    const [t] = await tx
      .select({ id: tickets.id, companyId: workItems.companyId })
      .from(tickets)
      .innerJoin(workItems, eq(tickets.workItemId, workItems.id))
      .where(and(eq(tickets.id, data.ticketId), eq(workItems.organizationId, orgId)));
    if (!t) throw new RuleError("El ticket no existe en esta organización.");
    companyId = companyId ?? t.companyId;
  }
  if (data.workItemId) {
    const [w] = await tx
      .select({ id: workItems.id, type: workItems.type, companyId: workItems.companyId })
      .from(workItems)
      .where(and(eq(workItems.id, data.workItemId), eq(workItems.organizationId, orgId)));
    if (!w) throw new RuleError("La actividad no existe en esta organización.");
    if (w.type !== "activity") throw new RuleError("Solo actividades pueden vincularse aquí (el ticket tiene su propio vínculo).");
    companyId = companyId ?? w.companyId;
  }
  if (companyId) {
    const [c] = await tx
      .select({ id: companies.id })
      .from(companies)
      .where(and(eq(companies.id, companyId), eq(companies.organizationId, orgId)));
    if (!c) throw new RuleError("El cliente no existe en esta organización.");
  }
  if (data.contactId) {
    const [ct] = await tx
      .select({ id: contacts.id, companyId: contacts.companyId })
      .from(contacts)
      .where(and(eq(contacts.id, data.contactId), eq(contacts.organizationId, orgId)));
    if (!ct) throw new RuleError("El contacto no existe en esta organización.");
    if (companyId && ct.companyId !== companyId) {
      throw new RuleError("El contacto no pertenece al cliente seleccionado.");
    }
    companyId = companyId ?? ct.companyId;
  }
  if (data.projectId) {
    const [p] = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, data.projectId), eq(projects.organizationId, orgId)));
    if (!p) throw new RuleError("El proyecto no existe en esta organización.");
  }
  return { ...data, companyId };
}

const createSchema = linksSchema.extend({
  subject: z.preprocess(
    (v) => (v === undefined || (typeof v === "string" && v.trim() === "") ? null : v),
    z.string().trim().max(200).nullable(),
  ),
  body: z.preprocess(
    (v) => (v === undefined || (typeof v === "string" && v.trim() === "") ? null : v),
    z.string().trim().max(10000).nullable(),
  ),
});

export async function createConversation(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(createSchema, formData);
  if (error) return error;
  if (!data.subject && !data.ticketId && !data.workItemId && !data.companyId && !data.projectId) {
    return businessError("Da un asunto o vincula la conversación a un cliente, ticket, actividad o proyecto.");
  }

  let conversationId = 0;
  try {
    conversationId = await db.transaction(async (tx) => {
      const links = await validateLinks(tx, user, data);

      if (links.ticketId) {
        // a ticket keeps exactly one conversation — reuse it if it exists
        const [existing] = await tx
          .select({ id: conversations.id })
          .from(conversations)
          .where(eq(conversations.ticketId, links.ticketId));
        if (existing) return existing.id;
      }

      const [created] = await tx
        .insert(conversations)
        .values({
          organizationId: user.organizationId,
          subject: data.subject,
          companyId: links.companyId,
          contactId: links.contactId,
          ticketId: links.ticketId,
          workItemId: links.workItemId,
          projectId: links.projectId,
          channel: "internal",
          status: "open",
          createdById: Number(user.id),
        })
        .returning({ id: conversations.id });
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "conversation",
        entityId: created.id,
        action: "create",
        metadata: {
          values: {
            subject: data.subject,
            companyId: links.companyId,
            contactId: links.contactId,
            ticketId: links.ticketId,
            workItemId: links.workItemId,
            projectId: links.projectId,
          },
        },
      });
      await ensureParticipant(tx, created.id, Number(user.id));
      if (data.body) {
        await postConversationMessage(tx, {
          organizationId: user.organizationId,
          actorUserId: Number(user.id),
          conversationId: created.id,
          direction: "outbound",
          body: data.body,
          channel: "internal",
        });
      }
      return created.id;
    });
  } catch (err) {
    return fail(err);
  }
  refresh();
  redirect(`/inbox?c=${conversationId}`);
}

export async function linkConversation(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(
    linksSchema.extend({ id: z.coerce.number().int().positive() }),
    formData,
  );
  if (error) return error;

  try {
    await db.transaction(async (tx) => {
      const conv = await loadConversation(tx, user, data.id);
      const links = await validateLinks(tx, user, data);
      if (links.ticketId && links.ticketId !== conv.ticketId) {
        const [existing] = await tx
          .select({ id: conversations.id })
          .from(conversations)
          .where(eq(conversations.ticketId, links.ticketId));
        if (existing) throw new RuleError("Ese ticket ya tiene su conversación.");
      }
      await tx
        .update(conversations)
        .set({
          companyId: links.companyId,
          contactId: links.contactId,
          ticketId: links.ticketId,
          workItemId: links.workItemId,
          projectId: links.projectId,
          updatedAt: new Date(),
        })
        .where(eq(conversations.id, conv.id));
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "conversation",
        entityId: conv.id,
        action: "update",
        metadata: { event: "conversation_links_updated", links },
      });
      await recordSystemEvent(tx, {
        organizationId: user.organizationId,
        actorUserId: Number(user.id),
        conversationId: conv.id,
        body: "Vínculos de la conversación actualizados.",
        metadata: { links },
      });
    });
  } catch (err) {
    return fail(err);
  }
  refresh(data.id);
  return success("Vínculos actualizados.");
}

/* --------------------------------------------------------------- messages */

const sendSchema = z.object({
  conversationId: z.coerce.number().int().positive(),
  kind: z.enum(["reply", "inbound", "note"]),
  channel: z.enum(["internal", "whatsapp", "email", "teams", "phone", "manual"]).default("internal"),
  body: z.string("Escribe el mensaje.").trim().min(1, "Escribe el mensaje.").max(10000),
});

export async function sendInboxMessage(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(sendSchema, formData);
  if (error) return error;
  const mentionUserIds = formData
    .getAll("mentionUserIds")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  for (const file of files) {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      return businessError(`"${file.name}" excede el límite de 15 MB.`);
    }
  }

  const direction = data.kind === "note" ? "internal" : data.kind === "inbound" ? "inbound" : "outbound";
  let deliveryNote: string | null = null;

  try {
    await db.transaction(async (tx) => {
      const conv = await loadConversation(tx, user, data.conversationId);
      if (conv.status === "archived") {
        throw new RuleError("La conversación está archivada — restáurala para escribir.");
      }
      for (const userId of mentionUserIds) {
        const [u] = await tx
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.id, userId), eq(users.organizationId, user.organizationId)));
        if (!u) throw new RuleError("Solo puedes mencionar usuarios de la organización.");
      }

      // Channel adapter: internal delivers (it IS the write); everything else
      // is a manual log until a real integration exists.
      let metadata: Record<string, unknown> | null = null;
      if (direction === "outbound") {
        const adapter = channelAdapter(data.channel);
        const result = adapter
          ? await adapter.deliver({ conversationId: conv.id, body: data.body, contactId: conv.contactId })
          : null;
        if (result && !result.ok) {
          metadata = { delivery: "manual_log", channelNote: result.message };
          deliveryNote = result.message;
        }
      }

      const message = await postConversationMessage(tx, {
        organizationId: user.organizationId,
        actorUserId: Number(user.id),
        conversationId: conv.id,
        direction,
        body: data.body,
        channel: data.kind === "note" ? "internal" : data.channel,
        mentionUserIds,
        metadata,
      });

      for (const file of files) {
        const storageKey = newStorageKey();
        await saveAttachment(storageKey, Buffer.from(await file.arrayBuffer()));
        await tx.insert(attachments).values({
          organizationId: user.organizationId,
          messageId: message.id,
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
          storageKey,
          uploadedById: Number(user.id),
        });
      }

      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "message",
        entityId: message.id,
        action: "create",
        metadata: {
          values: { conversationId: conv.id, direction, channel: data.channel, mentions: mentionUserIds, files: files.length },
        },
      });

      // A client reply reopens the thread's attention; a reply resolves nothing by itself.
      if (direction === "inbound" && conv.status === "closed") {
        await tx
          .update(conversations)
          .set({ status: "open" })
          .where(eq(conversations.id, conv.id));
      }
    });
  } catch (err) {
    return fail(err);
  }
  refresh(data.conversationId);
  return success(deliveryNote ?? undefined);
}

const editSchema = z.object({
  messageId: z.coerce.number().int().positive(),
  conversationId: z.coerce.number().int().positive(),
  body: z.string("Escribe el mensaje.").trim().min(1, "Escribe el mensaje.").max(10000),
});

export async function editInboxMessage(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(editSchema, formData);
  if (error) return error;

  try {
    await db.transaction(async (tx) => {
      await loadConversation(tx, user, data.conversationId);
      const [message] = await tx
        .select()
        .from(messages)
        .where(
          and(eq(messages.id, data.messageId), eq(messages.organizationId, user.organizationId)),
        );
      if (!message || message.conversationId !== data.conversationId) throw new NotFoundError();
      if (!canEditMessage(message, Number(user.id))) {
        throw new RuleError("Solo puedes editar tus propios mensajes no eliminados.");
      }
      await tx
        .update(messages)
        .set({ body: data.body, editedAt: new Date() })
        .where(eq(messages.id, message.id));
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "message",
        entityId: message.id,
        action: "update",
        field: "body",
        oldValue: message.body,
        newValue: data.body,
        metadata: { event: "message_edited" },
      });
    });
  } catch (err) {
    return fail(err);
  }
  refresh(data.conversationId);
  return success("Mensaje editado.");
}

export async function deleteInboxMessage(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(
    z.object({
      messageId: z.coerce.number().int().positive(),
      conversationId: z.coerce.number().int().positive(),
    }),
    formData,
  );
  if (error) return error;

  try {
    await db.transaction(async (tx) => {
      await loadConversation(tx, user, data.conversationId);
      const [message] = await tx
        .select()
        .from(messages)
        .where(
          and(eq(messages.id, data.messageId), eq(messages.organizationId, user.organizationId)),
        );
      if (!message || message.conversationId !== data.conversationId) throw new NotFoundError();
      if (!canSoftDeleteMessage(message, Number(user.id))) {
        throw new RuleError("Solo puedes eliminar tus propios mensajes.");
      }
      await tx
        .update(messages)
        .set({ deletedAt: new Date(), deletedById: Number(user.id) })
        .where(eq(messages.id, message.id));
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "message",
        entityId: message.id,
        action: "update",
        field: "deletedAt",
        oldValue: null,
        newValue: new Date().toISOString(),
        metadata: { event: "message_deleted_logical" },
      });
    });
  } catch (err) {
    return fail(err);
  }
  refresh(data.conversationId);
  return success("Mensaje eliminado.");
}

/* ----------------------------------------------------------------- status */

export async function setConversationStatus(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(
    z.object({
      conversationId: z.coerce.number().int().positive(),
      status: z.string().refine(isConversationStatus, "Estado desconocido."),
    }),
    formData,
  );
  if (error) return error;

  try {
    await db.transaction(async (tx) => {
      const conv = await loadConversation(tx, user, data.conversationId);
      if (conv.status === data.status) return;
      await tx
        .update(conversations)
        .set({
          status: data.status,
          archivedAt: data.status === "archived" ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(conversations.id, conv.id));
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "conversation",
        entityId: conv.id,
        action: "update",
        field: "status",
        oldValue: conv.status,
        newValue: data.status,
        metadata: { event: "conversation_status_changed" },
      });
      await recordSystemEvent(tx, {
        organizationId: user.organizationId,
        actorUserId: Number(user.id),
        conversationId: conv.id,
        body: `Estado cambiado a ${conversationStatusMeta[data.status]?.label ?? data.status}.`,
        metadata: { from: conv.status, to: data.status },
      });
    });
  } catch (err) {
    return fail(err);
  }
  refresh(data.conversationId);
  return success();
}

/* ------------------------------------------------- per-user state & reads */

const convIdSchema = z.object({ conversationId: z.coerce.number().int().positive() });

async function withParticipant(
  formData: FormData,
  fn: (
    tx: DbExecutor,
    user: SessionUser,
    participant: typeof conversationParticipants.$inferSelect,
  ) => Promise<void>,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(convIdSchema, formData);
  if (error) return error;
  try {
    await db.transaction(async (tx) => {
      await loadConversation(tx, user, data.conversationId);
      const participant = await ensureParticipant(tx, data.conversationId, Number(user.id));
      if (!participant) throw new NotFoundError();
      await fn(tx, user, participant);
    });
  } catch (err) {
    return fail(err);
  }
  refresh(data.conversationId);
  return success();
}

export async function togglePinConversation(_prev: ActionState, formData: FormData) {
  return withParticipant(formData, async (tx, _user, p) => {
    await tx
      .update(conversationParticipants)
      .set({ pinnedAt: p.pinnedAt ? null : new Date() })
      .where(eq(conversationParticipants.id, p.id));
  });
}

export async function toggleFavoriteConversation(_prev: ActionState, formData: FormData) {
  return withParticipant(formData, async (tx, _user, p) => {
    await tx
      .update(conversationParticipants)
      .set({ favoriteAt: p.favoriteAt ? null : new Date() })
      .where(eq(conversationParticipants.id, p.id));
  });
}

/** Read cursor to now + own unread mentions in the conversation marked read. */
export async function markConversationRead(_prev: ActionState, formData: FormData) {
  return withParticipant(formData, async (tx, user, p) => {
    await tx
      .update(conversationParticipants)
      .set({ lastReadAt: new Date() })
      .where(eq(conversationParticipants.id, p.id));
    const unread = await tx
      .select({ id: messageMentions.id })
      .from(messageMentions)
      .innerJoin(messages, eq(messageMentions.messageId, messages.id))
      .where(
        and(
          eq(messages.conversationId, p.conversationId),
          eq(messageMentions.userId, Number(user.id)),
          isNull(messageMentions.readAt),
        ),
      );
    for (const m of unread) {
      await tx
        .update(messageMentions)
        .set({ readAt: new Date() })
        .where(eq(messageMentions.id, m.id));
    }
  });
}

export async function markConversationUnread(_prev: ActionState, formData: FormData) {
  return withParticipant(formData, async (tx, _user, p) => {
    await tx
      .update(conversationParticipants)
      .set({ lastReadAt: null })
      .where(eq(conversationParticipants.id, p.id));
  });
}

export async function addConversationParticipant(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(
    convIdSchema.extend({ userId: z.coerce.number().int().positive() }),
    formData,
  );
  if (error) return error;

  try {
    await db.transaction(async (tx) => {
      await loadConversation(tx, user, data.conversationId);
      const [target] = await tx
        .select({ id: users.id, role: users.role, name: users.name })
        .from(users)
        .where(and(eq(users.id, data.userId), eq(users.organizationId, user.organizationId)));
      if (!target || target.role === "client") {
        throw new RuleError("El participante debe ser un usuario interno de la organización.");
      }
      await ensureParticipant(tx, data.conversationId, target.id, Number(user.id));
      await recordSystemEvent(tx, {
        organizationId: user.organizationId,
        actorUserId: Number(user.id),
        conversationId: data.conversationId,
        body: `${target.name} fue agregado a la conversación.`,
        metadata: { participantUserId: target.id },
      });
    });
  } catch (err) {
    return fail(err);
  }
  refresh(data.conversationId);
  return success("Participante agregado.");
}
