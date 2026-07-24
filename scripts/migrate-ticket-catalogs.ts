import { config } from "dotenv";
config({ path: [".env.local", ".env"] });

/**
 * One-time data migration (2026-07-22): populate the new dynamic
 * ticket_statuses/ticket_priorities/ticket_billing_statuses catalogs with one
 * system row per current Postgres enum value (per organization), preserving
 * any existing org style override (catalog_items kind
 * ticket_status_style/ticket_priority_style/ticket_billing_status_style),
 * then backfill tickets.statusId/priorityId/billingStatusId and
 * sla_definitions.priorityId. Idempotent: orgs that already have rows are
 * skipped. The legacy enum columns are left in place (see
 * src/lib/ticket-catalogs.ts's doc comment — they become an internal mirror,
 * never dropped). Exits 1 if final verification finds any ticket/SLA
 * definition still missing its new FK, so the follow-up NOT NULL migration
 * is never applied against incomplete data.
 */

const TONE_TO_HEX: Record<string, string> = {
  slate: "#64748b",
  blue: "#3b82f6",
  amber: "#f59e0b",
  green: "#10b981",
  red: "#ef4444",
  violet: "#8b5cf6",
  purple: "#a855f7",
};

async function main() {
  const { and, eq, inArray, isNull } = await import("drizzle-orm");
  const { db } = await import("../src/db");
  const { organizations, catalogItems, tickets, workItems, slaDefinitions, ticketStatuses, ticketPriorities, ticketBillingStatuses } = await import(
    "../src/db/schema"
  );
  const { SYSTEM_TICKET_STATUSES, SYSTEM_TICKET_PRIORITIES, SYSTEM_TICKET_BILLING_STATUSES } = await import("../src/lib/ticket-catalogs");

  const orgs = await db.select().from(organizations);
  let orgsMigrated = 0;

  for (const org of orgs) {
    const [existing] = await db.select({ id: ticketStatuses.id }).from(ticketStatuses).where(eq(ticketStatuses.organizationId, org.id));
    if (existing) {
      console.log(`Org ${org.id} (${org.name}) already migrated — skipping.`);
      continue;
    }

    await db.transaction(async (tx) => {
      const styleOverrides = await tx
        .select()
        .from(catalogItems)
        .where(
          and(
            eq(catalogItems.organizationId, org.id),
            inArray(catalogItems.kind, ["ticket_status_style", "ticket_priority_style", "ticket_billing_status_style"]),
          ),
        );
      const overrideFor = (kind: string, name: string) => styleOverrides.find((r) => r.kind === kind && r.name === name);

      const statusIdBySemantic = new Map<string, number>();
      for (const s of SYSTEM_TICKET_STATUSES) {
        const override = overrideFor("ticket_status_style", s.slug);
        const cfg = (override?.config ?? null) as { label?: string; icon?: string } | null;
        const [row] = await tx
          .insert(ticketStatuses)
          .values({
            organizationId: org.id,
            name: cfg?.label || s.name,
            slug: s.slug,
            color: (override?.color && TONE_TO_HEX[override.color]) || s.color,
            icon: cfg?.icon || null,
            category: s.category,
            semanticKey: s.semanticKey,
            sortOrder: s.sortOrder,
            isActive: override ? override.isActive : true,
            isDefault: s.isDefault,
            isSystem: true,
          })
          .returning({ id: ticketStatuses.id });
        statusIdBySemantic.set(s.semanticKey, row.id);
      }

      const priorityIdBySemantic = new Map<string, number>();
      for (const p of SYSTEM_TICKET_PRIORITIES) {
        const override = overrideFor("ticket_priority_style", p.slug);
        const cfg = (override?.config ?? null) as { label?: string; icon?: string } | null;
        const [row] = await tx
          .insert(ticketPriorities)
          .values({
            organizationId: org.id,
            name: cfg?.label || p.name,
            slug: p.slug,
            color: (override?.color && TONE_TO_HEX[override.color]) || p.color,
            icon: cfg?.icon || null,
            level: p.level,
            semanticKey: p.semanticKey,
            sortOrder: p.sortOrder,
            isActive: override ? override.isActive : true,
            isDefault: p.isDefault,
            isSystem: true,
          })
          .returning({ id: ticketPriorities.id });
        priorityIdBySemantic.set(p.semanticKey, row.id);
      }

      const billingIdBySemantic = new Map<string, number>();
      for (const b of SYSTEM_TICKET_BILLING_STATUSES) {
        const override = overrideFor("ticket_billing_status_style", b.slug);
        const cfg = (override?.config ?? null) as { label?: string; icon?: string } | null;
        const [row] = await tx
          .insert(ticketBillingStatuses)
          .values({
            organizationId: org.id,
            name: cfg?.label || b.name,
            slug: b.slug,
            color: (override?.color && TONE_TO_HEX[override.color]) || b.color,
            icon: cfg?.icon || null,
            category: b.category,
            semanticKey: b.semanticKey,
            sortOrder: b.sortOrder,
            isActive: override ? override.isActive : true,
            isDefault: b.isDefault,
            isSystem: true,
          })
          .returning({ id: ticketBillingStatuses.id });
        billingIdBySemantic.set(b.semanticKey, row.id);
      }

      // Backfill tickets: match each ticket's current legacy enum value to its
      // matching system row via the same slug (== legacy enum string).
      const orgTickets = await tx
        .select({ id: tickets.id, workItemId: tickets.workItemId, billingStatus: tickets.billingStatus })
        .from(tickets)
        .where(eq(tickets.organizationId, org.id));
      const workItemRows = await tx
        .select({ id: workItems.id, status: workItems.status, priority: workItems.priority })
        .from(workItems)
        .where(eq(workItems.organizationId, org.id));
      const workItemById = new Map(workItemRows.map((w) => [w.id, w]));

      const statusIdBySlug = new Map(SYSTEM_TICKET_STATUSES.map((s) => [s.slug, statusIdBySemantic.get(s.semanticKey)!]));
      const priorityIdBySlug = new Map(SYSTEM_TICKET_PRIORITIES.map((p) => [p.slug, priorityIdBySemantic.get(p.semanticKey)!]));
      const billingIdBySlug = new Map(SYSTEM_TICKET_BILLING_STATUSES.map((b) => [b.slug, billingIdBySemantic.get(b.semanticKey)!]));

      // "open"/"waiting_on_customer" are legacy pre-0011 values (see schema.ts
      // comment) that shouldn't exist on any current ticket, but map them
      // defensively to their documented replacements just in case.
      const legacyStatusAlias: Record<string, string> = { open: "new", waiting_on_customer: "waiting_customer" };

      let ticketsUpdated = 0;
      for (const t of orgTickets) {
        const wi = workItemById.get(t.workItemId);
        if (!wi) continue;
        const statusSlug = legacyStatusAlias[wi.status] ?? wi.status;
        const statusId = statusIdBySlug.get(statusSlug);
        const priorityId = priorityIdBySlug.get(wi.priority);
        const billingStatusId = billingIdBySlug.get(t.billingStatus);
        if (!statusId || !priorityId || !billingStatusId) {
          throw new Error(`Ticket ${t.id}: no catalog match for status=${wi.status} priority=${wi.priority} billing=${t.billingStatus}`);
        }
        await tx.update(tickets).set({ statusId, priorityId, billingStatusId }).where(eq(tickets.id, t.id));
        ticketsUpdated++;
      }

      const orgSlaDefs = await tx.select().from(slaDefinitions).where(eq(slaDefinitions.organizationId, org.id));
      let slaUpdated = 0;
      for (const def of orgSlaDefs) {
        const priorityId = priorityIdBySlug.get(def.priority);
        if (!priorityId) throw new Error(`SLA definition ${def.id}: no catalog match for priority=${def.priority}`);
        await tx.update(slaDefinitions).set({ priorityId }).where(eq(slaDefinitions.id, def.id));
        slaUpdated++;
      }

      console.log(`Org ${org.id} (${org.name}): seeded 11 statuses, 4 priorities, 8 billing statuses; backfilled ${ticketsUpdated} ticket(s), ${slaUpdated} SLA definition(s).`);
    });
    orgsMigrated++;
  }

  // Final verification across all orgs — must be zero before the follow-up NOT NULL migration.
  const missingStatus = await db.select({ id: tickets.id }).from(tickets).where(isNull(tickets.statusId));
  const missingPriority = await db.select({ id: tickets.id }).from(tickets).where(isNull(tickets.priorityId));
  const missingBilling = await db.select({ id: tickets.id }).from(tickets).where(isNull(tickets.billingStatusId));
  const missingSlaPriority = await db.select({ id: slaDefinitions.id }).from(slaDefinitions).where(isNull(slaDefinitions.priorityId));

  console.log(`\nOrgs migrated this run: ${orgsMigrated}.`);
  console.log(`Verification — tickets missing statusId: ${missingStatus.length}, priorityId: ${missingPriority.length}, billingStatusId: ${missingBilling.length}.`);
  console.log(`Verification — sla_definitions missing priorityId: ${missingSlaPriority.length}.`);

  if (missingStatus.length || missingPriority.length || missingBilling.length || missingSlaPriority.length) {
    console.error("\nVerification FAILED — do not proceed to the NOT NULL migration.");
    process.exit(1);
  }
  console.log("\nVerification passed — safe to tighten the new FK columns to NOT NULL.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
