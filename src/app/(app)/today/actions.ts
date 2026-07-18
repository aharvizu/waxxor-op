"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import {
  activities,
  conversations,
  operationalReminders,
  tickets,
  userPreferences,
} from "@/db/schema";
import {
  type ActionState,
  businessError,
  parseForm,
  success,
  unexpectedError,
} from "@/lib/action-result";
import { recordAudit } from "@/lib/audit";
import { requireUser } from "@/lib/session";
import { updateWorkItemFields } from "@/lib/work-items";

/* ------------------------------------------------------- reminder marks */

const markSchema = z.object({
  ruleKey: z.string().trim().min(1).max(64),
  entityType: z.enum(["ticket", "activity", "client", "project", "recurrence_definition", "report"]),
  entityId: z.coerce.number().int().positive(),
  mark: z.enum(["snoozed", "dismissed", "resolved"]),
  snoozeDays: z.coerce.number().int().min(1).max(30).optional().default(1),
});

/**
 * Snooze / dismiss / resolve a "No olvides" reminder. Persistent (upsert on
 * the reminder identity) and audited. The reminder reappears automatically
 * when its condition re-triggers after the mark (see today-rules.applyMarks).
 */
export async function markReminder(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(markSchema, formData);
  if (error) return error;

  const now = new Date();
  const snoozedUntil =
    data.mark === "snoozed"
      ? new Date(now.getTime() + data.snoozeDays * 86_400_000)
      : null;

  try {
    await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(operationalReminders)
        .values({
          organizationId: user.organizationId,
          ruleKey: data.ruleKey,
          entityType: data.entityType,
          entityId: data.entityId,
          status: data.mark,
          snoozedUntil,
          actedById: Number(user.id),
          actedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            operationalReminders.organizationId,
            operationalReminders.ruleKey,
            operationalReminders.entityType,
            operationalReminders.entityId,
          ],
          set: {
            status: data.mark,
            snoozedUntil,
            actedById: Number(user.id),
            actedAt: now,
          },
        })
        .returning({ id: operationalReminders.id });
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "operational_reminder",
        entityId: row.id,
        action: "update",
        field: "status",
        oldValue: null,
        newValue: data.mark,
        metadata: {
          event: `reminder_${data.mark}`,
          ruleKey: data.ruleKey,
          target: { type: data.entityType, id: data.entityId },
          snoozedUntil: snoozedUntil?.toISOString() ?? null,
        },
      });
    });
  } catch (err) {
    return unexpectedError(err);
  }
  revalidatePath("/today");
  return success(
    data.mark === "snoozed"
      ? "Recordatorio pospuesto."
      : data.mark === "dismissed"
        ? "Recordatorio descartado."
        : "Recordatorio marcado como resuelto.",
  );
}

/* -------------------------------------------------------- preferences */

const prefsSchema = z.object({
  scope: z.enum(["mine", "team", "org"]),
  view: z.enum(["list", "agenda", "table"]),
  filter: z.string().trim().max(40).optional().default("all"),
  group: z.string().trim().max(40).optional().default("none"),
  date: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  ),
});

/** Persists the Today selection per user and navigates (POST-redirect-GET). */
export async function saveTodayPreferences(formData: FormData) {
  const user = await requireUser();
  const parsed = prefsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/today");
  const prefs = parsed.data;

  await db
    .insert(userPreferences)
    .values({
      organizationId: user.organizationId,
      userId: Number(user.id),
      today: prefs,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [userPreferences.userId],
      set: {
        today: sql`${userPreferences.today} || ${JSON.stringify({
          scope: prefs.scope,
          view: prefs.view,
          filter: prefs.filter,
          group: prefs.group,
        })}::jsonb`,
        updatedAt: new Date(),
      },
    });

  const params = new URLSearchParams({
    scope: prefs.scope,
    view: prefs.view,
    filter: prefs.filter,
    group: prefs.group,
  });
  if (prefs.date) params.set("date", prefs.date);
  redirect(`/today?${params.toString()}`);
}

/* -------------------------------------------------------- reschedule */

const rescheduleSchema = z.object({
  kind: z.enum(["ticket", "activity"]),
  id: z.coerce.number().int().positive(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Selecciona una fecha válida.")
    .nullable()
    .or(z.literal("").transform(() => null)),
});

/** Postpone/set the due date of a ticket or activity (audited via work item). */
export async function rescheduleWorkItem(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(rescheduleSchema, formData);
  if (error) return error;

  try {
    await db.transaction(async (tx) => {
      const table = data.kind === "ticket" ? tickets : activities;
      const [row] = await tx
        .select({ workItemId: table.workItemId })
        .from(table)
        .where(
          and(eq(table.id, data.id), eq(table.organizationId, user.organizationId)),
        );
      if (!row) throw new Error("not_found");
      await updateWorkItemFields(tx, user, row.workItemId, { dueDate: data.dueDate });
    });
  } catch (err) {
    if (err instanceof Error && err.message === "not_found") {
      return businessError("El elemento ya no existe.");
    }
    return unexpectedError(err);
  }
  revalidatePath("/today");
  return success("Fecha actualizada.");
}

/* ---------------------------------------------------- conversations */

const attendSchema = z.object({
  conversationId: z.coerce.number().int().positive(),
});

/** Mark a conversation as attended (audited). */
export async function markConversationAttended(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(attendSchema, formData);
  if (error) return error;

  try {
    await db.transaction(async (tx) => {
      const [conv] = await tx
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.id, data.conversationId),
            eq(conversations.organizationId, user.organizationId),
          ),
        );
      if (!conv) throw new Error("not_found");
      // Inbox status machine (2026-07-18): "attended" is now "closed".
      if (conv.status === "closed") return;
      await tx
        .update(conversations)
        .set({ status: "closed", updatedAt: new Date() })
        .where(eq(conversations.id, conv.id));
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "conversation",
        entityId: conv.id,
        action: "update",
        field: "status",
        oldValue: conv.status,
        newValue: "closed",
        metadata: { event: "conversation_attended", ticketId: conv.ticketId },
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message === "not_found") {
      return businessError("La conversación ya no existe.");
    }
    return unexpectedError(err);
  }
  revalidatePath("/today");
  return success("Conversación marcada como atendida.");
}
