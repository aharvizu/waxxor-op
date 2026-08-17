import { and, eq, inArray } from "drizzle-orm";
import { db, type DbExecutor } from "@/db";
import { billingInvoices, users } from "@/db/schema";
import { diffFields, recordAudit } from "@/lib/audit";
import type { LocalDate } from "@/lib/recurrence";
import type { SessionUser } from "@/lib/session";

/**
 * Invoiced-state overlay for the Reportes → Cobros y facturación statement.
 * One row per organization + client + period (see billingInvoices in
 * schema.ts) — entirely independent of tickets.billingStatus, same
 * separation as Fecha agendada vs. SLA on tickets.
 */
export type BillingInvoiceStatus = {
  invoiceNumber: string | null;
  invoicedAt: Date | null;
  invoicedByName: string | null;
};

/** Looked up per client row on the billing report — keyed by companyId. */
export async function getBillingInvoiceStatuses(
  orgId: number,
  periodStart: LocalDate,
  periodEnd: LocalDate,
  companyIds: number[],
): Promise<Map<number, BillingInvoiceStatus>> {
  if (companyIds.length === 0) return new Map();
  const rows = await db
    .select({
      companyId: billingInvoices.companyId,
      invoiceNumber: billingInvoices.invoiceNumber,
      invoicedAt: billingInvoices.invoicedAt,
      invoicedByName: users.name,
    })
    .from(billingInvoices)
    .leftJoin(users, eq(billingInvoices.invoicedById, users.id))
    .where(
      and(
        eq(billingInvoices.organizationId, orgId),
        eq(billingInvoices.periodStart, periodStart),
        eq(billingInvoices.periodEnd, periodEnd),
        inArray(billingInvoices.companyId, companyIds),
      ),
    );
  return new Map(rows.map((r) => [r.companyId, { invoiceNumber: r.invoiceNumber, invoicedAt: r.invoicedAt, invoicedByName: r.invoicedByName }]));
}

/** Upserts the invoiced state for one client + period, auditing the change. */
export async function setBillingInvoiceStatus(
  tx: DbExecutor,
  user: SessionUser,
  input: { companyId: number; periodStart: LocalDate; periodEnd: LocalDate; invoiceNumber: string | null; invoiced: boolean },
): Promise<void> {
  const scope = and(
    eq(billingInvoices.organizationId, user.organizationId),
    eq(billingInvoices.companyId, input.companyId),
    eq(billingInvoices.periodStart, input.periodStart),
    eq(billingInvoices.periodEnd, input.periodEnd),
  );
  const [existing] = await tx.select().from(billingInvoices).where(scope);

  const patch = {
    invoiceNumber: input.invoiced ? input.invoiceNumber : null,
    invoicedAt: input.invoiced ? new Date() : null,
    invoicedById: input.invoiced ? Number(user.id) : null,
  };

  if (!existing) {
    if (!input.invoiced) return; // nothing to revert — no row exists yet
    const [created] = await tx
      .insert(billingInvoices)
      .values({
        organizationId: user.organizationId,
        companyId: input.companyId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        ...patch,
      })
      .returning({ id: billingInvoices.id });
    await recordAudit(tx, {
      organizationId: user.organizationId,
      userId: Number(user.id),
      entityType: "billing_invoice",
      entityId: created.id,
      action: "create",
      metadata: { companyId: input.companyId, periodStart: input.periodStart, periodEnd: input.periodEnd, ...patch },
    });
    return;
  }

  const changes = diffFields(
    { organizationId: user.organizationId, userId: Number(user.id), entityType: "billing_invoice", entityId: existing.id },
    existing,
    patch,
    ["invoiceNumber", "invoicedAt", "invoicedById"],
  );
  if (changes.length > 0) {
    await tx.update(billingInvoices).set({ ...patch, updatedAt: new Date() }).where(scope);
    await recordAudit(tx, changes);
  }
}
