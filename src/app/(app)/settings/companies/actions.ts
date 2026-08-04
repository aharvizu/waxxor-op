"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, type DbExecutor } from "@/db";
import { clientServices, services, serviceVariants } from "@/db/schema";
import {
  type ActionState,
  businessError,
  parseForm,
  success,
  unexpectedError,
} from "@/lib/action-result";
import { recordAudit } from "@/lib/audit";
import { requireRole, type SessionUser } from "@/lib/session";

/**
 * Settings → Empresas → Catálogo de Servicios: full CRUD for the org's
 * Service catalog and each Service's Variants (2026-08-03 — previously
 * Services could only be created inline from a company's "Contratar
 * servicio" modal, with no edit/archive/delete anywhere; Variants didn't
 * exist at all). Company 360's modal now only picks from this catalog.
 */

class NotFoundError extends Error {}
class RuleError extends Error {}

const SETTINGS_ROLES = ["superadmin", "administrator"] as const;

const optionalText = z
  .string()
  .optional()
  .transform((v) => (v ?? "").trim() || null);
const optionalMoney = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : String(v)),
  z.string().regex(/^\d+(\.\d{1,2})?$/, "Monto inválido (ej. 750 o 750.50).").nullable(),
);
const idSchema = z.object({ id: z.coerce.number().int().positive() });

function fail(err: unknown): ActionState {
  if (err instanceof NotFoundError) return businessError("El registro ya no existe.");
  if (err instanceof RuleError) return businessError(err.message);
  return unexpectedError(err);
}

function refresh() {
  revalidatePath("/settings/companies");
  revalidatePath("/companies");
}

async function loadService(tx: DbExecutor, user: SessionUser, id: number) {
  const [row] = await tx
    .select()
    .from(services)
    .where(and(eq(services.id, id), eq(services.organizationId, user.organizationId)));
  if (!row) throw new NotFoundError();
  return row;
}

async function loadVariant(tx: DbExecutor, user: SessionUser, id: number) {
  const [row] = await tx
    .select()
    .from(serviceVariants)
    .where(and(eq(serviceVariants.id, id), eq(serviceVariants.organizationId, user.organizationId)));
  if (!row) throw new NotFoundError();
  return row;
}

/* -------------------------------------------------------------- services */

const serviceSchema = z.object({
  name: z.string("Nombre requerido.").trim().min(1, "Nombre requerido."),
  category: z.string().trim().min(1).default("general"),
  description: optionalText,
  scope: optionalText,
  defaultRemoteRate: optionalMoney,
  defaultOnsiteRate: optionalMoney,
  defaultFixedPrice: optionalMoney,
  isRenewable: z.preprocess((v) => v === "on" || v === "true", z.boolean()).default(false),
});

export async function createService(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(...SETTINGS_ROLES);
  const { data, error } = parseForm(serviceSchema, formData);
  if (error) return error;
  try {
    await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(services)
        .values({ ...data, organizationId: user.organizationId })
        .returning({ id: services.id });
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "service",
        entityId: created.id,
        action: "create",
        metadata: { values: data },
      });
    });
  } catch (err) {
    return fail(err);
  }
  refresh();
  return success("Servicio agregado al catálogo.");
}

const updateServiceSchema = serviceSchema.extend({ id: z.coerce.number().int().positive() });

export async function updateService(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(...SETTINGS_ROLES);
  const { data, error } = parseForm(updateServiceSchema, formData);
  if (error) return error;
  const { id, ...values } = data;
  try {
    await db.transaction(async (tx) => {
      await loadService(tx, user, id);
      await tx.update(services).set({ ...values, updatedAt: new Date() }).where(eq(services.id, id));
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "service",
        entityId: id,
        action: "update",
        metadata: { values },
      });
    });
  } catch (err) {
    return fail(err);
  }
  refresh();
  return success("Servicio actualizado.");
}

export async function toggleServiceActive(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(...SETTINGS_ROLES);
  const { data, error } = parseForm(idSchema, formData);
  if (error) return error;
  try {
    await db.transaction(async (tx) => {
      const before = await loadService(tx, user, data.id);
      const next = before.status === "active" ? "inactive" : "active";
      await tx.update(services).set({ status: next, updatedAt: new Date() }).where(eq(services.id, data.id));
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "service",
        entityId: data.id,
        action: "update",
        field: "status",
        oldValue: before.status,
        newValue: next,
      });
    });
  } catch (err) {
    return fail(err);
  }
  refresh();
  return success("Estado actualizado.");
}

export async function deleteService(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(...SETTINGS_ROLES);
  const { data, error } = parseForm(idSchema, formData);
  if (error) return error;
  try {
    await db.transaction(async (tx) => {
      const before = await loadService(tx, user, data.id);
      const [variant] = await tx
        .select({ id: serviceVariants.id })
        .from(serviceVariants)
        .where(eq(serviceVariants.serviceId, data.id));
      if (variant) throw new RuleError("Elimina primero sus variantes.");
      const [contracted] = await tx
        .select({ id: clientServices.id })
        .from(clientServices)
        .where(eq(clientServices.serviceId, data.id));
      if (contracted) throw new RuleError("Está contratado por al menos una empresa — desactívalo en vez de eliminarlo.");
      await tx.delete(services).where(eq(services.id, data.id));
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "service",
        entityId: data.id,
        action: "delete",
        metadata: { values: { name: before.name } },
      });
    });
  } catch (err) {
    return fail(err);
  }
  refresh();
  return success("Servicio eliminado.");
}

/* --------------------------------------------------------------- variants */

const variantSchema = z.object({
  serviceId: z.coerce.number().int().positive(),
  name: z.string("Nombre requerido.").trim().min(1, "Nombre requerido."),
  sku: optionalText,
  description: optionalText,
  defaultRemoteRate: optionalMoney,
  defaultOnsiteRate: optionalMoney,
  defaultFixedPrice: optionalMoney,
});

export async function createServiceVariant(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(...SETTINGS_ROLES);
  const { data, error } = parseForm(variantSchema, formData);
  if (error) return error;
  try {
    await db.transaction(async (tx) => {
      await loadService(tx, user, data.serviceId);
      const [created] = await tx
        .insert(serviceVariants)
        .values({ ...data, organizationId: user.organizationId })
        .returning({ id: serviceVariants.id });
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "service_variant",
        entityId: created.id,
        action: "create",
        metadata: { values: data },
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("service_variants_unique_idx")) {
      return businessError("Ya existe una variante con ese nombre en este servicio.");
    }
    return fail(err);
  }
  refresh();
  return success("Variante agregada.");
}

const updateVariantSchema = variantSchema
  .omit({ serviceId: true })
  .extend({ id: z.coerce.number().int().positive() });

export async function updateServiceVariant(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(...SETTINGS_ROLES);
  const { data, error } = parseForm(updateVariantSchema, formData);
  if (error) return error;
  const { id, ...values } = data;
  try {
    await db.transaction(async (tx) => {
      await loadVariant(tx, user, id);
      await tx.update(serviceVariants).set({ ...values, updatedAt: new Date() }).where(eq(serviceVariants.id, id));
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "service_variant",
        entityId: id,
        action: "update",
        metadata: { values },
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("service_variants_unique_idx")) {
      return businessError("Ya existe una variante con ese nombre en este servicio.");
    }
    return fail(err);
  }
  refresh();
  return success("Variante actualizada.");
}

export async function toggleServiceVariantActive(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(...SETTINGS_ROLES);
  const { data, error } = parseForm(idSchema, formData);
  if (error) return error;
  try {
    await db.transaction(async (tx) => {
      const before = await loadVariant(tx, user, data.id);
      const next = before.status === "active" ? "inactive" : "active";
      await tx.update(serviceVariants).set({ status: next, updatedAt: new Date() }).where(eq(serviceVariants.id, data.id));
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "service_variant",
        entityId: data.id,
        action: "update",
        field: "status",
        oldValue: before.status,
        newValue: next,
      });
    });
  } catch (err) {
    return fail(err);
  }
  refresh();
  return success("Estado actualizado.");
}

export async function deleteServiceVariant(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(...SETTINGS_ROLES);
  const { data, error } = parseForm(idSchema, formData);
  if (error) return error;
  try {
    await db.transaction(async (tx) => {
      const before = await loadVariant(tx, user, data.id);
      const [contracted] = await tx
        .select({ id: clientServices.id })
        .from(clientServices)
        .where(eq(clientServices.variantId, data.id));
      if (contracted) throw new RuleError("Está contratada por al menos una empresa — desactívala en vez de eliminarla.");
      await tx.delete(serviceVariants).where(eq(serviceVariants.id, data.id));
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "service_variant",
        entityId: data.id,
        action: "delete",
        metadata: { values: { name: before.name } },
      });
    });
  } catch (err) {
    return fail(err);
  }
  refresh();
  return success("Variante eliminada.");
}
