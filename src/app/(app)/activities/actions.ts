"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, type DbExecutor } from "@/db";
import { activities, attachments, companies, users, workItems } from "@/db/schema";
import {
  type ActionState,
  businessError,
  parseForm,
  success,
  unexpectedError,
} from "@/lib/action-result";
import {
  activityWorkflowStatusSchema,
  completedAtFor,
  restoredStatus,
  type ActivityStatus,
} from "@/lib/activities";
import {
  MAX_ATTACHMENT_BYTES,
  deleteAttachmentBlob,
  newStorageKey,
  saveAttachment,
} from "@/lib/attachments";
import { diffFields, recordAudit } from "@/lib/audit";
import { getCatalogNames } from "@/lib/settings-data";
import { requireRole, requireUser, type SessionUser } from "@/lib/session";
import {
  ConversionError,
  TICKET_CHANNELS,
  TICKET_MODALITIES,
  convertActivityToTicket,
} from "@/lib/convert-activity";
import {
  createWorkItem,
  updateWorkItemFields,
  workItemPrioritySchema,
} from "@/lib/work-items";

class ActivityNotFoundError extends Error {}
class InvalidActivityTypeError extends Error {}

/** "" or missing → null; otherwise a positive int. */
const optionalId = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
  z.number().int().positive().nullable(),
);
const optionalText = z
  .string()
  .optional()
  .transform((v) => (v ?? "").trim() || null);
const optionalDate = z
  .string()
  .optional()
  .transform((v) => (v ?? "").trim() || null);
const optionalMinutes = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
  z.number().int().positive("Estimated minutes must be a positive number.").nullable(),
);

const detailsSchema = z.object({
  title: z.string("Title is required.").trim().min(1, "Title is required."),
  description: optionalText,
  activityType: z.string("Type is required.").trim().min(1, "Type is required."),
  priority: workItemPrioritySchema.default("medium"),
  companyId: optionalId,
  assigneeId: optionalId,
  startDate: optionalDate,
  dueDate: optionalDate,
  estimatedMinutes: optionalMinutes,
});

const workflowSchema = z.object({
  id: z.coerce.number().int().positive(),
  status: activityWorkflowStatusSchema,
  assigneeId: optionalId,
});

const idSchema = z.object({ id: z.coerce.number().int().positive() });

async function orgCompanyId(orgId: number, id: number | null) {
  if (id === null) return null;
  const [row] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(and(eq(companies.id, id), eq(companies.organizationId, orgId)));
  return row?.id ?? null;
}

async function orgUserId(orgId: number, id: number | null) {
  if (id === null) return null;
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, id), eq(users.organizationId, orgId)));
  return row?.id ?? null;
}

/** Org-scoped activity + its work item, or throws (inside a transaction). */
async function loadActivity(tx: DbExecutor, user: SessionUser, id: number) {
  const [row] = await tx
    .select({ activity: activities, item: workItems })
    .from(activities)
    .innerJoin(workItems, eq(activities.workItemId, workItems.id))
    .where(
      and(eq(activities.id, id), eq(activities.organizationId, user.organizationId)),
    );
  if (!row) throw new ActivityNotFoundError();
  if (row.activity.convertedAt) throw new ConvertedActivityError();
  return row;
}

class ConvertedActivityError extends Error {}

const CONVERSION_MESSAGES: Record<string, string> = {
  not_found: "This activity no longer exists.",
  already_converted: "This activity was already converted into a ticket.",
  archived: "Archived activities cannot be converted — restore it first.",
  no_client: "Select a client before converting: tickets always belong to a client.",
  needs_confirmation:
    "This activity is cancelled — confirm that you still want to convert it.",
  needs_project_confirmation:
    "This activity belongs to a project — converting removes it from the project. Confirm to continue.",
  has_subactivities:
    "This activity has subactivities — complete, move or detach them before converting.",
};

const convertSchema = z.object({
  id: z.coerce.number().int().positive(),
  companyId: optionalId,
  contact: optionalText,
  category: z.string("Category is required.").trim().min(1, "Category is required."),
  subcategory: optionalText,
  channel: z.enum(TICKET_CHANNELS, "Select the channel this request came from."),
  modality: z.enum(TICKET_MODALITIES, "Select remote or on-site."),
  priority: workItemPrioritySchema,
  assigneeId: optionalId,
  confirmCancelled: z
    .preprocess((v) => v === "on" || v === "true", z.boolean())
    .optional(),
  confirmProject: z
    .preprocess((v) => v === "on" || v === "true", z.boolean())
    .optional(),
});

export async function convertActivity(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(convertSchema, formData);
  if (error) return error;

  const validCategories = await getCatalogNames(user.organizationId, "ticket_category");
  if (!validCategories.includes(data.category)) {
    return businessError("Selecciona una categoría del catálogo.");
  }

  const companyId = await orgCompanyId(user.organizationId, data.companyId);
  const assigneeId = await orgUserId(user.organizationId, data.assigneeId);

  let ticketId: number;
  try {
    const result = await convertActivityToTicket(user, {
      activityId: data.id,
      companyId,
      contact: data.contact,
      category: data.category,
      subcategory: data.subcategory,
      channel: data.channel,
      modality: data.modality,
      priority: data.priority,
      assigneeId,
      confirmCancelled: data.confirmCancelled,
      confirmProject: data.confirmProject,
    });
    ticketId = result.ticketId;
  } catch (err) {
    if (err instanceof ConversionError) {
      return businessError(CONVERSION_MESSAGES[err.reason] ?? err.message);
    }
    return unexpectedError(err);
  }

  revalidatePath("/activities");
  revalidatePath("/helpdesk");
  redirect(`/helpdesk/${ticketId}`);
}

export async function createActivity(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(detailsSchema, formData);
  if (error) return error;

  const companyId = await orgCompanyId(user.organizationId, data.companyId);
  const assigneeId = await orgUserId(user.organizationId, data.assigneeId);

  let activityId: number;
  try {
    activityId = await db.transaction(async (tx) => {
      const validTypes = await getCatalogNames(user.organizationId, "time_entry_type");
      if (!validTypes.includes(data.activityType)) throw new InvalidActivityTypeError();

      const item = await createWorkItem(tx, user, {
        type: "activity",
        title: data.title,
        description: data.description,
        status: "pending",
        priority: data.priority,
        companyId,
        assigneeId,
        startDate: data.startDate,
        dueDate: data.dueDate,
        estimatedMinutes: data.estimatedMinutes,
      });
      const [activity] = await tx
        .insert(activities)
        .values({
          organizationId: user.organizationId,
          workItemId: item.id,
          activityType: data.activityType,
        })
        .returning({ id: activities.id });
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "activity",
        entityId: activity.id,
        action: "create",
        metadata: { workItemId: item.id, activityType: data.activityType },
      });
      return activity.id;
    });
  } catch (err) {
    if (err instanceof InvalidActivityTypeError) {
      return businessError("Selecciona un tipo del catálogo.");
    }
    return unexpectedError(err);
  }

  revalidatePath("/activities");
  redirect(`/activities/${activityId}`);
}

export async function updateActivityDetails(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(detailsSchema.extend(idSchema.shape), formData);
  if (error) return error;

  const companyId = await orgCompanyId(user.organizationId, data.companyId);

  try {
    await db.transaction(async (tx) => {
      const { activity, item } = await loadActivity(tx, user, data.id);
      if (data.activityType !== activity.activityType) {
        const validTypes = await getCatalogNames(user.organizationId, "time_entry_type");
        if (!validTypes.includes(data.activityType)) throw new InvalidActivityTypeError();
      }

      await updateWorkItemFields(tx, user, item.id, {
        title: data.title,
        description: data.description,
        priority: data.priority,
        companyId,
        startDate: data.startDate,
        dueDate: data.dueDate,
        estimatedMinutes: data.estimatedMinutes,
      });

      const typeChanges = diffFields(
        {
          organizationId: user.organizationId,
          userId: Number(user.id),
          entityType: "activity",
          entityId: activity.id,
        },
        activity,
        { activityType: data.activityType },
        ["activityType"],
      );
      if (typeChanges.length > 0) {
        await tx
          .update(activities)
          .set({ activityType: data.activityType })
          .where(eq(activities.id, activity.id));
        await recordAudit(tx, typeChanges);
      }
    });
  } catch (err) {
    if (err instanceof ActivityNotFoundError) {
      return businessError("This activity no longer exists.");
    }
    if (err instanceof ConvertedActivityError) {
      return businessError("This activity was converted into a ticket and is read-only.");
    }
    if (err instanceof InvalidActivityTypeError) {
      return businessError("Selecciona un tipo del catálogo.");
    }
    return unexpectedError(err);
  }

  revalidatePath(`/activities/${data.id}`);
  revalidatePath("/activities");
  return success("Activity updated.");
}

export async function updateActivityWorkflow(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(workflowSchema, formData);
  if (error) return error;

  const assigneeId = await orgUserId(user.organizationId, data.assigneeId);

  try {
    await db.transaction(async (tx) => {
      const { activity, item } = await loadActivity(tx, user, data.id);
      if (activity.archivedAt) {
        throw new ArchivedActivityError();
      }
      const completedAt = completedAtFor(data.status, item.completedAt);
      await updateWorkItemFields(tx, user, item.id, {
        status: data.status,
        assigneeId,
        ...(completedAt !== undefined ? { completedAt } : {}),
      });
    });
  } catch (err) {
    if (err instanceof ActivityNotFoundError) {
      return businessError("This activity no longer exists.");
    }
    if (err instanceof ConvertedActivityError) {
      return businessError("This activity was converted into a ticket and is read-only.");
    }
    if (err instanceof ArchivedActivityError) {
      return businessError("Restore this activity before changing its status.");
    }
    return unexpectedError(err);
  }

  revalidatePath(`/activities/${data.id}`);
  revalidatePath("/activities");
  return success("Activity updated.");
}

class ArchivedActivityError extends Error {}

async function transition(
  formData: FormData,
  apply: (row: {
    activity: typeof activities.$inferSelect;
    item: typeof workItems.$inferSelect;
  }) => {
    status?: ActivityStatus;
    completedAt?: Date | null;
    archivedAt?: Date | null;
  },
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(idSchema, formData);
  if (error) return error;

  try {
    await db.transaction(async (tx) => {
      const row = await loadActivity(tx, user, data.id);
      const next = apply(row);

      if (next.status !== undefined || next.completedAt !== undefined) {
        await updateWorkItemFields(tx, user, row.item.id, {
          ...(next.status !== undefined ? { status: next.status } : {}),
          ...(next.completedAt !== undefined ? { completedAt: next.completedAt } : {}),
        });
      }
      if (next.archivedAt !== undefined) {
        const changes = diffFields(
          {
            organizationId: user.organizationId,
            userId: Number(user.id),
            entityType: "activity",
            entityId: row.activity.id,
          },
          row.activity,
          { archivedAt: next.archivedAt },
          ["archivedAt"],
        );
        if (changes.length > 0) {
          await tx
            .update(activities)
            .set({ archivedAt: next.archivedAt })
            .where(eq(activities.id, row.activity.id));
          await recordAudit(tx, changes);
        }
      }
    });
  } catch (err) {
    if (err instanceof ActivityNotFoundError) {
      return businessError("This activity no longer exists.");
    }
    if (err instanceof ConvertedActivityError) {
      return businessError("This activity was converted into a ticket and is read-only.");
    }
    return unexpectedError(err);
  }

  revalidatePath(`/activities/${data.id}`);
  revalidatePath("/activities");
  return success("Activity updated.");
}

export async function completeActivity(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return transition(formData, () => ({
    status: "completed",
    completedAt: new Date(),
  }));
}

export async function reopenActivity(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return transition(formData, () => ({ status: "pending", completedAt: null }));
}

export async function archiveActivity(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return transition(formData, () => ({
    status: "archived",
    archivedAt: new Date(),
  }));
}

export async function restoreActivity(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return transition(formData, ({ item }) => ({
    status: restoredStatus(item.completedAt),
    archivedAt: null,
  }));
}

/* -------------------------------------------------------------- files */

export async function uploadActivityAttachment(
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
      message: "Selecciona un archivo.",
      fieldErrors: { file: ["Selecciona un archivo."] },
    };
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return businessError("Archivos mayores a 15 MB no están soportados todavía.");
  }

  const storageKey = newStorageKey();
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    await db.transaction(async (tx) => {
      const { item } = await loadActivity(tx, user, parsed.data.id);
      const [attachment] = await tx
        .insert(attachments)
        .values({
          organizationId: user.organizationId,
          workItemId: item.id,
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
        metadata: { activityId: parsed.data.id, filename: file.name, size: file.size },
      });
      // write the blob last: if it fails, metadata and audit roll back with it
      await saveAttachment(storageKey, buffer);
    });
  } catch (err) {
    await deleteAttachmentBlob(storageKey);
    if (err instanceof ActivityNotFoundError) {
      return businessError("This activity no longer exists.");
    }
    if (err instanceof ConvertedActivityError) {
      return businessError("This activity was converted into a ticket and is read-only.");
    }
    return unexpectedError(err);
  }
  revalidatePath(`/activities/${parsed.data.id}`);
  return success("Archivo adjuntado.");
}

export async function deleteActivityAttachment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const me = await requireRole("superadmin");
  const { data, error } = parseForm(
    z.object({
      attachmentId: z.coerce.number().int().positive(),
      activityId: z.coerce.number().int().positive(),
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
        .where(and(eq(attachments.id, data.attachmentId), eq(attachments.organizationId, me.organizationId)));
      if (!attachment) throw new ActivityNotFoundError();
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
    if (err instanceof ActivityNotFoundError) {
      return businessError("Attachment no longer exists.");
    }
    return unexpectedError(err);
  }
  revalidatePath(`/activities/${data.activityId}`);
  return success("Attachment deleted.");
}
