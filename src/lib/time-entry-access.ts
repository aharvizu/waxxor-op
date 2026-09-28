import { and, eq } from "drizzle-orm";
import { type DbExecutor } from "@/db";
import { billingInvoiceTickets, ticketStatuses, tickets, workItems } from "@/db/schema";

/**
 * How far a work item's time entries may still be edited.
 *
 * Closing a ticket used to freeze its whole Time tab, but the amount to
 * charge lives on the time entries since the 2026-09-14 Billing redesign —
 * so a ticket closed without an hourly rate showed $0 on Cobros y
 * facturación with no way to fix it short of reopening the ticket (real
 * incident: TK-000306 / Prodigia). A closed ticket now keeps its billing
 * fields editable (Billing, Modality, rates) while the record of the work
 * itself — date, duration, technician, description — stays frozen.
 *
 * Invoicing is the real point of no return: once a ticket is on a
 * billing_invoices cut, the charge has left the building and nothing on its
 * time entries may move any more.
 */
export type TimeEntryAccess =
  /** Everything editable — open ticket, or an activity. */
  | "full"
  /** Closed, not invoiced: only the billing fields (and the amount they compute). */
  | "billing"
  /** Invoiced, or an archived activity: nothing editable. */
  | "read";

export function timeEntryAccessFor(ctx: { isClosed: boolean; isInvoiced: boolean }): TimeEntryAccess {
  if (ctx.isInvoiced) return "read";
  return ctx.isClosed ? "billing" : "full";
}

/**
 * Resolves the access for one work item from the database — the actions call
 * this themselves rather than trusting whatever the client's form implies.
 * Activities have no tickets row and keep the unrestricted behaviour they
 * have always had (their own archived lock is applied by the page).
 */
export async function getTimeEntryAccess(
  tx: DbExecutor,
  orgId: number,
  workItemId: number,
): Promise<TimeEntryAccess> {
  const [row] = await tx
    .select({
      statusCategory: ticketStatuses.category,
      invoiceLinkId: billingInvoiceTickets.id,
    })
    .from(workItems)
    .innerJoin(tickets, eq(tickets.workItemId, workItems.id))
    .innerJoin(ticketStatuses, eq(ticketStatuses.id, tickets.statusId))
    .leftJoin(billingInvoiceTickets, eq(billingInvoiceTickets.ticketId, tickets.id))
    .where(and(eq(workItems.id, workItemId), eq(workItems.organizationId, orgId)));
  if (!row) return "full";
  return timeEntryAccessFor({
    isClosed: row.statusCategory === "closed" || row.statusCategory === "cancelled",
    isInvoiced: row.invoiceLinkId !== null,
  });
}
