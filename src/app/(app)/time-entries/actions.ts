"use server";

import { and, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, type DbExecutor } from "@/db";
import { timeEntries, users, workItems } from "@/db/schema";
import {
  type ActionState,
  businessError,
  parseForm,
  success,
  unexpectedError,
} from "@/lib/action-result";
import { diffFields, recordAudit } from "@/lib/audit";
import { getCatalogNames } from "@/lib/settings-data";
import { requireRole, requireUser, type SessionUser } from "@/lib/session";
import { getTimeEntryAccess, type TimeEntryAccess } from "@/lib/time-entry-access";
import {
  billingStatusSchema,
  calculateAmount,
  durationMinutesSchema,
  optionalMoneySchema,
  timeModalitySchema,
} from "@/lib/time-entries";

class EntryNotFoundError extends Error {}
class EntryVoidedError extends Error {}
/** The work item's own state (closed / invoiced) forbids this edit — see TimeEntryAccess. */
class EntryLockedError extends Error {
  constructor(readonly access: Exclude<TimeEntryAccess, "full">) {
    super("locked");
  }
}

const LOCKED_MESSAGE: Record<Exclude<TimeEntryAccess, "full">, string> = {
  billing:
    "Este ticket está cerrado — solo se puede ajustar su cobro. Reábrelo para cambiar el registro de tiempo.",
  read: "Este ticket ya está facturado — su tiempo no se puede modificar.",
};

const optionalText = z
  .string()
  .optional()
  .transform((v) => (v ?? "").trim() || null);

const sessionFieldsSchema = z.object({
  date: z.string("Date is required.").regex(/^\d{4}-\d{2}-\d{2}$/, "Date is required."),
  durationMinutes: durationMinutesSchema,
  timeType: z.string("Type is required.").trim().min(1, "Type is required."),
  billingStatus: billingStatusSchema,
  modality: timeModalitySchema,
  description: z
    .string("Describe what was done.")
    .trim()
    .min(1, "Describe what was done."),
  result: optionalText,
  hourlyRate: optionalMoneySchema,
  internalHourlyCost: optionalMoneySchema,
});

const createSchema = sessionFieldsSchema.extend({
  workItemId: z.coerce.number().int().positive(),
});

const updateSchema = sessionFieldsSchema.extend({
  id: z.coerce.number().int().positive(),
  userId: z.coerce.number().int().positive("Select the technician."),
});

/** Closed-ticket edit: only what decides the charge, never the record of the work. */
const updateBillingSchema = z.object({
  id: z.coerce.number().int().positive(),
  billingStatus: billingStatusSchema,
  modality: timeModalitySchema,
  hourlyRate: optionalMoneySchema,
  internalHourlyCost: optionalMoneySchema,
});

const idSchema = z.object({ id: z.coerce.number().int().positive() });

/** Internal (non-client) users of the org among the given ids. */
async function internalOrgUserIds(orgId: number, ids: number[]) {
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        inArray(users.id, ids),
        eq(users.organizationId, orgId),
        ne(users.role, "client"),
      ),
    );
  return rows.map((r) => r.id);
}

/** Org-scoped entry or throws; voided entries are read-only. */
async function loadEntry(
  tx: DbExecutor,
  user: SessionUser,
  id: number,
  { allowVoided = false } = {},
) {
  const [entry] = await tx
    .select()
    .from(timeEntries)
    .where(
      and(eq(timeEntries.id, id), eq(timeEntries.organizationId, user.organizationId)),
    );
  if (!entry) throw new EntryNotFoundError();
  if (entry.voidedAt && !allowVoided) throw new EntryVoidedError();
  return entry;
}

/** Fields audited with old/new values on edits. */
const auditedFields = [
  "userId",
  "date",
  "durationMinutes",
  "timeType",
  "billingStatus",
  "modality",
  "description",
  "result",
  "hourlyRate",
  "internalHourlyCost",
  "calculatedAmount",
  "calculatedInternalCost",
] as const;

export async function createTimeEntry(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(createSchema, formData);
  if (error) return error;

  const validTimeTypes = await getCatalogNames(user.organizationId, "time_entry_type");
  if (!validTimeTypes.includes(data.timeType)) {
    return businessError("Selecciona un tipo de trabajo del catálogo.");
  }

  // multi-technician: one entry per selected user, all in one transaction
  const requested = formData
    .getAll("userIds")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
  const technicianIds = await internalOrgUserIds(user.organizationId, requested);
  if (technicianIds.length === 0) {
    return {
      ok: false,
      kind: "validation",
      message: "Please fix the highlighted fields.",
      fieldErrors: { userIds: ["Select at least one technician."] },
    };
  }

  const [item] = await db
    .select({ id: workItems.id, type: workItems.type })
    .from(workItems)
    .where(
      and(
        eq(workItems.id, data.workItemId),
        eq(workItems.organizationId, user.organizationId),
      ),
    );
  if (!item) return businessError("This work item no longer exists.");

  const access = await getTimeEntryAccess(db, user.organizationId, item.id);
  if (access !== "full") return businessError(LOCKED_MESSAGE[access]);

  const amount = calculateAmount(data.durationMinutes, data.hourlyRate);
  const internalCost = calculateAmount(data.durationMinutes, data.internalHourlyCost);

  try {
    await db.transaction(async (tx) => {
      for (const technicianId of technicianIds) {
        const [entry] = await tx
          .insert(timeEntries)
          .values({
            organizationId: user.organizationId,
            workItemId: item.id,
            userId: technicianId,
            date: data.date,
            durationMinutes: data.durationMinutes,
            timeType: data.timeType,
            billingStatus: data.billingStatus,
            modality: data.modality,
            description: data.description,
            result: data.result,
            hourlyRate: data.hourlyRate,
            internalHourlyCost: data.internalHourlyCost,
            calculatedAmount: amount,
            calculatedInternalCost: internalCost,
            createdById: Number(user.id),
          })
          .returning({ id: timeEntries.id });
        await recordAudit(tx, {
          organizationId: user.organizationId,
          userId: Number(user.id),
          entityType: "time_entry",
          entityId: entry.id,
          action: "create",
          metadata: {
            workItemId: item.id,
            values: {
              userId: technicianId,
              date: data.date,
              durationMinutes: data.durationMinutes,
              timeType: data.timeType,
              billingStatus: data.billingStatus,
              calculatedAmount: amount,
              calculatedInternalCost: internalCost,
            },
          },
        });
      }
    });
  } catch (err) {
    return unexpectedError(err);
  }

  revalidatePath("/activities");
  revalidatePath("/helpdesk");
  return success(
    technicianIds.length === 1
      ? "Time logged."
      : `Time logged for ${technicianIds.length} technicians.`,
  );
}

export async function updateTimeEntry(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(updateSchema, formData);
  if (error) return error;

  const [validUser] = await internalOrgUserIds(user.organizationId, [data.userId]);
  if (!validUser) return businessError("Select an internal technician of this organization.");

  const validTimeTypes = await getCatalogNames(user.organizationId, "time_entry_type");
  if (!validTimeTypes.includes(data.timeType)) {
    return businessError("Selecciona un tipo de trabajo del catálogo.");
  }

  try {
    await db.transaction(async (tx) => {
      const before = await loadEntry(tx, user, data.id);
      const access = await getTimeEntryAccess(tx, user.organizationId, before.workItemId);
      if (access !== "full") throw new EntryLockedError(access);
      const patch = {
        userId: data.userId,
        date: data.date,
        durationMinutes: data.durationMinutes,
        timeType: data.timeType,
        billingStatus: data.billingStatus,
        modality: data.modality,
        description: data.description,
        result: data.result,
        hourlyRate: data.hourlyRate,
        internalHourlyCost: data.internalHourlyCost,
        calculatedAmount: calculateAmount(data.durationMinutes, data.hourlyRate),
        calculatedInternalCost: calculateAmount(
          data.durationMinutes,
          data.internalHourlyCost,
        ),
      };
      const changes = diffFields(
        {
          organizationId: user.organizationId,
          userId: Number(user.id),
          entityType: "time_entry",
          entityId: before.id,
        },
        before,
        patch,
        auditedFields,
      );
      if (changes.length === 0) return;
      await tx
        .update(timeEntries)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(timeEntries.id, before.id));
      await recordAudit(tx, changes);
    });
  } catch (err) {
    if (err instanceof EntryLockedError) {
      return businessError(LOCKED_MESSAGE[err.access]);
    }
    if (err instanceof EntryNotFoundError) {
      return businessError("This time entry no longer exists.");
    }
    if (err instanceof EntryVoidedError) {
      return businessError("Voided entries cannot be edited.");
    }
    return unexpectedError(err);
  }

  revalidatePath("/activities");
  revalidatePath("/helpdesk");
  return success("Time entry updated.");
}

/**
 * The only edit a closed (but not yet invoiced) ticket allows: the fields
 * that decide the charge — Billing, Modality and the two rates — plus the
 * amounts they recompute, against the duration already on record. Everything
 * describing the work itself (date, duration, technician, description) stays
 * frozen; use updateTimeEntry on an open ticket for those.
 */
export async function updateTimeEntryBilling(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(updateBillingSchema, formData);
  if (error) return error;

  const validTimeTypes = await getCatalogNames(user.organizationId, "time_entry_type");

  try {
    await db.transaction(async (tx) => {
      const before = await loadEntry(tx, user, data.id);
      const access = await getTimeEntryAccess(tx, user.organizationId, before.workItemId);
      if (access === "read") throw new EntryLockedError(access);

      const [item] = await tx
        .select({ type: workItems.type })
        .from(workItems)
        .where(eq(workItems.id, before.workItemId));
      // On Tickets the hidden timeType mirrors Modality (2026-09-14 redesign)
      // — keep the mirror true when Modality moves. Left alone if the org's
      // catalog no longer offers the matching item: a rate fix shouldn't fail
      // over an unrelated catalog gap.
      const mirrored = data.modality === "onsite" ? "onsite_support" : "remote_support";
      const timeType =
        item?.type === "ticket" && data.modality !== before.modality && validTimeTypes.includes(mirrored)
          ? mirrored
          : before.timeType;

      const patch = {
        billingStatus: data.billingStatus,
        modality: data.modality,
        timeType,
        hourlyRate: data.hourlyRate,
        internalHourlyCost: data.internalHourlyCost,
        calculatedAmount: calculateAmount(before.durationMinutes, data.hourlyRate),
        calculatedInternalCost: calculateAmount(before.durationMinutes, data.internalHourlyCost),
      };
      const changes = diffFields(
        {
          organizationId: user.organizationId,
          userId: Number(user.id),
          entityType: "time_entry",
          entityId: before.id,
        },
        before,
        patch,
        auditedFields,
      );
      if (changes.length === 0) return;
      await tx
        .update(timeEntries)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(timeEntries.id, before.id));
      await recordAudit(tx, changes);
    });
  } catch (err) {
    if (err instanceof EntryLockedError) {
      return businessError(LOCKED_MESSAGE[err.access]);
    }
    if (err instanceof EntryNotFoundError) {
      return businessError("This time entry no longer exists.");
    }
    if (err instanceof EntryVoidedError) {
      return businessError("Voided entries cannot be edited.");
    }
    return unexpectedError(err);
  }

  revalidatePath("/activities");
  revalidatePath("/helpdesk");
  revalidatePath("/reports/billing");
  return success("Cobro actualizado.");
}

export async function voidTimeEntry(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(idSchema, formData);
  if (error) return error;

  try {
    await db.transaction(async (tx) => {
      const before = await loadEntry(tx, user, data.id);
      const access = await getTimeEntryAccess(tx, user.organizationId, before.workItemId);
      if (access !== "full") throw new EntryLockedError(access);
      const voidedAt = new Date();
      await tx
        .update(timeEntries)
        .set({ voidedAt, updatedAt: voidedAt })
        .where(eq(timeEntries.id, before.id));
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "time_entry",
        entityId: before.id,
        action: "update",
        field: "voidedAt",
        oldValue: null,
        newValue: voidedAt.toISOString(),
        metadata: { durationMinutes: before.durationMinutes, date: before.date },
      });
    });
  } catch (err) {
    if (err instanceof EntryLockedError) {
      return businessError(LOCKED_MESSAGE[err.access]);
    }
    if (err instanceof EntryNotFoundError) {
      return businessError("This time entry no longer exists.");
    }
    if (err instanceof EntryVoidedError) {
      return businessError("This entry is already voided.");
    }
    return unexpectedError(err);
  }

  revalidatePath("/activities");
  revalidatePath("/helpdesk");
  return success("Time entry voided.");
}

/** Hard delete — SuperAdmin only. Prefer voiding. */
export async function deleteTimeEntry(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const me = await requireRole("superadmin");
  const { data, error } = parseForm(idSchema, formData);
  if (error) return error;

  try {
    await db.transaction(async (tx) => {
      const entry = await loadEntry(tx, me, data.id, { allowVoided: true });
      const access = await getTimeEntryAccess(tx, me.organizationId, entry.workItemId);
      if (access === "read") throw new EntryLockedError(access);
      await tx.delete(timeEntries).where(eq(timeEntries.id, entry.id));
      await recordAudit(tx, {
        organizationId: me.organizationId,
        userId: Number(me.id),
        entityType: "time_entry",
        entityId: entry.id,
        action: "delete",
        metadata: {
          values: {
            workItemId: entry.workItemId,
            userId: entry.userId,
            date: entry.date,
            durationMinutes: entry.durationMinutes,
            timeType: entry.timeType,
            billingStatus: entry.billingStatus,
            calculatedAmount: entry.calculatedAmount,
          },
        },
      });
    });
  } catch (err) {
    if (err instanceof EntryLockedError) {
      return businessError(LOCKED_MESSAGE[err.access]);
    }
    if (err instanceof EntryNotFoundError) {
      return businessError("This time entry no longer exists.");
    }
    return unexpectedError(err);
  }

  revalidatePath("/activities");
  revalidatePath("/helpdesk");
  return success("Time entry deleted permanently.");
}
