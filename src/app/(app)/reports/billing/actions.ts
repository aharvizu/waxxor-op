"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { type ActionState, businessError, parseForm, success } from "@/lib/action-result";
import { createBillingInvoice, revertBillingInvoice } from "@/lib/billing-invoices";
import { requireRole } from "@/lib/session";

const BILLING_ROLES = ["superadmin", "administrator"] as const;

const createInvoiceSchema = z.object({
  companyId: z.coerce.number().int().positive(),
  invoiceNumber: z.string().trim().min(1, "Ingresa el número de factura."),
});

export async function createBillingInvoiceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(...BILLING_ROLES);
  const { data, error } = parseForm(createInvoiceSchema, formData);
  if (error) return error;
  const ticketIds = formData
    .getAll("ticketIds")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);

  const result = await db.transaction((tx) => createBillingInvoice(tx, user, { ...data, ticketIds }));
  if (!result.ok) return businessError(result.message);
  revalidatePath("/reports/billing");
  return success("Factura creada.");
}

const revertInvoiceSchema = z.object({
  invoiceId: z.coerce.number().int().positive(),
});

export async function revertBillingInvoiceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(...BILLING_ROLES);
  const { data, error } = parseForm(revertInvoiceSchema, formData);
  if (error) return error;

  const reverted = await db.transaction((tx) => revertBillingInvoice(tx, user, data.invoiceId));
  if (!reverted) return businessError("La factura ya no existe.");
  revalidatePath("/reports/billing");
  return success("Factura eliminada — tickets vueltos a pendientes.");
}
