import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, type DbExecutor } from "@/db";
import { billingInvoiceTickets, billingInvoiceTimeEntries, billingInvoices, tickets, timeEntries, users, workItems } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { getTicketBillingStatus, getTicketBillingStatusBySemanticKey, legacyBillingFor } from "@/lib/ticket-catalogs";
import type { SessionUser } from "@/lib/session";

/**
 * Invoiced-state overlay for the Reportes → Cobros y facturación statement.
 * A billing_invoices row is a "cut" (corte) — an arbitrary set of tickets
 * (billing_invoice_tickets), not tied to a calendar period. A client can
 * have many invoices per month (weekly cuts). Distinct from
 * tickets.billingStatus and timeEntries.billingStatus, but not independent
 * of them: creating/reverting an invoice cascades the ticket's billing
 * status to/from "Charged" (semanticKey CHARGED), and moves any of its time
 * entries still "Pending review" to "Billable" (never touches entries
 * someone already classified Non-billable/Included in contract) — so an
 * invoiced ticket doesn't keep showing stale pending statuses elsewhere in
 * the app. Real incidents 2026-08-31/09-01.
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
 * ticket is never silently double-billed or moved from a different client.
 * Also flips each ticket's billing status to "Charged" (if the org's
 * catalog has that semantic status — a best-effort cascade, not a hard
 * requirement, since catalogs are org-configurable). */
export async function createBillingInvoice(
  tx: DbExecutor,
  user: SessionUser,
  input: { companyId: number; ticketIds: number[]; invoiceNumber: string },
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (input.ticketIds.length === 0) return { ok: false, message: "Selecciona al menos un ticket." };

  const rows = await tx
    .select({ id: tickets.id, workItemId: workItems.id, companyId: workItems.companyId, billingStatusId: tickets.billingStatusId })
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
    rows.map((r) => ({
      organizationId: user.organizationId,
      invoiceId: invoice.id,
      ticketId: r.id,
      previousBillingStatusId: r.billingStatusId,
    })),
  );

  const charged = await getTicketBillingStatusBySemanticKey(tx, user.organizationId, "CHARGED");
  if (charged) {
    await tx
      .update(tickets)
      .set({ billingStatusId: charged.id, billingStatus: legacyBillingFor(charged) })
      .where(inArray(tickets.id, input.ticketIds));
  }

  // Time entries carry their own billing status, separate from the ticket's
  // — only the ones still "Pending review" move to "Billable" (an entry
  // someone already marked Non-billable/Included in contract was a
  // deliberate call, invoicing the ticket doesn't overrule it). Recorded in
  // billing_invoice_time_entries so revertBillingInvoice() restores exactly
  // these, not every billable entry under the ticket.
  const workItemIds = rows.map((r) => r.workItemId);
  const pendingEntries = await tx
    .select({ id: timeEntries.id })
    .from(timeEntries)
    .where(and(inArray(timeEntries.workItemId, workItemIds), eq(timeEntries.billingStatus, "pending_review"), isNull(timeEntries.voidedAt)));
  if (pendingEntries.length > 0) {
    const entryIds = pendingEntries.map((e) => e.id);
    await tx.insert(billingInvoiceTimeEntries).values(
      entryIds.map((timeEntryId) => ({ organizationId: user.organizationId, invoiceId: invoice.id, timeEntryId })),
    );
    await tx.update(timeEntries).set({ billingStatus: "billable" }).where(inArray(timeEntries.id, entryIds));
  }

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

/** Un-invoices — deletes the invoice (billing_invoice_tickets rows
 * cascade-delete with it) and restores each ticket's billing status to
 * whatever it was right before this invoice charged it. */
export async function revertBillingInvoice(tx: DbExecutor, user: SessionUser, invoiceId: number): Promise<boolean> {
  const [existing] = await tx
    .select()
    .from(billingInvoices)
    .where(and(eq(billingInvoices.id, invoiceId), eq(billingInvoices.organizationId, user.organizationId)));
  if (!existing) return false;

  const links = await tx
    .select({ ticketId: billingInvoiceTickets.ticketId, previousBillingStatusId: billingInvoiceTickets.previousBillingStatusId })
    .from(billingInvoiceTickets)
    .where(eq(billingInvoiceTickets.invoiceId, invoiceId));

  // Group by previous status so tickets that shared one (the common case)
  // restore in a single statement instead of one per ticket.
  const ticketIdsByPreviousStatus = new Map<number, number[]>();
  for (const link of links) {
    if (link.previousBillingStatusId === null) continue;
    const list = ticketIdsByPreviousStatus.get(link.previousBillingStatusId);
    if (list) list.push(link.ticketId);
    else ticketIdsByPreviousStatus.set(link.previousBillingStatusId, [link.ticketId]);
  }
  for (const [previousBillingStatusId, ticketIds] of ticketIdsByPreviousStatus) {
    const status = await getTicketBillingStatus(tx, user.organizationId, previousBillingStatusId);
    if (!status) continue; // status was since deleted from the catalog — leave those tickets on "Charged" rather than guess
    await tx
      .update(tickets)
      .set({ billingStatusId: status.id, billingStatus: legacyBillingFor(status) })
      .where(inArray(tickets.id, ticketIds));
  }

  const entryLinks = await tx
    .select({ timeEntryId: billingInvoiceTimeEntries.timeEntryId })
    .from(billingInvoiceTimeEntries)
    .where(eq(billingInvoiceTimeEntries.invoiceId, invoiceId));
  if (entryLinks.length > 0) {
    await tx
      .update(timeEntries)
      .set({ billingStatus: "pending_review" })
      .where(inArray(timeEntries.id, entryLinks.map((e) => e.timeEntryId)));
  }

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
