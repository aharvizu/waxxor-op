"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, type DbExecutor } from "@/db";
import {
  clientNotes,
  clientServices,
  companies,
  contacts,
  contracts,
  conversations,
  messages,
  services,
  tickets,
  users,
} from "@/db/schema";
import {
  type ActionState,
  businessError,
  parseForm,
  success,
  unexpectedError,
} from "@/lib/action-result";
import { diffFields, recordAudit } from "@/lib/audit";
import {
  clientServiceTypeSchema,
  clientStatusSchema,
  contactTypeSchema,
  contractStatusSchema,
  contractTypeSchema,
  serviceStatusSchema,
  supportCoverageSchema,
} from "@/lib/company360";
import { requireRole, requireUser, type SessionUser } from "@/lib/session";

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
const optionalMoney = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : String(v)),
  z.string().regex(/^\d+(\.\d{1,2})?$/, "Monto inválido (ej. 750 o 750.50).").nullable(),
);
const optionalInt = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
  z.number().int().min(0).nullable(),
);
const requiredDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha requerida.");
const optionalDate = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : v),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida.").nullable(),
);
const idSchema = z.object({ id: z.coerce.number().int().positive() });

function fail(err: unknown): ActionState {
  if (err instanceof NotFoundError) return businessError("El registro ya no existe.");
  if (err instanceof RuleError) return businessError(err.message);
  return unexpectedError(err);
}

function refresh(companyId?: number) {
  revalidatePath("/companies");
  if (companyId) revalidatePath(`/companies/${companyId}`);
  revalidatePath("/contacts");
}

async function loadClient(tx: DbExecutor, user: SessionUser, id: number) {
  const [row] = await tx
    .select()
    .from(companies)
    .where(and(eq(companies.id, id), eq(companies.organizationId, user.organizationId)));
  if (!row) throw new NotFoundError();
  return row;
}

/* ------------------------------------------------------------- client */

const clientProfileSchema = z.object({
  id: z.coerce.number().int().positive(),
  name: z.string("Nombre requerido.").trim().min(1, "Nombre requerido."),
  legalName: optionalText,
  ownerName: optionalText,
  industry: optionalText,
  website: optionalText,
  email: optionalText,
  phone: optionalText,
  address: optionalText,
  city: optionalText,
  state: optionalText,
  country: optionalText,
  status: clientStatusSchema,
  accountOwnerId: optionalId,
  defaultTechnicianId: optionalId,
  notes: optionalText,
});

const CLIENT_AUDITED = [
  "name", "legalName", "ownerName", "industry", "website", "email", "phone",
  "address", "city", "state", "country", "status", "accountOwnerId",
  "defaultTechnicianId", "notes",
] as const;

export async function updateClientProfile(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(clientProfileSchema, formData);
  if (error) return error;

  try {
    await db.transaction(async (tx) => {
      const before = await loadClient(tx, user, data.id);
      const validUser = async (id: number | null) => {
        if (id === null) return null;
        const [u] = await tx
          .select({ id: users.id })
          .from(users)
          .where(
            and(eq(users.id, id), eq(users.organizationId, user.organizationId), ne(users.role, "client")),
          );
        return u?.id ?? null;
      };
      const patch = {
        ...data,
        id: undefined,
        accountOwnerId: await validUser(data.accountOwnerId),
        defaultTechnicianId: await validUser(data.defaultTechnicianId),
      };
      const changes = diffFields(
        { organizationId: user.organizationId, userId: Number(user.id), entityType: "client", entityId: before.id },
        before,
        patch,
        CLIENT_AUDITED,
      );
      if (changes.length === 0) return;
      await tx
        .update(companies)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(companies.id, before.id));
      await recordAudit(tx, changes);
    });
  } catch (err) {
    return fail(err);
  }
  refresh(data.id);
  return success("Empresa actualizada.");
}

/** Permanent client deletion — SuperAdmin only; blocked while it has work. */
export async function deleteClient(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const me = await requireRole("superadmin");
  const { data, error } = parseForm(idSchema, formData);
  if (error) return error;

  try {
    await db.transaction(async (tx) => {
      const client = await loadClient(tx, me, data.id);
      const [work] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(sql`work_items`)
        .where(sql`company_id = ${client.id}`);
      if (work.n > 0) {
        throw new RuleError(
          "Este cliente tiene trabajo registrado — archívalo en lugar de eliminarlo.",
        );
      }
      await tx.delete(companies).where(eq(companies.id, client.id)); // contacts/services/contracts/notes cascade
      await recordAudit(tx, {
        organizationId: me.organizationId,
        userId: Number(me.id),
        entityType: "client",
        entityId: client.id,
        action: "delete",
        metadata: { values: { name: client.name, status: client.status } },
      });
    });
  } catch (err) {
    return fail(err);
  }
  revalidatePath("/companies");
  return success("Empresa eliminada permanentemente.");
}

/* ------------------------------------------------------------ contacts */

const contactSchema = z.object({
  companyId: z.coerce.number().int().positive(),
  firstName: z.string("Nombre requerido.").trim().min(1, "Nombre requerido."),
  lastName: z.string("Apellido requerido.").trim().min(1, "Apellido requerido."),
  jobTitle: optionalText,
  department: optionalText,
  email: optionalText,
  phone: optionalText,
  mobile: optionalText,
  whatsappNumber: optionalText,
  contactType: contactTypeSchema.default("other"),
  isPrimary: z.preprocess((v) => v === "on" || v === "true", z.boolean()).default(false),
  notes: optionalText,
});

const CONTACT_AUDITED = [
  "firstName", "lastName", "jobTitle", "department", "email", "phone", "mobile",
  "whatsappNumber", "contactType", "isPrimary", "isActive", "notes",
] as const;

/** Only one primary per client — demote siblings and update the client pointer, transactionally. */
async function makePrimary(tx: DbExecutor, user: SessionUser, companyId: number, contactId: number) {
  await tx
    .update(contacts)
    .set({ isPrimary: false, updatedAt: new Date() })
    .where(
      and(
        eq(contacts.companyId, companyId),
        eq(contacts.organizationId, user.organizationId),
        eq(contacts.isPrimary, true),
        ne(contacts.id, contactId),
      ),
    );
  await tx
    .update(contacts)
    .set({ isPrimary: true, updatedAt: new Date() })
    .where(eq(contacts.id, contactId));
  await tx
    .update(companies)
    .set({ primaryContactId: contactId, updatedAt: new Date() })
    .where(eq(companies.id, companyId));
  await recordAudit(tx, {
    organizationId: user.organizationId,
    userId: Number(user.id),
    entityType: "contact",
    entityId: contactId,
    action: "update",
    field: "isPrimary",
    oldValue: "false",
    newValue: "true",
    metadata: { event: "primary_contact_changed", companyId },
  });
}

export async function createContact(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(contactSchema, formData);
  if (error) return error;

  try {
    await db.transaction(async (tx) => {
      await loadClient(tx, user, data.companyId);
      const [created] = await tx
        .insert(contacts)
        .values({ ...data, organizationId: user.organizationId, isPrimary: false })
        .returning({ id: contacts.id });
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "contact",
        entityId: created.id,
        action: "create",
        metadata: { companyId: data.companyId, values: { ...data, companyId: undefined } },
      });
      if (data.isPrimary) await makePrimary(tx, user, data.companyId, created.id);
    });
  } catch (err) {
    return fail(err);
  }
  refresh(data.companyId);
  return success("Contacto agregado.");
}

export async function updateContact(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(contactSchema.extend(idSchema.shape), formData);
  if (error) return error;

  try {
    await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(contacts)
        .where(and(eq(contacts.id, data.id), eq(contacts.organizationId, user.organizationId)));
      if (!before) throw new NotFoundError();
      // isPrimary changes only via makePrimary; isActive only via toggleContactActive —
      // keep the before-values so diffFields doesn't record phantom changes.
      const patch = {
        ...data,
        id: undefined,
        companyId: undefined,
        isPrimary: before.isPrimary,
        isActive: before.isActive,
      };
      const changes = diffFields(
        { organizationId: user.organizationId, userId: Number(user.id), entityType: "contact", entityId: before.id },
        before,
        patch,
        CONTACT_AUDITED,
      );
      if (changes.length > 0) {
        await tx
          .update(contacts)
          .set({ ...patch, updatedAt: new Date() })
          .where(eq(contacts.id, before.id));
        await recordAudit(tx, changes);
      }
      if (data.isPrimary && !before.isPrimary) {
        await makePrimary(tx, user, before.companyId, before.id);
      }
    });
  } catch (err) {
    return fail(err);
  }
  refresh();
  return success("Contacto actualizado.");
}

export async function setPrimaryContact(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(idSchema, formData);
  if (error) return error;
  try {
    await db.transaction(async (tx) => {
      const [contact] = await tx
        .select()
        .from(contacts)
        .where(and(eq(contacts.id, data.id), eq(contacts.organizationId, user.organizationId)));
      if (!contact) throw new NotFoundError();
      if (!contact.isActive) throw new RuleError("Un contacto inactivo no puede ser principal.");
      await makePrimary(tx, user, contact.companyId, contact.id);
    });
  } catch (err) {
    return fail(err);
  }
  refresh();
  return success("Contacto principal actualizado.");
}

export async function toggleContactActive(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(idSchema, formData);
  if (error) return error;
  try {
    await db.transaction(async (tx) => {
      const [contact] = await tx
        .select()
        .from(contacts)
        .where(and(eq(contacts.id, data.id), eq(contacts.organizationId, user.organizationId)));
      if (!contact) throw new NotFoundError();
      const next = !contact.isActive;
      await tx
        .update(contacts)
        .set({ isActive: next, isPrimary: next ? contact.isPrimary : false, updatedAt: new Date() })
        .where(eq(contacts.id, contact.id));
      if (!next && contact.isPrimary) {
        await tx
          .update(companies)
          .set({ primaryContactId: null })
          .where(eq(companies.id, contact.companyId));
      }
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "contact",
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

/** Hard delete — SuperAdmin, blocked when referenced by tickets/conversations. */
export async function deleteContact(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const me = await requireRole("superadmin");
  const { data, error } = parseForm(idSchema, formData);
  if (error) return error;
  try {
    await db.transaction(async (tx) => {
      const [contact] = await tx
        .select()
        .from(contacts)
        .where(and(eq(contacts.id, data.id), eq(contacts.organizationId, me.organizationId)));
      if (!contact) throw new NotFoundError();
      const [refs] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(tickets)
        .where(eq(tickets.confirmedByContactId, contact.id));
      const [refs2] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(conversations)
        .where(eq(conversations.contactId, contact.id));
      const [refs3] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(messages)
        .where(eq(messages.contactId, contact.id));
      if (refs.n > 0 || refs2.n > 0 || refs3.n > 0) {
        throw new RuleError("Este contacto está referenciado — archívalo en lugar de eliminarlo.");
      }
      await tx.delete(contacts).where(eq(contacts.id, contact.id));
      if (contact.isPrimary) {
        await tx
          .update(companies)
          .set({ primaryContactId: null })
          .where(eq(companies.id, contact.companyId));
      }
      await recordAudit(tx, {
        organizationId: me.organizationId,
        userId: Number(me.id),
        entityType: "contact",
        entityId: contact.id,
        action: "delete",
        metadata: { values: { name: `${contact.firstName} ${contact.lastName}`, companyId: contact.companyId } },
      });
    });
  } catch (err) {
    return fail(err);
  }
  refresh();
  return success("Contacto eliminado.");
}

/* ------------------------------------------------------------ services */

const serviceSchema = z.object({
  name: z.string("Nombre requerido.").trim().min(1, "Nombre requerido."),
  category: z.string().trim().min(1).default("general"),
  description: optionalText,
  scope: optionalText,
  defaultRemoteRate: optionalMoney,
  defaultOnsiteRate: optionalMoney,
  defaultFixedPrice: optionalMoney,
  isRenewable: z.preprocess((v) => v === "on" || v === "true", z.boolean()).default(false),
  status: serviceStatusSchema.default("active"),
});

export async function createService(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
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

/* ------------------------------------------------------ client services */

const clientServiceSchema = z.object({
  companyId: z.coerce.number().int().positive(),
  serviceId: z.coerce.number().int().positive("Selecciona un servicio."),
  serviceType: clientServiceTypeSchema.default("recurring_service"),
  quantity: optionalInt,
  provider: optionalText,
  billingCycle: optionalText,
  cost: optionalMoney,
  clientPrice: optionalMoney,
  startDate: requiredDate,
  endDate: optionalDate,
  renewalDate: optionalDate,
  supportCoverage: supportCoverageSchema.default("not_applicable"),
  includedHours: optionalInt,
  remoteRate: optionalMoney,
  onsiteRate: optionalMoney,
  fixedPrice: optionalMoney,
  notes: optionalText,
});

const CLIENT_SERVICE_AUDITED = [
  "serviceId", "serviceType", "status", "quantity", "provider", "billingCycle",
  "cost", "clientPrice", "startDate", "endDate", "renewalDate",
  "supportCoverage", "includedHours", "remoteRate", "onsiteRate", "fixedPrice", "notes",
] as const;

export async function addClientService(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(clientServiceSchema, formData);
  if (error) return error;
  try {
    await db.transaction(async (tx) => {
      await loadClient(tx, user, data.companyId);
      const [svc] = await tx
        .select({ id: services.id })
        .from(services)
        .where(and(eq(services.id, data.serviceId), eq(services.organizationId, user.organizationId)));
      if (!svc) throw new NotFoundError();
      const [created] = await tx
        .insert(clientServices)
        .values({ ...data, organizationId: user.organizationId })
        .returning({ id: clientServices.id });
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "client_service",
        entityId: created.id,
        action: "create",
        metadata: { companyId: data.companyId, values: { ...data, companyId: undefined } },
      });
    });
  } catch (err) {
    return fail(err);
  }
  refresh(data.companyId);
  return success("Servicio contratado registrado.");
}

export async function updateClientService(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(
    clientServiceSchema.extend(idSchema.shape).extend({
      status: z.enum(clientServices.status.enumValues).default("active"),
    }),
    formData,
  );
  if (error) return error;
  try {
    await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(clientServices)
        .where(and(eq(clientServices.id, data.id), eq(clientServices.organizationId, user.organizationId)));
      if (!before) throw new NotFoundError();
      const patch = { ...data, id: undefined, companyId: undefined };
      const changes = diffFields(
        { organizationId: user.organizationId, userId: Number(user.id), entityType: "client_service", entityId: before.id },
        before,
        patch,
        CLIENT_SERVICE_AUDITED,
      );
      if (changes.length === 0) return;
      await tx
        .update(clientServices)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(clientServices.id, before.id));
      await recordAudit(tx, changes);
    });
  } catch (err) {
    return fail(err);
  }
  refresh(data.companyId);
  return success("Servicio actualizado.");
}

/* ------------------------------------------------------------ contracts */

const contractSchema = z.object({
  companyId: z.coerce.number().int().positive(),
  name: z.string("Nombre requerido.").trim().min(1, "Nombre requerido."),
  contractType: contractTypeSchema.default("support"),
  status: contractStatusSchema.default("active"),
  startDate: requiredDate,
  endDate: optionalDate,
  autoRenew: z.preprocess((v) => v === "on" || v === "true", z.boolean()).default(false),
  includedHours: optionalInt,
  monthlyAmount: optionalMoney,
  notes: optionalText,
});

const CONTRACT_AUDITED = [
  "name", "contractType", "status", "startDate", "endDate",
  "autoRenew", "includedHours", "monthlyAmount", "notes",
] as const;

export async function createContract(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(contractSchema, formData);
  if (error) return error;
  try {
    await db.transaction(async (tx) => {
      await loadClient(tx, user, data.companyId);
      const [created] = await tx
        .insert(contracts)
        .values({ ...data, organizationId: user.organizationId })
        .returning({ id: contracts.id });
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "contract",
        entityId: created.id,
        action: "create",
        metadata: { companyId: data.companyId, values: { ...data, companyId: undefined } },
      });
    });
  } catch (err) {
    return fail(err);
  }
  refresh(data.companyId);
  return success("Contrato registrado.");
}

export async function updateContract(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(contractSchema.extend(idSchema.shape), formData);
  if (error) return error;
  try {
    await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(contracts)
        .where(and(eq(contracts.id, data.id), eq(contracts.organizationId, user.organizationId)));
      if (!before) throw new NotFoundError();
      const patch = { ...data, id: undefined, companyId: undefined };
      const changes = diffFields(
        { organizationId: user.organizationId, userId: Number(user.id), entityType: "contract", entityId: before.id },
        before,
        patch,
        CONTRACT_AUDITED,
      );
      if (changes.length === 0) return;
      await tx
        .update(contracts)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(contracts.id, before.id));
      await recordAudit(tx, changes);
    });
  } catch (err) {
    return fail(err);
  }
  refresh(data.companyId);
  return success("Contrato actualizado.");
}

/** SuperAdmin-only permanent contract deletion. */
export async function deleteContract(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const me = await requireRole("superadmin");
  const { data, error } = parseForm(idSchema, formData);
  if (error) return error;
  try {
    await db.transaction(async (tx) => {
      const [contract] = await tx
        .select()
        .from(contracts)
        .where(and(eq(contracts.id, data.id), eq(contracts.organizationId, me.organizationId)));
      if (!contract) throw new NotFoundError();
      await tx.delete(contracts).where(eq(contracts.id, contract.id));
      await recordAudit(tx, {
        organizationId: me.organizationId,
        userId: Number(me.id),
        entityType: "contract",
        entityId: contract.id,
        action: "delete",
        metadata: { values: { name: contract.name, companyId: contract.companyId } },
      });
    });
  } catch (err) {
    return fail(err);
  }
  refresh();
  return success("Contrato eliminado permanentemente.");
}

/* ---------------------------------------------------------- renewals */

const renewalUpdateSchema = z.object({
  source: z.enum(["client_service", "contract"]),
  sourceId: z.coerce.number().int().positive(),
  companyId: z.coerce.number().int().positive(),
  newDate: optionalDate, // null = cancelar renovación (limpia la fecha)
});

/** Renovar / actualizar fecha / cancelar renovación desde la vista consolidada. */
export async function updateRenewal(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(renewalUpdateSchema, formData);
  if (error) return error;
  try {
    await db.transaction(async (tx) => {
      if (data.source === "client_service") {
        const [before] = await tx
          .select()
          .from(clientServices)
          .where(and(eq(clientServices.id, data.sourceId), eq(clientServices.organizationId, user.organizationId)));
        if (!before) throw new NotFoundError();
        await tx
          .update(clientServices)
          .set({ renewalDate: data.newDate, updatedAt: new Date() })
          .where(eq(clientServices.id, before.id));
        await recordAudit(tx, {
          organizationId: user.organizationId,
          userId: Number(user.id),
          entityType: "client_service",
          entityId: before.id,
          action: "update",
          field: "renewalDate",
          oldValue: before.renewalDate,
          newValue: data.newDate,
          metadata: { event: "renewal_updated", companyId: before.companyId },
        });
      } else {
        const [before] = await tx
          .select()
          .from(contracts)
          .where(and(eq(contracts.id, data.sourceId), eq(contracts.organizationId, user.organizationId)));
        if (!before) throw new NotFoundError();
        await tx
          .update(contracts)
          .set({ endDate: data.newDate, updatedAt: new Date() })
          .where(eq(contracts.id, before.id));
        await recordAudit(tx, {
          organizationId: user.organizationId,
          userId: Number(user.id),
          entityType: "contract",
          entityId: before.id,
          action: "update",
          field: "endDate",
          oldValue: before.endDate,
          newValue: data.newDate,
          metadata: { event: "renewal_updated", companyId: before.companyId },
        });
      }
    });
  } catch (err) {
    return fail(err);
  }
  refresh(data.companyId);
  return success(data.newDate ? "Renovación actualizada." : "Renovación cancelada.");
}

/* -------------------------------------------------------------- notes */

const noteSchema = z.object({
  companyId: z.coerce.number().int().positive(),
  body: z.string("Escribe la nota.").trim().min(1, "Escribe la nota."),
});

export async function addClientNote(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(noteSchema, formData);
  if (error) return error;
  try {
    await db.transaction(async (tx) => {
      await loadClient(tx, user, data.companyId);
      const [created] = await tx
        .insert(clientNotes)
        .values({
          organizationId: user.organizationId,
          companyId: data.companyId,
          authorId: Number(user.id),
          body: data.body,
        })
        .returning({ id: clientNotes.id });
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "client_note",
        entityId: created.id,
        action: "create",
        metadata: { companyId: data.companyId },
      });
    });
  } catch (err) {
    return fail(err);
  }
  refresh(data.companyId);
  return success("Nota agregada.");
}

export async function editOwnClientNote(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(noteSchema.extend(idSchema.shape), formData);
  if (error) return error;
  try {
    await db.transaction(async (tx) => {
      const [note] = await tx
        .select()
        .from(clientNotes)
        .where(and(eq(clientNotes.id, data.id), eq(clientNotes.organizationId, user.organizationId)));
      if (!note) throw new NotFoundError();
      if (note.authorId !== Number(user.id)) {
        throw new RuleError("Solo el autor puede editar su nota.");
      }
      await tx
        .update(clientNotes)
        .set({ body: data.body, editedAt: new Date() })
        .where(eq(clientNotes.id, note.id));
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "client_note",
        entityId: note.id,
        action: "update",
        field: "body",
        oldValue: note.body,
        newValue: data.body,
        metadata: { event: "note_edited" },
      });
    });
  } catch (err) {
    return fail(err);
  }
  refresh(data.companyId);
  return success("Nota actualizada.");
}
