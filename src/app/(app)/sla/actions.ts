"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { businessCalendars, slaDefinitions } from "@/db/schema";
import {
  type ActionState,
  businessError,
  parseForm,
  success,
  unexpectedError,
} from "@/lib/action-result";
import { diffFields, recordAudit } from "@/lib/audit";
import { calendarSchema, slaDefinitionSchema } from "@/lib/sla";
import { requireRole } from "@/lib/session";

class DefinitionNotFoundError extends Error {}

const idSchema = z.object({ id: z.coerce.number().int().positive() });

const auditedFields = [
  "name",
  "description",
  "priority",
  "firstResponseMinutes",
  "resolutionMinutes",
  "businessHoursOnly",
  "isDefault",
  "status",
] as const;

/** Only one active default per priority: demote others inside the same tx. */
async function demoteOtherDefaults(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  orgId: number,
  priority: (typeof slaDefinitions.priority.enumValues)[number],
  keepId: number,
) {
  await tx
    .update(slaDefinitions)
    .set({ isDefault: false, updatedAt: new Date() })
    .where(
      and(
        eq(slaDefinitions.organizationId, orgId),
        eq(slaDefinitions.priority, priority),
        eq(slaDefinitions.isDefault, true),
        ne(slaDefinitions.id, keepId),
      ),
    );
}

export async function createSlaDefinition(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const me = await requireRole("superadmin");
  const { data, error } = parseForm(slaDefinitionSchema, formData);
  if (error) return error;

  try {
    await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(slaDefinitions)
        .values({ ...data, organizationId: me.organizationId })
        .returning({ id: slaDefinitions.id });
      if (data.isDefault) {
        await demoteOtherDefaults(tx, me.organizationId, data.priority, created.id);
      }
      await recordAudit(tx, {
        organizationId: me.organizationId,
        userId: Number(me.id),
        entityType: "sla_definition",
        entityId: created.id,
        action: "create",
        metadata: { values: data },
      });
    });
  } catch (err) {
    return unexpectedError(err);
  }

  revalidatePath("/sla");
  return success("SLA definition created.");
}

export async function updateSlaDefinition(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const me = await requireRole("superadmin");
  const { data, error } = parseForm(
    slaDefinitionSchema.extend(idSchema.shape),
    formData,
  );
  if (error) return error;

  try {
    await db.transaction(async (tx) => {
      const scope = and(
        eq(slaDefinitions.id, data.id),
        eq(slaDefinitions.organizationId, me.organizationId),
      );
      const [before] = await tx.select().from(slaDefinitions).where(scope);
      if (!before) throw new DefinitionNotFoundError();

      const patch: Partial<typeof before> = { ...data, id: undefined };
      const changes = diffFields(
        {
          organizationId: me.organizationId,
          userId: Number(me.id),
          entityType: "sla_definition",
          entityId: before.id,
        },
        before,
        patch,
        auditedFields,
      );
      if (changes.length === 0) return;
      await tx
        .update(slaDefinitions)
        .set({ ...patch, updatedAt: new Date() })
        .where(scope);
      if (patch.isDefault && patch.priority) {
        await demoteOtherDefaults(tx, me.organizationId, patch.priority, before.id);
      }
      await recordAudit(tx, changes);
    });
  } catch (err) {
    if (err instanceof DefinitionNotFoundError) {
      return businessError("This SLA definition no longer exists.");
    }
    return unexpectedError(err);
  }

  revalidatePath("/sla");
  return success("SLA definition updated. Existing tickets keep their snapshot.");
}

export async function toggleSlaDefinition(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const me = await requireRole("superadmin");
  const { data, error } = parseForm(idSchema, formData);
  if (error) return error;

  try {
    await db.transaction(async (tx) => {
      const scope = and(
        eq(slaDefinitions.id, data.id),
        eq(slaDefinitions.organizationId, me.organizationId),
      );
      const [before] = await tx.select().from(slaDefinitions).where(scope);
      if (!before) throw new DefinitionNotFoundError();
      const next = before.status === "active" ? "inactive" : "active";
      await tx
        .update(slaDefinitions)
        .set({ status: next, updatedAt: new Date() })
        .where(scope);
      await recordAudit(tx, {
        organizationId: me.organizationId,
        userId: Number(me.id),
        entityType: "sla_definition",
        entityId: before.id,
        action: "update",
        field: "status",
        oldValue: before.status,
        newValue: next,
      });
    });
  } catch (err) {
    if (err instanceof DefinitionNotFoundError) {
      return businessError("This SLA definition no longer exists.");
    }
    return unexpectedError(err);
  }

  revalidatePath("/sla");
  return success("SLA definition status changed.");
}

export async function saveCalendar(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const me = await requireRole("superadmin");
  const { data, error } = parseForm(calendarSchema, formData);
  if (error) return error;
  if (data.workEndMinute <= data.workStartMinute) {
    return {
      ok: false,
      kind: "validation",
      message: "Please fix the highlighted fields.",
      fieldErrors: { workEndMinute: ["End of day must be after the start."] },
    };
  }
  const workDays = formData
    .getAll("workDays")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 7);
  if (workDays.length === 0) {
    return {
      ok: false,
      kind: "validation",
      message: "Please fix the highlighted fields.",
      fieldErrors: { workDays: ["Select at least one working day."] },
    };
  }

  try {
    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(businessCalendars)
        .where(eq(businessCalendars.organizationId, me.organizationId));
      const values = {
        timezone: data.timezone,
        workDays,
        workStartMinute: data.workStartMinute,
        workEndMinute: data.workEndMinute,
        updatedAt: new Date(),
      };
      if (existing) {
        await tx
          .update(businessCalendars)
          .set(values)
          .where(eq(businessCalendars.id, existing.id));
      } else {
        await tx
          .insert(businessCalendars)
          .values({ ...values, organizationId: me.organizationId });
      }
      await recordAudit(tx, {
        organizationId: me.organizationId,
        userId: Number(me.id),
        entityType: "business_calendar",
        entityId: existing?.id ?? 0,
        action: existing ? "update" : "create",
        metadata: { values: { ...values, updatedAt: undefined } },
      });
    });
  } catch (err) {
    return unexpectedError(err);
  }

  revalidatePath("/sla");
  return success("Work calendar saved. New SLA assignments will use it.");
}
