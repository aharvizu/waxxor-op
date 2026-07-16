"use server";

import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, type DbExecutor } from "@/db";
import {
  activities,
  attachments,
  clients,
  conversations,
  messages,
  tickets,
  timeEntries,
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
import {
  MAX_ATTACHMENT_BYTES,
  deleteAttachmentBlob,
  newStorageKey,
  saveAttachment,
} from "@/lib/attachments";
import { diffFields, recordAudit } from "@/lib/audit";
import { addWorkingMinutes, workingMinutesBetween } from "@/lib/business-time";
import {
  buildSlaSnapshot,
  getOrgCalendar,
  isSlaPauseStatus,
  resolveSlaDefinition,
  ticketCalendar,
} from "@/lib/sla";
import { requireRole, requireUser, type SessionUser } from "@/lib/session";
import {
  canTransition,
  closureBlockers,
  computeTicketAmount,
  confirmationTypeSchema,
  finalSlaCompliance,
  ticketBillingModalitySchema,
  ticketBillingStatusSchema,
  ticketWorkflowStatusSchema,
  type TicketStatus,
} from "@/lib/tickets";
import {
  createWorkItem,
  updateWorkItemFields,
  workItemPrioritySchema,
} from "@/lib/work-items";
import { activityTypeSchema } from "@/lib/activities";

class TicketNotFoundError extends Error {}
class InvalidTransitionError extends Error {
  constructor(
    public from: string,
    public to: string,
  ) {
    super(`invalid transition ${from} → ${to}`);
  }
}
class ClosureBlockedError extends Error {}
class NoteEditError extends Error {}
class LinkError extends Error {}

/* ------------------------------------------------------------- primitives */

const optionalId = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
  z.number().int().positive().nullable(),
);
const optionalText = z
  .string()
  .optional()
  .transform((v) => (v ?? "").trim() || null);
const optionalMoney = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : String(v)),
  z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, "Enter a valid amount (e.g. 750 or 750.50).")
    .nullable(),
);
const idSchema = z.object({ id: z.coerce.number().int().positive() });

/** Selects submit "" for the empty choice — treat it as "not provided". */
const optionalBillingStatus = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? undefined : v),
  ticketBillingStatusSchema.optional(),
);
const optionalConfirmationType = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? undefined : v),
  confirmationTypeSchema.optional(),
);

async function orgClientId(orgId: number, id: number | null) {
  if (id === null) return null;
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, id), eq(clients.organizationId, orgId)));
  return row?.id ?? null;
}

async function orgUserId(orgId: number, id: number | null) {
  if (id === null) return null;
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(eq(users.id, id), eq(users.organizationId, orgId), ne(users.role, "client")),
    );
  return row?.id ?? null;
}

/** Org-scoped ticket + work item; throws inside transactions. */
async function loadTicket(tx: DbExecutor, user: SessionUser, id: number) {
  const [row] = await tx
    .select({ ticket: tickets, item: workItems })
    .from(tickets)
    .innerJoin(workItems, eq(tickets.workItemId, workItems.id))
    .where(and(eq(tickets.id, id), eq(tickets.organizationId, user.organizationId)));
  if (!row) throw new TicketNotFoundError();
  return row;
}

/** Sum of non-voided time entry minutes on a work item. */
async function activeMinutes(tx: DbExecutor, workItemId: number): Promise<number> {
  const [row] = await tx
    .select({
      total: sql<number>`coalesce(sum(${timeEntries.durationMinutes}), 0)::int`,
    })
    .from(timeEntries)
    .where(and(eq(timeEntries.workItemId, workItemId), isNull(timeEntries.voidedAt)));
  return row.total;
}

/** Billable, non-voided minutes on a work item. */
async function billableMinutes(tx: DbExecutor, workItemId: number): Promise<number> {
  const [row] = await tx
    .select({
      total: sql<number>`coalesce(sum(${timeEntries.durationMinutes}), 0)::int`,
    })
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.workItemId, workItemId),
        isNull(timeEntries.voidedAt),
        eq(timeEntries.billingStatus, "billable"),
      ),
    );
  return row.total;
}

/**
 * Central status change: validates the transition, moves the work item and
 * runs SLA pause accounting. Lifecycle stamps are handled by the callers
 * (resolve/close/reopen). Call inside a transaction.
 */
async function applyStatusChange(
  tx: DbExecutor,
  user: SessionUser,
  row: { ticket: typeof tickets.$inferSelect; item: typeof workItems.$inferSelect },
  next: TicketStatus,
) {
  const from = row.item.status as TicketStatus;
  if (!canTransition(from, next)) throw new InvalidTransitionError(from, next);

  await updateWorkItemFields(tx, user, row.item.id, { status: next });

  if (row.ticket.slaDefinitionId) {
    const now = new Date();
    const entering = isSlaPauseStatus(next);
    const open = row.ticket.slaPausedAt !== null;
    if (entering && !open) {
      await tx
        .update(tickets)
        .set({ slaPausedAt: now })
        .where(eq(tickets.id, row.ticket.id));
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "ticket",
        entityId: row.ticket.id,
        action: "update",
        field: "slaPause",
        oldValue: null,
        newValue: now.toISOString(),
        metadata: { event: "sla_pause_start", status: next },
      });
    } else if (!entering && open) {
      const cal = ticketCalendar(row.ticket);
      const pausedDelta = workingMinutesBetween(row.ticket.slaPausedAt!, now, cal);
      const patch: Partial<typeof tickets.$inferInsert> = {
        slaPausedAt: null,
        slaPausedMinutes: row.ticket.slaPausedMinutes + pausedDelta,
      };
      if (row.ticket.resolutionTargetAt) {
        patch.resolutionTargetAt = addWorkingMinutes(
          row.ticket.resolutionTargetAt,
          pausedDelta,
          cal,
        );
      }
      await tx.update(tickets).set(patch).where(eq(tickets.id, row.ticket.id));
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "ticket",
        entityId: row.ticket.id,
        action: "update",
        field: "slaPause",
        oldValue: row.ticket.slaPausedAt!.toISOString(),
        newValue: null,
        metadata: {
          event: "sla_pause_end",
          pausedMinutes: pausedDelta,
          totalPausedMinutes: row.ticket.slaPausedMinutes + pausedDelta,
        },
      });
    }
  }
}

function ticketError(err: unknown): ActionState {
  if (err instanceof TicketNotFoundError) {
    return businessError("This ticket no longer exists.");
  }
  if (err instanceof InvalidTransitionError) {
    return businessError(`A ticket cannot move from "${err.from}" to "${err.to}".`);
  }
  return unexpectedError(err);
}

function refresh(id: number) {
  revalidatePath("/helpdesk");
  revalidatePath(`/helpdesk/${id}`);
}

/* ----------------------------------------------------------------- create */

const createTicketSchema = z.object({
  subject: z.string("Subject is required.").trim().min(1, "Subject is required."),
  description: optionalText,
  priority: workItemPrioritySchema.default("medium"),
  clientId: optionalId,
  assigneeId: optionalId,
  category: optionalText,
  subcategory: optionalText,
  channel: optionalText,
  modality: optionalText,
  contact: optionalText,
  slaDefinitionId: optionalId, // honored for superadmin only
});

export async function createTicket(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(createTicketSchema, formData);
  if (error) return error;

  const clientId = await orgClientId(user.organizationId, data.clientId);
  const assigneeId = await orgUserId(user.organizationId, data.assigneeId);

  let ticketId: number;
  try {
    ticketId = await db.transaction(async (tx) => {
      const item = await createWorkItem(tx, user, {
        type: "ticket",
        title: data.subject,
        description: data.description,
        status: assigneeId ? "assigned" : "new",
        priority: data.priority,
        clientId,
        assigneeId,
      });
      const explicitSlaId = user.role === "superadmin" ? data.slaDefinitionId : null;
      const definition = await resolveSlaDefinition(
        tx,
        user.organizationId,
        data.priority,
        explicitSlaId,
      );
      const snapshot = definition
        ? buildSlaSnapshot(
            definition,
            await getOrgCalendar(tx, user.organizationId),
            new Date(),
          )
        : {};
      const [ticket] = await tx
        .insert(tickets)
        .values({
          organizationId: user.organizationId,
          workItemId: item.id,
          folio: sql`'TK-' || lpad(nextval('ticket_folio_seq')::text, 6, '0')`,
          category: data.category,
          subcategory: data.subcategory,
          channel: data.channel,
          modality: data.modality,
          contact: data.contact,
          ...snapshot,
        })
        .returning({ id: tickets.id, folio: tickets.folio });
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "ticket",
        entityId: ticket.id,
        action: "create",
        metadata: {
          workItemId: item.id,
          folio: ticket.folio,
          sla: definition ? { id: definition.id, name: definition.name } : null,
        },
      });
      return ticket.id;
    });
  } catch (err) {
    return unexpectedError(err);
  }

  revalidatePath("/helpdesk");
  redirect(`/helpdesk/${ticketId}`);
}

/* --------------------------------------------------- details & assignment */

const detailsSchema = z.object({
  id: z.coerce.number().int().positive(),
  title: z.string("Title is required.").trim().min(1, "Title is required."),
  description: optionalText,
  category: optionalText,
  subcategory: optionalText,
  channel: optionalText,
  modality: optionalText,
  contact: optionalText,
  clientId: optionalId,
});

export async function updateTicketDetails(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(detailsSchema, formData);
  if (error) return error;

  const clientId = await orgClientId(user.organizationId, data.clientId);

  try {
    await db.transaction(async (tx) => {
      const row = await loadTicket(tx, user, data.id);
      await updateWorkItemFields(tx, user, row.item.id, {
        title: data.title,
        description: data.description,
        clientId,
      });
      const patch = {
        category: data.category,
        subcategory: data.subcategory,
        channel: data.channel,
        modality: data.modality,
        contact: data.contact,
      };
      const changes = diffFields(
        {
          organizationId: user.organizationId,
          userId: Number(user.id),
          entityType: "ticket",
          entityId: row.ticket.id,
        },
        row.ticket,
        patch,
        ["category", "subcategory", "channel", "modality", "contact"],
      );
      if (changes.length > 0) {
        await tx.update(tickets).set(patch).where(eq(tickets.id, row.ticket.id));
        await recordAudit(tx, changes);
      }
    });
  } catch (err) {
    return ticketError(err);
  }
  refresh(data.id);
  return success("Ticket updated.");
}

const renameSchema = z.object({
  id: z.coerce.number().int().positive(),
  title: z.string("Title is required.").trim().min(1, "Title is required."),
});

/** Inline title edit — touches nothing else. */
export async function renameTicket(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(renameSchema, formData);
  if (error) return error;
  try {
    await db.transaction(async (tx) => {
      const row = await loadTicket(tx, user, data.id);
      await updateWorkItemFields(tx, user, row.item.id, { title: data.title });
    });
  } catch (err) {
    return ticketError(err);
  }
  refresh(data.id);
  return success("Title updated.");
}

const assignSchema = z.object({
  id: z.coerce.number().int().positive(),
  assigneeId: optionalId,
});

export async function assignTicket(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(assignSchema, formData);
  if (error) return error;

  const assigneeId = await orgUserId(user.organizationId, data.assigneeId);

  try {
    await db.transaction(async (tx) => {
      const row = await loadTicket(tx, user, data.id);
      await updateWorkItemFields(tx, user, row.item.id, { assigneeId });
      // assigning a new ticket moves it forward automatically
      if (assigneeId && row.item.status === "new") {
        await applyStatusChange(tx, user, row, "assigned");
      }
    });
  } catch (err) {
    return ticketError(err);
  }
  refresh(data.id);
  return success("Assignee updated.");
}

const prioritySchema = z.object({
  id: z.coerce.number().int().positive(),
  priority: workItemPrioritySchema,
});

export async function setTicketPriority(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(prioritySchema, formData);
  if (error) return error;
  try {
    await db.transaction(async (tx) => {
      const row = await loadTicket(tx, user, data.id);
      await updateWorkItemFields(tx, user, row.item.id, { priority: data.priority });
    });
  } catch (err) {
    return ticketError(err);
  }
  refresh(data.id);
  return success("Priority updated.");
}

const statusSchema = z.object({
  id: z.coerce.number().int().positive(),
  status: ticketWorkflowStatusSchema,
});

export async function changeTicketStatus(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(statusSchema, formData);
  if (error) return error;
  try {
    await db.transaction(async (tx) => {
      const row = await loadTicket(tx, user, data.id);
      await applyStatusChange(tx, user, row, data.status);
    });
  } catch (err) {
    return ticketError(err);
  }
  refresh(data.id);
  return success("Status updated.");
}

/* ---------------------------------------------- resolve / close / reopen */

const BLOCKER_MESSAGES: Record<string, string> = {
  resolution: "a resolution",
  category: "a category",
  confirmation_type: "a confirmation type",
  time_or_exception:
    "at least one active time entry (or an explicit time exception with a reason)",
};

/** Shared closing routine — call inside a transaction. */
async function performClose(
  tx: DbExecutor,
  user: SessionUser,
  row: { ticket: typeof tickets.$inferSelect; item: typeof workItems.$inferSelect },
  input: {
    confirmationType?: (typeof tickets.confirmationType.enumValues)[number];
    confirmationNotes: string | null;
    timeExceptionReason: string | null;
    billingStatus?: (typeof tickets.billingStatus.enumValues)[number];
  },
) {
  const minutes = await activeMinutes(tx, row.item.id);
  const confirmationType = input.confirmationType ?? row.ticket.confirmationType;
  const blockers = closureBlockers({
    resolution: row.ticket.resolution,
    category: row.ticket.category,
    confirmationType: confirmationType ?? null,
    activeTimeMinutes: minutes,
    timeExceptionReason:
      input.timeExceptionReason ?? row.ticket.timeExceptionReason,
  });
  if (blockers.length > 0) {
    throw new ClosureBlockedError(
      `Cannot close: missing ${blockers.map((b) => BLOCKER_MESSAGES[b] ?? b).join(", ")}.`,
    );
  }

  await applyStatusChange(tx, user, row, "closed");

  const now = new Date();
  const compliance = finalSlaCompliance({
    firstResponseAt: row.ticket.firstResponseAt,
    firstResponseTargetAt: row.ticket.firstResponseTargetAt,
    resolvedAt: row.ticket.resolvedAt ?? now,
    resolutionTargetAt: row.ticket.resolutionTargetAt,
  });

  const patch: Partial<typeof tickets.$inferInsert> = {
    closedAt: row.ticket.closedAt ?? now,
    ...compliance,
  };
  if (input.confirmationType) {
    patch.confirmationType = input.confirmationType;
    patch.confirmationAt = row.ticket.confirmationAt ?? now;
    patch.confirmationNotes = input.confirmationNotes;
  }
  if (minutes <= 0 && input.timeExceptionReason) {
    patch.timeExceptionReason = input.timeExceptionReason;
    patch.timeExceptionById = Number(user.id);
    patch.timeExceptionAt = now;
    await recordAudit(tx, {
      organizationId: user.organizationId,
      userId: Number(user.id),
      entityType: "ticket",
      entityId: row.ticket.id,
      action: "update",
      field: "timeException",
      oldValue: null,
      newValue: input.timeExceptionReason,
      metadata: { event: "time_exception_granted" },
    });
  }
  // billing decision required at close while still pending_review — never auto-billable
  if (row.ticket.billingStatus === "pending_review" && input.billingStatus) {
    patch.billingStatus = input.billingStatus;
    patch.billingDeterminedById = Number(user.id);
    patch.billingDeterminedAt = now;
    await recordAudit(tx, {
      organizationId: user.organizationId,
      userId: Number(user.id),
      entityType: "ticket",
      entityId: row.ticket.id,
      action: "update",
      field: "billingStatus",
      oldValue: "pending_review",
      newValue: input.billingStatus,
      metadata: { event: "billing_set_at_close" },
    });
  }
  await tx.update(tickets).set(patch).where(eq(tickets.id, row.ticket.id));
  await recordAudit(tx, {
    organizationId: user.organizationId,
    userId: Number(user.id),
    entityType: "ticket",
    entityId: row.ticket.id,
    action: "update",
    field: "closedAt",
    oldValue: null,
    newValue: (patch.closedAt as Date).toISOString(),
    metadata: {
      event: "ticket_closed",
      confirmationType: patch.confirmationType ?? row.ticket.confirmationType,
      slaFirstResponseMet: compliance.slaFirstResponseMet,
      slaResolutionMet: compliance.slaResolutionMet,
      activeMinutes: minutes,
    },
  });
}

const resolveSchema = z.object({
  id: z.coerce.number().int().positive(),
  resolution: z
    .string("Resolution is required.")
    .trim()
    .min(1, "Resolution is required."),
  category: z.string("Category is required.").trim().min(1, "Category is required."),
  subcategory: optionalText,
  nextStatus: z.enum(["pending_confirmation", "closed"]),
  confirmationType: optionalConfirmationType,
  confirmationNotes: optionalText,
  timeExceptionReason: optionalText,
  billingStatus: optionalBillingStatus,
});

export async function resolveTicket(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(resolveSchema, formData);
  if (error) return error;

  try {
    await db.transaction(async (tx) => {
      const row = await loadTicket(tx, user, data.id);
      const now = new Date();

      await applyStatusChange(tx, user, row, "resolved");
      const resolvedAt = row.ticket.resolvedAt ?? now;
      await tx
        .update(tickets)
        .set({
          resolution: data.resolution,
          category: data.category,
          subcategory: data.subcategory ?? row.ticket.subcategory,
          resolvedAt,
        })
        .where(eq(tickets.id, row.ticket.id));
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "ticket",
        entityId: row.ticket.id,
        action: "update",
        field: "resolution",
        oldValue: row.ticket.resolution,
        newValue: data.resolution,
        metadata: {
          event: "ticket_resolved",
          category: data.category,
          registeredMinutes: await activeMinutes(tx, row.item.id),
        },
      });

      const fresh = await loadTicket(tx, user, data.id);
      if (data.nextStatus === "closed") {
        await performClose(tx, user, fresh, {
          confirmationType: data.confirmationType,
          confirmationNotes: data.confirmationNotes ?? null,
          timeExceptionReason: data.timeExceptionReason ?? null,
          billingStatus: data.billingStatus,
        });
      } else {
        await applyStatusChange(tx, user, fresh, "pending_confirmation");
      }
    });
  } catch (err) {
    if (err instanceof ClosureBlockedError) return businessError(err.message);
    return ticketError(err);
  }
  refresh(data.id);
  return success(
    data.nextStatus === "closed"
      ? "Ticket resolved and closed."
      : "Ticket resolved — pending confirmation.",
  );
}

const closeSchema = z.object({
  id: z.coerce.number().int().positive(),
  confirmationType: confirmationTypeSchema,
  confirmationNotes: optionalText,
  confirmationChannel: optionalText,
  timeExceptionReason: optionalText,
  billingStatus: optionalBillingStatus,
});

export async function closeTicket(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(closeSchema, formData);
  if (error) return error;

  try {
    await db.transaction(async (tx) => {
      const row = await loadTicket(tx, user, data.id);
      if (data.confirmationChannel) {
        await tx
          .update(tickets)
          .set({ confirmationChannel: data.confirmationChannel })
          .where(eq(tickets.id, row.ticket.id));
      }
      await performClose(tx, user, row, {
        confirmationType: data.confirmationType,
        confirmationNotes: data.confirmationNotes ?? null,
        timeExceptionReason: data.timeExceptionReason ?? null,
        billingStatus: data.billingStatus,
      });
    });
  } catch (err) {
    if (err instanceof ClosureBlockedError) return businessError(err.message);
    return ticketError(err);
  }
  refresh(data.id);
  return success("Ticket closed.");
}

const reopenSchema = z.object({
  id: z.coerce.number().int().positive(),
  reason: z
    .string("A reopen reason is required.")
    .trim()
    .min(1, "A reopen reason is required."),
});

export async function reopenTicket(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(reopenSchema, formData);
  if (error) return error;

  try {
    await db.transaction(async (tx) => {
      const row = await loadTicket(tx, user, data.id);
      const now = new Date();
      await applyStatusChange(tx, user, row, "reopened");
      await tx
        .update(tickets)
        .set({
          reopenCount: row.ticket.reopenCount + 1,
          lastReopenedAt: now,
          lastReopenReason: data.reason,
          // the new cycle re-stamps these; previous values live in audit metadata
          resolvedAt: null,
          closedAt: null,
          confirmationType: null,
          confirmationAt: null,
          slaFirstResponseMet: null,
          slaResolutionMet: null,
        })
        .where(eq(tickets.id, row.ticket.id));
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "ticket",
        entityId: row.ticket.id,
        action: "update",
        field: "reopened",
        oldValue: row.item.status,
        newValue: "reopened",
        metadata: {
          event: "ticket_reopened",
          reason: data.reason,
          reopenCount: row.ticket.reopenCount + 1,
          previous: {
            resolvedAt: row.ticket.resolvedAt?.toISOString() ?? null,
            closedAt: row.ticket.closedAt?.toISOString() ?? null,
            confirmationType: row.ticket.confirmationType,
          },
        },
      });
    });
  } catch (err) {
    return ticketError(err);
  }
  refresh(data.id);
  return success("Ticket reopened.");
}

/** Permanent deletion — SuperAdmin only. Cancelling (a status) never deletes. */
export async function deleteTicket(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const me = await requireRole("superadmin");
  const { data, error } = parseForm(idSchema, formData);
  if (error) return error;

  try {
    await db.transaction(async (tx) => {
      const row = await loadTicket(tx, me, data.id);
      await tx
        .update(activities)
        .set({ parentTicketId: null })
        .where(eq(activities.parentTicketId, row.ticket.id));
      await tx.delete(attachments).where(eq(attachments.workItemId, row.item.id));
      await tx.delete(conversations).where(eq(conversations.ticketId, row.ticket.id));
      await tx.delete(timeEntries).where(eq(timeEntries.workItemId, row.item.id));
      await tx.delete(tickets).where(eq(tickets.id, row.ticket.id));
      await tx.delete(workItems).where(eq(workItems.id, row.item.id));
      await recordAudit(tx, {
        organizationId: me.organizationId,
        userId: Number(me.id),
        entityType: "ticket",
        entityId: row.ticket.id,
        action: "delete",
        metadata: {
          values: {
            folio: row.ticket.folio,
            title: row.item.title,
            status: row.item.status,
          },
        },
      });
    });
  } catch (err) {
    return ticketError(err);
  }
  revalidatePath("/helpdesk");
  redirect("/helpdesk");
}

/* --------------------------------------------------------------- billing */

const billingSchema = z.object({
  id: z.coerce.number().int().positive(),
  billingStatus: ticketBillingStatusSchema,
  billingModality: ticketBillingModalitySchema,
  hourlyRate: optionalMoney,
  fixedAmount: optionalMoney,
  billingPeriod: optionalText,
  externalReference: optionalText,
  billingNotes: optionalText,
});

export async function setTicketBilling(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(billingSchema, formData);
  if (error) return error;

  try {
    await db.transaction(async (tx) => {
      const row = await loadTicket(tx, user, data.id);
      const minutes = await billableMinutes(tx, row.item.id);
      const calculatedAmount = computeTicketAmount({
        modality: data.billingModality,
        billableMinutes: minutes,
        hourlyRate: data.hourlyRate,
        fixedAmount: data.fixedAmount,
      });
      const patch = {
        billingStatus: data.billingStatus,
        billingModality: data.billingModality,
        hourlyRate: data.hourlyRate,
        fixedAmount: data.fixedAmount,
        calculatedAmount,
        billingPeriod: data.billingPeriod,
        externalReference: data.externalReference,
        billingNotes: data.billingNotes,
      };
      const changes = diffFields(
        {
          organizationId: user.organizationId,
          userId: Number(user.id),
          entityType: "ticket",
          entityId: row.ticket.id,
        },
        row.ticket,
        patch,
        [
          "billingStatus",
          "billingModality",
          "hourlyRate",
          "fixedAmount",
          "calculatedAmount",
          "billingPeriod",
          "externalReference",
          "billingNotes",
        ],
      );
      if (changes.length === 0) return;
      await tx
        .update(tickets)
        .set({
          ...patch,
          billingDeterminedById: Number(user.id),
          billingDeterminedAt: new Date(),
        })
        .where(eq(tickets.id, row.ticket.id));
      await recordAudit(tx, changes);
    });
  } catch (err) {
    return ticketError(err);
  }
  refresh(data.id);
  return success("Billing classification updated.");
}

/* -------------------------------------------------- conversation & notes */

async function getOrCreateConversation(
  tx: DbExecutor,
  user: SessionUser,
  row: { ticket: typeof tickets.$inferSelect; item: typeof workItems.$inferSelect },
) {
  const [existing] = await tx
    .select()
    .from(conversations)
    .where(eq(conversations.ticketId, row.ticket.id));
  if (existing) return existing;
  const [created] = await tx
    .insert(conversations)
    .values({
      organizationId: user.organizationId,
      clientId: row.item.clientId,
      ticketId: row.ticket.id,
      channel: "manual",
    })
    .returning();
  return created;
}

const messageSchema = z.object({
  id: z.coerce.number().int().positive(), // ticket id
  kind: z.enum(["outbound", "inbound", "note", "call", "confirmation_request"]),
  body: z
    .string("Write the message or note.")
    .trim()
    .min(1, "Write the message or note."),
  channel: z
    .enum(["manual", "whatsapp", "email", "phone", "portal", "internal"])
    .default("manual"),
});

export async function logMessage(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(messageSchema, formData);
  if (error) return error;

  const direction =
    data.kind === "inbound" ? "inbound" : data.kind === "note" ? "internal" : "outbound";
  const channel =
    data.kind === "call" ? "phone" : data.kind === "note" ? "internal" : data.channel;

  try {
    await db.transaction(async (tx) => {
      const row = await loadTicket(tx, user, data.id);
      const conversation = await getOrCreateConversation(tx, user, row);
      const now = new Date();
      const [message] = await tx
        .insert(messages)
        .values({
          organizationId: user.organizationId,
          conversationId: conversation.id,
          direction,
          authorUserId: Number(user.id),
          body: data.body,
          channel,
          occurredAt: now,
          metadata:
            data.kind === "call"
              ? { call: true }
              : data.kind === "confirmation_request"
                ? { confirmationRequest: true }
                : null,
        })
        .returning({ id: messages.id });
      await tx
        .update(conversations)
        .set({ updatedAt: now })
        .where(eq(conversations.id, conversation.id));
      await tx
        .update(workItems)
        .set({ updatedAt: now })
        .where(eq(workItems.id, row.item.id));

      if (direction === "outbound") {
        // SLA first response from the first outbound customer contact — never overwritten
        if (!row.ticket.firstResponseAt) {
          await tx
            .update(tickets)
            .set({ firstResponseAt: now })
            .where(and(eq(tickets.id, row.ticket.id), isNull(tickets.firstResponseAt)));
          await recordAudit(tx, {
            organizationId: user.organizationId,
            userId: Number(user.id),
            entityType: "ticket",
            entityId: row.ticket.id,
            action: "update",
            field: "firstResponseAt",
            oldValue: null,
            newValue: now.toISOString(),
            metadata: { event: "first_response_registered", source: "outbound_message" },
          });
        }
        if (data.kind === "confirmation_request") {
          await tx
            .update(tickets)
            .set({ lastContactAttemptAt: now })
            .where(eq(tickets.id, row.ticket.id));
        }
      }

      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "message",
        entityId: message.id,
        action: "create",
        metadata: { ticketId: row.ticket.id, kind: data.kind, direction, channel },
      });
    });
  } catch (err) {
    return ticketError(err);
  }
  refresh(data.id);
  return success(data.kind === "note" ? "Internal note added." : "Interaction logged.");
}

const editNoteSchema = z.object({
  messageId: z.coerce.number().int().positive(),
  ticketId: z.coerce.number().int().positive(),
  body: z.string("Write the note.").trim().min(1, "Write the note."),
});

/** Only the author may edit, and only internal notes. */
export async function editOwnNote(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(editNoteSchema, formData);
  if (error) return error;

  try {
    await db.transaction(async (tx) => {
      const [message] = await tx
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.id, data.messageId),
            eq(messages.organizationId, user.organizationId),
          ),
        );
      if (!message) throw new TicketNotFoundError();
      if (message.direction !== "internal") {
        throw new NoteEditError("Only internal notes can be edited.");
      }
      if (message.authorUserId !== Number(user.id)) {
        throw new NoteEditError("You can only edit your own notes.");
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
        metadata: { event: "note_edited" },
      });
    });
  } catch (err) {
    if (err instanceof NoteEditError) return businessError(err.message);
    return ticketError(err);
  }
  refresh(data.ticketId);
  return success("Note updated.");
}

/** Permanent message deletion — SuperAdmin only. */
export async function deleteMessage(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const me = await requireRole("superadmin");
  const { data, error } = parseForm(
    z.object({
      messageId: z.coerce.number().int().positive(),
      ticketId: z.coerce.number().int().positive(),
    }),
    formData,
  );
  if (error) return error;

  try {
    await db.transaction(async (tx) => {
      const [message] = await tx
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.id, data.messageId),
            eq(messages.organizationId, me.organizationId),
          ),
        );
      if (!message) throw new TicketNotFoundError();
      await tx.delete(attachments).where(eq(attachments.messageId, message.id));
      await tx.delete(messages).where(eq(messages.id, message.id));
      await recordAudit(tx, {
        organizationId: me.organizationId,
        userId: Number(me.id),
        entityType: "message",
        entityId: message.id,
        action: "delete",
        metadata: {
          values: {
            direction: message.direction,
            channel: message.channel,
            body: message.body,
          },
        },
      });
    });
  } catch (err) {
    return ticketError(err);
  }
  refresh(data.ticketId);
  return success("Message deleted permanently.");
}

/* ---------------------------------------------------- related activities */

const relatedActivitySchema = z.object({
  id: z.coerce.number().int().positive(), // ticket id
  title: z.string("Title is required.").trim().min(1, "Title is required."),
  activityType: activityTypeSchema.default("general"),
  priority: workItemPrioritySchema.default("medium"),
  assigneeId: optionalId,
  dueDate: optionalText,
});

export async function createRelatedActivity(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(relatedActivitySchema, formData);
  if (error) return error;

  const assigneeId = await orgUserId(user.organizationId, data.assigneeId);

  try {
    await db.transaction(async (tx) => {
      const row = await loadTicket(tx, user, data.id);
      const item = await createWorkItem(tx, user, {
        type: "activity",
        title: data.title,
        status: "pending",
        priority: data.priority,
        clientId: row.item.clientId,
        assigneeId,
        dueDate: data.dueDate,
      });
      const [activity] = await tx
        .insert(activities)
        .values({
          organizationId: user.organizationId,
          workItemId: item.id,
          activityType: data.activityType,
          parentTicketId: row.ticket.id,
        })
        .returning({ id: activities.id });
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "activity",
        entityId: activity.id,
        action: "create",
        metadata: { workItemId: item.id, parentTicketId: row.ticket.id, related: true },
      });
    });
  } catch (err) {
    return ticketError(err);
  }
  refresh(data.id);
  return success("Related activity created.");
}

const linkSchema = z.object({
  id: z.coerce.number().int().positive(), // ticket id
  activityId: z.coerce.number().int().positive("Select an activity."),
});

export async function linkActivity(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(linkSchema, formData);
  if (error) return error;

  try {
    await db.transaction(async (tx) => {
      const row = await loadTicket(tx, user, data.id);
      const [candidate] = await tx
        .select({ activity: activities, item: workItems })
        .from(activities)
        .innerJoin(workItems, eq(activities.workItemId, workItems.id))
        .where(
          and(
            eq(activities.id, data.activityId),
            eq(activities.organizationId, user.organizationId),
          ),
        );
      if (!candidate) {
        throw new LinkError("That activity doesn't exist in this organization.");
      }
      if (candidate.activity.convertedAt) {
        throw new LinkError("Converted activities cannot be linked.");
      }
      if (candidate.activity.archivedAt) {
        throw new LinkError("Archived activities cannot be linked.");
      }
      if (candidate.item.type !== "activity") {
        throw new LinkError("Project items cannot be linked to tickets.");
      }
      if (candidate.activity.parentTicketId) {
        throw new LinkError("That activity is already linked to a ticket.");
      }
      await tx
        .update(activities)
        .set({ parentTicketId: row.ticket.id })
        .where(eq(activities.id, candidate.activity.id));
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "activity",
        entityId: candidate.activity.id,
        action: "update",
        field: "parentTicketId",
        oldValue: null,
        newValue: String(row.ticket.id),
        metadata: { event: "activity_linked", ticketId: row.ticket.id },
      });
    });
  } catch (err) {
    if (err instanceof LinkError) return businessError(err.message);
    return ticketError(err);
  }
  refresh(data.id);
  return success("Activity linked.");
}

export async function unlinkActivity(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(linkSchema, formData);
  if (error) return error;

  try {
    await db.transaction(async (tx) => {
      const row = await loadTicket(tx, user, data.id);
      const [activity] = await tx
        .select()
        .from(activities)
        .where(
          and(
            eq(activities.id, data.activityId),
            eq(activities.organizationId, user.organizationId),
            eq(activities.parentTicketId, row.ticket.id),
          ),
        );
      if (!activity) throw new TicketNotFoundError();
      await tx
        .update(activities)
        .set({ parentTicketId: null })
        .where(eq(activities.id, activity.id));
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "activity",
        entityId: activity.id,
        action: "update",
        field: "parentTicketId",
        oldValue: String(row.ticket.id),
        newValue: null,
        metadata: { event: "activity_unlinked", ticketId: row.ticket.id },
      });
    });
  } catch (err) {
    return ticketError(err);
  }
  refresh(data.id);
  return success("Activity unlinked.");
}

/* -------------------------------------------------------------- attachments */

export async function uploadAttachment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  const file = formData.get("file");
  if (!parsed.success || !(file instanceof File) || file.size === 0) {
    return {
      ok: false,
      kind: "validation",
      message: "Pick a file to upload.",
      fieldErrors: { file: ["Pick a file to upload."] },
    };
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return businessError("Files larger than 15 MB are not supported yet.");
  }

  const storageKey = newStorageKey();
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    await db.transaction(async (tx) => {
      const row = await loadTicket(tx, user, parsed.data.id);
      const [attachment] = await tx
        .insert(attachments)
        .values({
          organizationId: user.organizationId,
          workItemId: row.item.id,
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
          storageKey,
          uploadedById: Number(user.id),
        })
        .returning({ id: attachments.id });
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "attachment",
        entityId: attachment.id,
        action: "create",
        metadata: { ticketId: row.ticket.id, filename: file.name, size: file.size },
      });
      // write the blob last: if it fails, metadata and audit roll back with it
      await saveAttachment(storageKey, buffer);
    });
  } catch (err) {
    await deleteAttachmentBlob(storageKey);
    return ticketError(err);
  }
  refresh(parsed.data.id);
  return success("File attached.");
}

export async function deleteAttachment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const me = await requireRole("superadmin");
  const { data, error } = parseForm(
    z.object({
      attachmentId: z.coerce.number().int().positive(),
      ticketId: z.coerce.number().int().positive(),
    }),
    formData,
  );
  if (error) return error;

  try {
    let storageKey = "";
    await db.transaction(async (tx) => {
      const [attachment] = await tx
        .select()
        .from(attachments)
        .where(
          and(
            eq(attachments.id, data.attachmentId),
            eq(attachments.organizationId, me.organizationId),
          ),
        );
      if (!attachment) throw new TicketNotFoundError();
      storageKey = attachment.storageKey;
      await tx.delete(attachments).where(eq(attachments.id, attachment.id));
      await recordAudit(tx, {
        organizationId: me.organizationId,
        userId: Number(me.id),
        entityType: "attachment",
        entityId: attachment.id,
        action: "delete",
        metadata: { values: { filename: attachment.filename, size: attachment.size } },
      });
    });
    await deleteAttachmentBlob(storageKey);
  } catch (err) {
    return ticketError(err);
  }
  refresh(data.ticketId);
  return success("Attachment deleted.");
}

/* --------------------------------------------------------- first response */

/**
 * Explicit "Register first response" (SLA). Stamped once; never overwritten.
 * Single-button form — kept as a plain action (no fields, nothing to show).
 */
export async function registerFirstResponse(formData: FormData) {
  const user = await requireUser();
  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  await db.transaction(async (tx) => {
    const [ticket] = await tx
      .select({ id: tickets.id, firstResponseAt: tickets.firstResponseAt })
      .from(tickets)
      .where(
        and(
          eq(tickets.id, parsed.data.id),
          eq(tickets.organizationId, user.organizationId),
        ),
      );
    if (!ticket || ticket.firstResponseAt) return;

    const now = new Date();
    await tx
      .update(tickets)
      .set({ firstResponseAt: now })
      .where(and(eq(tickets.id, ticket.id), isNull(tickets.firstResponseAt)));
    await recordAudit(tx, {
      organizationId: user.organizationId,
      userId: Number(user.id),
      entityType: "ticket",
      entityId: ticket.id,
      action: "update",
      field: "firstResponseAt",
      oldValue: null,
      newValue: now.toISOString(),
      metadata: { event: "first_response_registered", source: "explicit_action" },
    });
  });

  revalidatePath(`/helpdesk/${parsed.data.id}`);
}
