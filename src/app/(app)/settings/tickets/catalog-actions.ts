"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  type ActionState,
  businessError,
  parseForm,
  success,
  unexpectedError,
} from "@/lib/action-result";
import { requireRole } from "@/lib/session";
import {
  CatalogRuleError,
  TICKET_BILLING_CATEGORIES,
  TICKET_STATUS_CATEGORIES,
  createTicketBillingStatus,
  createTicketPriority,
  createTicketStatus,
  deleteTicketBillingStatus,
  deleteTicketPriority,
  deleteTicketStatus,
  duplicateTicketBillingStatus,
  duplicateTicketPriority,
  duplicateTicketStatus,
  reorderTicketBillingStatuses,
  reorderTicketPriorities,
  reorderTicketStatuses,
  setDefaultTicketBillingStatus,
  setDefaultTicketPriority,
  setDefaultTicketStatus,
  toggleTicketBillingStatus,
  toggleTicketPriority,
  toggleTicketStatus,
  updateTicketBillingStatus,
  updateTicketPriority,
  updateTicketStatus,
} from "@/lib/ticket-catalogs";

/** Both roles get full CRUD here — see the sprint's PERMISOS section (not gated stricter for delete, unlike the freeform Catalog Engine). */
const CATALOG_ROLES = ["superadmin", "administrator"] as const;

function fail(err: unknown): ActionState {
  if (err instanceof CatalogRuleError) return businessError(err.message);
  return unexpectedError(err);
}

function refresh() {
  revalidatePath("/settings/tickets");
}

const colorSchema = z.preprocess(
  (v) => (v === undefined || (typeof v === "string" && v.trim() === "") ? null : v),
  z
    .string()
    .refine((v) => /^#[0-9a-fA-F]{6}$/.test(v), "Color inválido.")
    .nullable(),
);
const optionalText = z.preprocess(
  (v) => (v === undefined || (typeof v === "string" && v.trim() === "") ? null : v),
  z.string().trim().max(300).nullable(),
);
const optionalIcon = z.preprocess(
  (v) => (v === undefined || (typeof v === "string" && v.trim() === "") ? null : v),
  z.string().trim().max(60).nullable(),
);
const idSchema = z.object({ id: z.coerce.number().int().positive() });
const reassignSchema = z.object({
  id: z.coerce.number().int().positive(),
  reassignToId: z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().int().positive().nullable()),
});
const reorderSchema = z.object({ orderedIds: z.string().min(1) });
function parseOrderedIds(raw: string): number[] {
  return raw.split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0);
}

/* ------------------------------------------------------------------ */
/* Ticket Statuses                                                     */
/* ------------------------------------------------------------------ */

const statusCreateSchema = z.object({
  name: z.string().trim().min(1, "Nombre requerido.").max(120),
  description: optionalText,
  color: colorSchema,
  icon: optionalIcon,
  category: z.enum(TICKET_STATUS_CATEGORIES),
});

export async function createTicketStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireRole(...CATALOG_ROLES);
    const { data, error } = parseForm(statusCreateSchema, formData);
    if (error) return error;
    await createTicketStatus(user.organizationId, Number(user.id), data);
    refresh();
    return success("Estado creado.");
  } catch (err) {
    return fail(err);
  }
}

export async function updateTicketStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireRole(...CATALOG_ROLES);
    const { data, error } = parseForm(statusCreateSchema.extend(idSchema.shape), formData);
    if (error) return error;
    await updateTicketStatus(user.organizationId, Number(user.id), data.id, data);
    refresh();
    return success("Estado actualizado.");
  } catch (err) {
    return fail(err);
  }
}

export async function toggleTicketStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireRole(...CATALOG_ROLES);
    const { data, error } = parseForm(idSchema, formData);
    if (error) return error;
    await toggleTicketStatus(user.organizationId, Number(user.id), data.id);
    refresh();
    return success();
  } catch (err) {
    return fail(err);
  }
}

export async function setDefaultTicketStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireRole(...CATALOG_ROLES);
    const { data, error } = parseForm(idSchema, formData);
    if (error) return error;
    await setDefaultTicketStatus(user.organizationId, Number(user.id), data.id);
    refresh();
    return success("Valor predeterminado actualizado.");
  } catch (err) {
    return fail(err);
  }
}

export async function duplicateTicketStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireRole(...CATALOG_ROLES);
    const { data, error } = parseForm(idSchema, formData);
    if (error) return error;
    await duplicateTicketStatus(user.organizationId, Number(user.id), data.id);
    refresh();
    return success("Estado duplicado.");
  } catch (err) {
    return fail(err);
  }
}

export async function reorderTicketStatusesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireRole(...CATALOG_ROLES);
    const { data, error } = parseForm(reorderSchema, formData);
    if (error) return error;
    await reorderTicketStatuses(user.organizationId, parseOrderedIds(data.orderedIds));
    refresh();
    return success();
  } catch (err) {
    return fail(err);
  }
}

export async function deleteTicketStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireRole(...CATALOG_ROLES);
    const { data, error } = parseForm(reassignSchema, formData);
    if (error) return error;
    const result = await deleteTicketStatus(user.organizationId, Number(user.id), data.id, data.reassignToId);
    refresh();
    return success(result.reassigned > 0 ? `Estado eliminado — ${result.reassigned} ticket(s) reasignados.` : "Estado eliminado.");
  } catch (err) {
    return fail(err);
  }
}

/* ------------------------------------------------------------------ */
/* Ticket Priorities                                                    */
/* ------------------------------------------------------------------ */

const priorityCreateSchema = z.object({
  name: z.string().trim().min(1, "Nombre requerido.").max(120),
  description: optionalText,
  color: colorSchema,
  icon: optionalIcon,
  level: z.coerce.number().int().min(0).max(1000),
});

export async function createTicketPriorityAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireRole(...CATALOG_ROLES);
    const { data, error } = parseForm(priorityCreateSchema, formData);
    if (error) return error;
    await createTicketPriority(user.organizationId, Number(user.id), data);
    refresh();
    return success("Prioridad creada. Recuerda asociarle una regla de SLA en Configuración → SLA si aplica.");
  } catch (err) {
    return fail(err);
  }
}

export async function updateTicketPriorityAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireRole(...CATALOG_ROLES);
    const { data, error } = parseForm(priorityCreateSchema.extend(idSchema.shape), formData);
    if (error) return error;
    await updateTicketPriority(user.organizationId, Number(user.id), data.id, data);
    refresh();
    return success("Prioridad actualizada.");
  } catch (err) {
    return fail(err);
  }
}

export async function toggleTicketPriorityAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireRole(...CATALOG_ROLES);
    const { data, error } = parseForm(idSchema, formData);
    if (error) return error;
    await toggleTicketPriority(user.organizationId, Number(user.id), data.id);
    refresh();
    return success();
  } catch (err) {
    return fail(err);
  }
}

export async function setDefaultTicketPriorityAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireRole(...CATALOG_ROLES);
    const { data, error } = parseForm(idSchema, formData);
    if (error) return error;
    await setDefaultTicketPriority(user.organizationId, Number(user.id), data.id);
    refresh();
    return success("Valor predeterminado actualizado.");
  } catch (err) {
    return fail(err);
  }
}

export async function duplicateTicketPriorityAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireRole(...CATALOG_ROLES);
    const { data, error } = parseForm(idSchema, formData);
    if (error) return error;
    await duplicateTicketPriority(user.organizationId, Number(user.id), data.id);
    refresh();
    return success("Prioridad duplicada.");
  } catch (err) {
    return fail(err);
  }
}

export async function reorderTicketPrioritiesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireRole(...CATALOG_ROLES);
    const { data, error } = parseForm(reorderSchema, formData);
    if (error) return error;
    await reorderTicketPriorities(user.organizationId, parseOrderedIds(data.orderedIds));
    refresh();
    return success();
  } catch (err) {
    return fail(err);
  }
}

export async function deleteTicketPriorityAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireRole(...CATALOG_ROLES);
    const { data, error } = parseForm(reassignSchema, formData);
    if (error) return error;
    const result = await deleteTicketPriority(user.organizationId, Number(user.id), data.id, data.reassignToId);
    refresh();
    return success(result.reassigned > 0 ? `Prioridad eliminada — ${result.reassigned} ticket(s) reasignados.` : "Prioridad eliminada.");
  } catch (err) {
    return fail(err);
  }
}

/* ------------------------------------------------------------------ */
/* Ticket Billing Statuses                                              */
/* ------------------------------------------------------------------ */

const billingCreateSchema = z.object({
  name: z.string().trim().min(1, "Nombre requerido.").max(120),
  description: optionalText,
  color: colorSchema,
  icon: optionalIcon,
  category: z.enum(TICKET_BILLING_CATEGORIES),
});

export async function createTicketBillingStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireRole(...CATALOG_ROLES);
    const { data, error } = parseForm(billingCreateSchema, formData);
    if (error) return error;
    await createTicketBillingStatus(user.organizationId, Number(user.id), data);
    refresh();
    return success("Estatus de cobro creado.");
  } catch (err) {
    return fail(err);
  }
}

export async function updateTicketBillingStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireRole(...CATALOG_ROLES);
    const { data, error } = parseForm(billingCreateSchema.extend(idSchema.shape), formData);
    if (error) return error;
    await updateTicketBillingStatus(user.organizationId, Number(user.id), data.id, data);
    refresh();
    return success("Estatus de cobro actualizado.");
  } catch (err) {
    return fail(err);
  }
}

export async function toggleTicketBillingStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireRole(...CATALOG_ROLES);
    const { data, error } = parseForm(idSchema, formData);
    if (error) return error;
    await toggleTicketBillingStatus(user.organizationId, Number(user.id), data.id);
    refresh();
    return success();
  } catch (err) {
    return fail(err);
  }
}

export async function setDefaultTicketBillingStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireRole(...CATALOG_ROLES);
    const { data, error } = parseForm(idSchema, formData);
    if (error) return error;
    await setDefaultTicketBillingStatus(user.organizationId, Number(user.id), data.id);
    refresh();
    return success("Valor predeterminado actualizado.");
  } catch (err) {
    return fail(err);
  }
}

export async function duplicateTicketBillingStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireRole(...CATALOG_ROLES);
    const { data, error } = parseForm(idSchema, formData);
    if (error) return error;
    await duplicateTicketBillingStatus(user.organizationId, Number(user.id), data.id);
    refresh();
    return success("Estatus de cobro duplicado.");
  } catch (err) {
    return fail(err);
  }
}

export async function reorderTicketBillingStatusesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireRole(...CATALOG_ROLES);
    const { data, error } = parseForm(reorderSchema, formData);
    if (error) return error;
    await reorderTicketBillingStatuses(user.organizationId, parseOrderedIds(data.orderedIds));
    refresh();
    return success();
  } catch (err) {
    return fail(err);
  }
}

export async function deleteTicketBillingStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireRole(...CATALOG_ROLES);
    const { data, error } = parseForm(reassignSchema, formData);
    if (error) return error;
    const result = await deleteTicketBillingStatus(user.organizationId, Number(user.id), data.id, data.reassignToId);
    refresh();
    return success(result.reassigned > 0 ? `Estatus de cobro eliminado — ${result.reassigned} ticket(s) reasignados.` : "Estatus de cobro eliminado.");
  } catch (err) {
    return fail(err);
  }
}
