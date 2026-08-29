import { and, eq, inArray } from "drizzle-orm";
import { db, type DbExecutor } from "@/db";
import { billingInvoiceTickets, billingInvoices, tickets, users, workItems } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import type { SessionUser } from "@/lib/session";

/**
 * Invoiced-state overlay for the Reportes → Cobros y facturación statement.
 * A billing_invoices row is a "cut" (corte) — an arbitrary set of tickets
 * (billing_invoice_tickets), not tied to a calendar period. A client can
 * have many invoices per month (weekly cuts). Entirely independent of
 * tickets.billingStatus, same separation as Fecha agendada vs. SLA.
 */
export type TicketInvoiceInfo = {
  invoiceId: number;
  invoiceNumber: string;
  invoicedAt: Date;
  invoicedByName: string | null;
};

/** Looked up for a set of tickets on the billing report — keyed by ticketId. */
export async function getTicketInvoiceMap(orgId: number, ticketIds: number[]): Promise<Map<number, TicketInvoiceInfo>> {
  if (ticketIds.length === 0) return new Map();
  const rows = await db
    .select({
      ticketId: billingInvoiceTickets.ticketId,
      invoiceId: billingInvoices.id,
      invoiceNumber: billingInvoices.invoiceNumber,
      invoicedAt: billingInvoices.invoicedAt,
      invoicedByName: users.name,
    })
    .from(billingInvoiceTickets)
    .innerJoin(billingInvoices, eq(billingInvoiceTickets.invoiceId, billingInvoices.id))
    .leftJoin(users, eq(billingInvoices.invoicedById, users.id))
    .where(and(eq(billingInvoiceTickets.organizationId, orgId), inArray(billingInvoiceTickets.ticketId, ticketIds)));
  return new Map(
    rows.map((r) => [
      r.ticketId,
      { invoiceId: r.invoiceId, invoiceNumber: r.invoiceNumber, invoicedAt: r.invoicedAt, invoicedByName: r.invoicedByName },
    ]),
  );
}

/** Creates a new invoice covering exactly `ticketIds` — rejects tickets
 * already on another invoice or that don't belong to this org+company, so a
 * ticket is never silently double-billed or moved from a different client. */
export async function createBillingInvoice(
  tx: DbExecutor,
  user: SessionUser,
  input: { companyId: number; ticketIds: number[]; invoiceNumber: string },
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (input.ticketIds.length === 0) return { ok: false, message: "Selecciona al menos un ticket." };

  const rows = await tx
    .select({ id: tickets.id, companyId: workItems.companyId })
    .from(tickets)
    .innerJoin(workItems, eq(tickets.workItemId, workItems.id))
    .where(and(eq(tickets.organizationId, user.organizationId), inArray(tickets.id, input.ticketIds)));
  if (rows.length !== input.ticketIds.length) return { ok: false, message: "Algún ticket ya no existe." };
  if (rows.some((r) => r.companyId !== input.companyId)) return { ok: false, message: "Algún ticket no pertenece a este cliente." };

  const alreadyInvoiced = await tx
    .select({ ticketId: billingInvoiceTickets.ticketId })
    .from(billingInvoiceTickets)
    .where(and(eq(billingInvoiceTickets.organizationId, user.organizationId), inArray(billingInvoiceTickets.ticketId, input.ticketIds)));
  if (alreadyInvoiced.length > 0) return { ok: false, message: "Algún ticket seleccionado ya está en otra factura." };

  const [invoice] = await tx
    .insert(billingInvoices)
    .values({
      organizationId: user.organizationId,
      companyId: input.companyId,
      invoiceNumber: input.invoiceNumber,
      invoicedById: Number(user.id),
    })
    .returning({ id: billingInvoices.id });

  await tx.insert(billingInvoiceTickets).values(
    input.ticketIds.map((ticketId) => ({
      organizationId: user.organizationId,
      invoiceId: invoice.id,
      ticketId,
    })),
  );

  await recordAudit(tx, {
    organizationId: user.organizationId,
    userId: Number(user.id),
    entityType: "billing_invoice",
    entityId: invoice.id,
    action: "create",
    metadata: { companyId: input.companyId, invoiceNumber: input.invoiceNumber, ticketIds: input.ticketIds },
  });

  return { ok: true };
}

/** Un-invoices — deletes the invoice; its tickets fall back to pending
 * (billing_invoice_tickets rows cascade-delete with it). */
export async function revertBillingInvoice(tx: DbExecutor, user: SessionUser, invoiceId: number): Promise<boolean> {
  const [existing] = await tx
    .select()
    .from(billingInvoices)
    .where(and(eq(billingInvoices.id, invoiceId), eq(billingInvoices.organizationId, user.organizationId)));
  if (!existing) return false;

  await tx.delete(billingInvoices).where(eq(billingInvoices.id, invoiceId));

  await recordAudit(tx, {
    organizationId: user.organizationId,
    userId: Number(user.id),
    entityType: "billing_invoice",
    entityId: invoiceId,
    action: "delete",
    metadata: { companyId: existing.companyId, invoiceNumber: existing.invoiceNumber },
  });

  return true;
}
