"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, type DbExecutor } from "@/db";
import { services, vendorContacts, vendors, users } from "@/db/schema";
import { type ActionState, businessError, parseForm, success, unexpectedError } from "@/lib/action-result";
import { diffFields, recordAudit } from "@/lib/audit";
import { requireRole, requireUser, type SessionUser } from "@/lib/session";
import { getCatalogNames } from "@/lib/settings-data";
import { vendorContactTypeSchema, vendorStatusSchema } from "@/lib/vendors";

/** Same gate as the Services catalog itself (settings/companies/actions.ts) — linking a product here writes services.vendorId, a catalog field. */
const CATALOG_ROLES = ["superadmin", "administrator"] as const;

class NotFoundError extends Error {}
class RuleError extends Error {}

const optionalText = z
  .string()
  .optional()
  .transform((v) => (v ?? "").trim() || null);
const optionalId = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
  z.number().int().positive().nullable(),
);
const idSchema = z.object({ id: z.coerce.number().int().positive() });

function fail(err: unknown): ActionState {
  if (err instanceof NotFoundError) return businessError("El registro ya no existe.");
  if (err instanceof RuleError) return businessError(err.message);
  return unexpectedError(err);
}

function refresh(vendorId?: number) {
  revalidatePath("/vendors");
  if (vendorId) revalidatePath(`/vendors/${vendorId}`);
}

async function loadVendor(tx: DbExecutor, user: SessionUser, id: number) {
  const [row] = await tx
    .select()
    .from(vendors)
    .where(and(eq(vendors.id, id), eq(vendors.organizationId, user.organizationId)));
  if (!row) throw new NotFoundError();
  return row;
}

/* -------------------------------------------------------------- vendor */

const vendorProfileSchema = z.object({
  id: z.coerce.number().int().positive(),
  name: z.string("Nombre requerido.").trim().min(1, "Nombre requerido."),
  legalName: optionalText,
  taxId: optionalText,
  category: optionalText,
  website: optionalText,
  contactName: optionalText,
  email: optionalText,
  phone: optionalText,
  address: optionalText,
  city: optionalText,
  state: optionalText,
  country: optionalText,
  status: vendorStatusSchema,
  accountOwnerId: optionalId,
  notes: optionalText,
});

const VENDOR_AUDITED = [
  "name", "legalName", "taxId", "category", "website", "contactName", "email", "phone",
  "address", "city", "state", "country", "status", "accountOwnerId", "notes",
] as const;

export async function updateVendorProfile(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(vendorProfileSchema, formData);
  if (error) return error;

  // Category must come from the org's vendor_category catalog — no free text (mirrors ticket category).
  if (data.category) {
    const validCategories = await getCatalogNames(user.organizationId, "vendor_category");
    if (!validCategories.includes(data.category)) {
      return businessError("Selecciona una categoría del catálogo.");
    }
  }

  try {
    await db.transaction(async (tx) => {
      const before = await loadVendor(tx, user, data.id);
      const validUser = async (id: number | null) => {
        if (id === null) return null;
        const [u] = await tx
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.id, id), eq(users.organizationId, user.organizationId), ne(users.role, "client")));
        return u?.id ?? null;
      };
      const patch = { ...data, id: undefined, accountOwnerId: await validUser(data.accountOwnerId) };
      const changes = diffFields(
        { organizationId: user.organizationId, userId: Number(user.id), entityType: "vendor", entityId: before.id },
        before,
        patch,
        VENDOR_AUDITED,
      );
      if (changes.length === 0) return;
      await tx.update(vendors).set({ ...patch, updatedAt: new Date() }).where(eq(vendors.id, before.id));
      await recordAudit(tx, changes);
    });
  } catch (err) {
    return fail(err);
  }
  refresh(data.id);
  return success("Proveedor actualizado.");
}

/** Permanent vendor deletion — SuperAdmin only; blocked while referenced by client_services. */
export async function deleteVendor(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireRole("superadmin");
  const { data, error } = parseForm(idSchema, formData);
  if (error) return error;

  try {
    await db.transaction(async (tx) => {
      const vendor = await loadVendor(tx, me, data.id);
      const [refs] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(sql`client_services`)
        .where(sql`vendor_id = ${vendor.id}`);
      if (refs.n > 0) {
        throw new RuleError("Este proveedor está ligado a servicios contratados de clientes — archívalo en lugar de eliminarlo.");
      }
      await tx.delete(vendors).where(eq(vendors.id, vendor.id)); // vendor_contacts cascade
      await recordAudit(tx, {
        organizationId: me.organizationId,
        userId: Number(me.id),
        entityType: "vendor",
        entityId: vendor.id,
        action: "delete",
        metadata: { values: { name: vendor.name, status: vendor.status } },
      });
    });
  } catch (err) {
    return fail(err);
  }
  revalidatePath("/vendors");
  return success("Proveedor eliminado permanentemente.");
}

/* ------------------------------------------------------ vendor contacts */

const vendorContactSchema = z.object({
  vendorId: z.coerce.number().int().positive(),
  firstName: z.string("Nombre requerido.").trim().min(1, "Nombre requerido."),
  lastName: z.string("Apellido requerido.").trim().min(1, "Apellido requerido."),
  jobTitle: optionalText,
  department: optionalText,
  email: optionalText,
  phone: optionalText,
  mobile: optionalText,
  whatsappNumber: optionalText,
  contactType: vendorContactTypeSchema.default("other"),
  isPrimary: z.preprocess((v) => v === "on" || v === "true", z.boolean()).default(false),
  notes: optionalText,
});

const VENDOR_CONTACT_AUDITED = [
  "firstName", "lastName", "jobTitle", "department", "email", "phone", "mobile",
  "whatsappNumber", "contactType", "isPrimary", "isActive", "notes",
] as const;

/** Only one primary per vendor — demote siblings and update the vendor pointer, transactionally. */
async function makePrimary(tx: DbExecutor, user: SessionUser, vendorId: number, contactId: number) {
  await tx
    .update(vendorContacts)
    .set({ isPrimary: false, updatedAt: new Date() })
    .where(and(eq(vendorContacts.vendorId, vendorId), eq(vendorContacts.organizationId, user.organizationId), eq(vendorContacts.isPrimary, true), ne(vendorContacts.id, contactId)));
  await tx.update(vendorContacts).set({ isPrimary: true, updatedAt: new Date() }).where(eq(vendorContacts.id, contactId));
  await tx.update(vendors).set({ primaryContactId: contactId, updatedAt: new Date() }).where(eq(vendors.id, vendorId));
  await recordAudit(tx, {
    organizationId: user.organizationId,
    userId: Number(user.id),
    entityType: "vendor_contact",
    entityId: contactId,
    action: "update",
    field: "isPrimary",
    oldValue: "false",
    newValue: "true",
    metadata: { event: "primary_contact_changed", vendorId },
  });
}

export async function createVendorContact(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(vendorContactSchema, formData);
  if (error) return error;

  try {
    await db.transaction(async (tx) => {
      await loadVendor(tx, user, data.vendorId);
      const [created] = await tx
        .insert(vendorContacts)
        .values({ ...data, organizationId: user.organizationId, isPrimary: false })
        .returning({ id: vendorContacts.id });
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "vendor_contact",
        entityId: created.id,
        action: "create",
        metadata: { vendorId: data.vendorId, values: { ...data, vendorId: undefined } },
      });
      if (data.isPrimary) await makePrimary(tx, user, data.vendorId, created.id);
    });
  } catch (err) {
    return fail(err);
  }
  refresh(data.vendorId);
  return success("Contacto agregado.");
}

export async function updateVendorContact(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(vendorContactSchema.extend(idSchema.shape), formData);
  if (error) return error;

  try {
    await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(vendorContacts)
        .where(and(eq(vendorContacts.id, data.id), eq(vendorContacts.organizationId, user.organizationId)));
      if (!before) throw new NotFoundError();
      const patch = { ...data, id: undefined, vendorId: undefined, isPrimary: before.isPrimary, isActive: before.isActive };
      const changes = diffFields(
        { organizationId: user.organizationId, userId: Number(user.id), entityType: "vendor_contact", entityId: before.id },
        before,
        patch,
        VENDOR_CONTACT_AUDITED,
      );
      if (changes.length > 0) {
        await tx.update(vendorContacts).set({ ...patch, updatedAt: new Date() }).where(eq(vendorContacts.id, before.id));
        await recordAudit(tx, changes);
      }
      if (data.isPrimary && !before.isPrimary) {
        await makePrimary(tx, user, before.vendorId, before.id);
      }
    });
  } catch (err) {
    return fail(err);
  }
  refresh(data.vendorId);
  return success("Contacto actualizado.");
}

export async function toggleVendorContactActive(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(idSchema, formData);
  if (error) return error;
  try {
    await db.transaction(async (tx) => {
      const [contact] = await tx
        .select()
        .from(vendorContacts)
        .where(and(eq(vendorContacts.id, data.id), eq(vendorContacts.organizationId, user.organizationId)));
      if (!contact) throw new NotFoundError();
      const next = !contact.isActive;
      await tx
        .update(vendorContacts)
        .set({ isActive: next, isPrimary: next ? contact.isPrimary : false, updatedAt: new Date() })
        .where(eq(vendorContacts.id, contact.id));
      if (!next && contact.isPrimary) {
        await tx.update(vendors).set({ primaryContactId: null }).where(eq(vendors.id, contact.vendorId));
      }
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "vendor_contact",
        entityId: contact.id,
        action: "update",
        field: "isActive",
        oldValue: String(contact.isActive),
        newValue: String(next),
        metadata: { event: next ? "contact_restored" : "contact_archived" },
      });
    });
  } catch (err) {
    return fail(err);
  }
  refresh();
  return success("Contacto actualizado.");
}

export async function setPrimaryVendorContact(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(idSchema, formData);
  if (error) return error;
  try {
    await db.transaction(async (tx) => {
      const [contact] = await tx
        .select()
        .from(vendorContacts)
        .where(and(eq(vendorContacts.id, data.id), eq(vendorContacts.organizationId, user.organizationId)));
      if (!contact) throw new NotFoundError();
      if (!contact.isActive) throw new RuleError("Un contacto inactivo no puede ser principal.");
      await makePrimary(tx, user, contact.vendorId, contact.id);
    });
  } catch (err) {
    return fail(err);
  }
  refresh();
  return success("Contacto principal actualizado.");
}

/** Hard delete — SuperAdmin. Vendor contacts aren't referenced elsewhere in the schema, so no usage check is needed. */
export async function deleteVendorContact(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireRole("superadmin");
  const { data, error } = parseForm(idSchema, formData);
  if (error) return error;
  try {
    await db.transaction(async (tx) => {
      const [contact] = await tx
        .select()
        .from(vendorContacts)
        .where(and(eq(vendorContacts.id, data.id), eq(vendorContacts.organizationId, me.organizationId)));
      if (!contact) throw new NotFoundError();
      await tx.delete(vendorContacts).where(eq(vendorContacts.id, contact.id));
      if (contact.isPrimary) {
        await tx.update(vendors).set({ primaryContactId: null }).where(eq(vendors.id, contact.vendorId));
      }
      await recordAudit(tx, {
        organizationId: me.organizationId,
        userId: Number(me.id),
        entityType: "vendor_contact",
        entityId: contact.id,
        action: "delete",
        metadata: { values: { name: `${contact.firstName} ${contact.lastName}`, vendorId: contact.vendorId } },
      });
    });
  } catch (err) {
    return fail(err);
  }
  refresh();
  return success("Contacto eliminado.");
}

/* -------------------------------------------------------- vendor products */

const vendorProductSchema = z.object({
  vendorId: z.coerce.number().int().positive(),
  serviceId: z.coerce.number().int().positive("Selecciona un servicio del catálogo."),
});

/** Sets a catalog Service's default vendor — "Proveedores → Productos". Re-assignable: picking a service already linked to another vendor here just moves it. */
export async function linkVendorProduct(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(...CATALOG_ROLES);
  const { data, error } = parseForm(vendorProductSchema, formData);
  if (error) return error;

  try {
    await db.transaction(async (tx) => {
      const vendor = await loadVendor(tx, user, data.vendorId);
      const [service] = await tx
        .select()
        .from(services)
        .where(and(eq(services.id, data.serviceId), eq(services.organizationId, user.organizationId)));
      if (!service) throw new NotFoundError();
      const previousVendorId = service.vendorId;
      await tx.update(services).set({ vendorId: vendor.id, updatedAt: new Date() }).where(eq(services.id, service.id));
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "service",
        entityId: service.id,
        action: "update",
        field: "vendorId",
        oldValue: previousVendorId ? String(previousVendorId) : null,
        newValue: String(vendor.id),
        metadata: { event: "vendor_product_linked", vendorName: vendor.name },
      });
    });
  } catch (err) {
    return fail(err);
  }
  refresh(data.vendorId);
  revalidatePath("/companies");
  return success("Producto agregado al proveedor.");
}

export async function unlinkVendorProduct(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(...CATALOG_ROLES);
  const { data, error } = parseForm(z.object({ serviceId: z.coerce.number().int().positive(), vendorId: z.coerce.number().int().positive() }), formData);
  if (error) return error;

  try {
    await db.transaction(async (tx) => {
      const [service] = await tx
        .select()
        .from(services)
        .where(and(eq(services.id, data.serviceId), eq(services.organizationId, user.organizationId)));
      if (!service) throw new NotFoundError();
      await tx.update(services).set({ vendorId: null, updatedAt: new Date() }).where(eq(services.id, service.id));
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "service",
        entityId: service.id,
        action: "update",
        field: "vendorId",
        oldValue: String(data.vendorId),
        newValue: null,
        metadata: { event: "vendor_product_unlinked" },
      });
    });
  } catch (err) {
    return fail(err);
  }
  refresh(data.vendorId);
  revalidatePath("/companies");
  return success("Producto quitado del proveedor.");
}
