"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { type ActionState, parseForm, success } from "@/lib/action-result";
import { setBillingInvoiceStatus } from "@/lib/billing-invoices";
import { requireRole } from "@/lib/session";

const BILLING_ROLES = ["superadmin", "administrator"] as const;

const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const markInvoicedSchema = z.object({
  companyId: z.coerce.number().int().positive(),
  periodStart: localDate,
  periodEnd: localDate,
  invoiceNumber: z.string().trim().min(1, "Ingresa el número de factura."),
});

export async function markBillingInvoiced(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(...BILLING_ROLES);
  const { data, error } = parseForm(markInvoicedSchema, formData);
  if (error) return error;

  await db.transaction(async (tx) => {
    await setBillingInvoiceStatus(tx, user, { ...data, invoiced: true });
  });
  revalidatePath("/reports/billing");
  return success("Marcado como facturado.");
}

const markPendingSchema = z.object({
  companyId: z.coerce.number().int().positive(),
  periodStart: localDate,
  periodEnd: localDate,
});

export async function markBillingPending(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(...BILLING_ROLES);
  const { data, error } = parseForm(markPendingSchema, formData);
  if (error) return error;

  await db.transaction(async (tx) => {
    await setBillingInvoiceStatus(tx, user, { ...data, invoiceNumber: null, invoiced: false });
  });
  revalidatePath("/reports/billing");
  return success("Vuelto a pendiente.");
}
