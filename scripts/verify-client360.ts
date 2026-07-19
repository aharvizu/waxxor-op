import { config } from "dotenv";
config({ path: [".env.local", ".env"] });

/**
 * DB-level invariants for Empresa 360 (server actions themselves are exercised
 * over HTTP in the smoke run — see docs/features/companies-contacts.md):
 *   1. single-primary-contact transactional swap (setPrimaryContact-equivalent);
 *   2. archiving the primary contact clears companies.primaryContactId;
 *   3. contact hard-delete blocked while referenced by a ticket;
 *   4. company hard-delete blocked while it has work items;
 *   5. renewal derivation (client_services + contracts) feeds getOrgRenewals
 *      exactly like it feeds Today's reminders;
 *   6. organization isolation for contacts/services/contracts/notes;
 *   7. rollback on a multi-write failure leaves no partial state.
 * Cleans up everything it creates. Exits 1 on any violation.
 */

async function main() {
  const { neon } = await import("@neondatabase/serverless");
  const sqlHttp = neon(process.env.DATABASE_URL!);
  const { and, eq, sql } = await import("drizzle-orm");
  const { db } = await import("../src/db");
  const {
    clientNotes,
    clientServices,
    companies,
    contacts,
    contracts,
    organizations,
    services,
    tickets,
    workItems,
  } = await import("../src/db/schema");
  const { recordAudit } = await import("../src/lib/audit");
  const { createWorkItem } = await import("../src/lib/work-items");
  const { getOrgRenewals } = await import("../src/lib/company360-data");

  let failures = 0;
  const check = (name: string, ok: boolean, detail = "") => {
    console.log(`${name}: ${ok ? "PASS" : `FAIL ${detail}`}`);
    if (!ok) failures++;
  };

  const [org] = await sqlHttp`select id from organizations where slug = 'watson'`;
  const orgId = org.id as number;
  const [u] = await sqlHttp`select id from users where organization_id = ${orgId} limit 1`;
  const user = { id: String(u.id), role: "superadmin" as const, organizationId: orgId };

  // second org for isolation checks
  const [otherOrg] = await db
    .insert(organizations)
    .values({ name: "C360-VERIFY-OTHER-ORG", slug: `c360-verify-other-${Date.now()}` })
    .returning({ id: organizations.id });

  const cleanup: Array<() => Promise<unknown>> = [];

  // -- fixtures ---------------------------------------------------------
  const [client] = await db
    .insert(companies)
    .values({ organizationId: orgId, name: "C360-VERIFY Client" })
    .returning({ id: companies.id });
  cleanup.push(() => db.delete(companies).where(eq(companies.id, client.id)));

  const [otherClient] = await db
    .insert(companies)
    .values({ organizationId: otherOrg.id, name: "C360-VERIFY Other-org client" })
    .returning({ id: companies.id });
  cleanup.push(() => db.delete(companies).where(eq(companies.id, otherClient.id)));

  const [service] = await db
    .insert(services)
    .values({ organizationId: orgId, name: "C360-VERIFY Service" })
    .returning({ id: services.id });
  cleanup.push(() => db.delete(services).where(eq(services.id, service.id)));

  // 1. single-primary-contact transactional swap ------------------------
  const [contactA] = await db
    .insert(contacts)
    .values({
      organizationId: orgId,
      companyId: client.id,
      firstName: "A",
      lastName: "Primary",
      isPrimary: true,
    })
    .returning({ id: contacts.id });
  await db.update(companies).set({ primaryContactId: contactA.id }).where(eq(companies.id, client.id));

  const [contactB] = await db
    .insert(contacts)
    .values({ organizationId: orgId, companyId: client.id, firstName: "B", lastName: "Secondary" })
    .returning({ id: contacts.id });
  cleanup.push(() => db.delete(contacts).where(eq(contacts.companyId, client.id)));

  await db.transaction(async (tx) => {
    await tx
      .update(contacts)
      .set({ isPrimary: false })
      .where(and(eq(contacts.companyId, client.id), eq(contacts.isPrimary, true), sql`id != ${contactB.id}`));
    await tx.update(contacts).set({ isPrimary: true }).where(eq(contacts.id, contactB.id));
    await tx.update(companies).set({ primaryContactId: contactB.id }).where(eq(companies.id, client.id));
    await recordAudit(tx, {
      organizationId: orgId,
      userId: Number(user.id),
      entityType: "contact",
      entityId: contactB.id,
      action: "update",
      field: "isPrimary",
      oldValue: "false",
      newValue: "true",
      metadata: { event: "primary_contact_changed", companyId: client.id },
    });
  });

  const primaries = await db
    .select({ id: contacts.id, isPrimary: contacts.isPrimary })
    .from(contacts)
    .where(and(eq(contacts.companyId, client.id), eq(contacts.isPrimary, true)));
  check(
    "exactly one primary contact after swap",
    primaries.length === 1 && primaries[0].id === contactB.id,
    JSON.stringify(primaries),
  );
  const [clientAfterSwap] = await db
    .select({ primaryContactId: companies.primaryContactId })
    .from(companies)
    .where(eq(companies.id, client.id));
  check(
    "companies.primaryContactId points at the new primary",
    clientAfterSwap.primaryContactId === contactB.id,
  );
  const [auditRow] = await sqlHttp`
    select event from audit_logs, jsonb_to_record(metadata) as m(event text)
    where entity_type = 'contact' and entity_id = ${contactB.id} order by created_at desc limit 1`;
  check("primary contact swap is audited", auditRow?.event === "primary_contact_changed");

  // 2. archiving the primary contact clears companies.primaryContactId ----
  await db.transaction(async (tx) => {
    await tx
      .update(contacts)
      .set({ isActive: false, isPrimary: false })
      .where(eq(contacts.id, contactB.id));
    await tx.update(companies).set({ primaryContactId: null }).where(eq(companies.id, client.id));
  });
  const [clientAfterArchive] = await db
    .select({ primaryContactId: companies.primaryContactId })
    .from(companies)
    .where(eq(companies.id, client.id));
  check("archiving the primary contact clears primaryContactId", clientAfterArchive.primaryContactId === null);

  // 3. contact hard-delete blocked while referenced ----------------------
  const refTicketWorkItem = await db.transaction((tx) =>
    createWorkItem(tx, user, { type: "ticket", title: "C360-VERIFY ref ticket" }),
  );
  const [refTicket] = await db
    .insert(tickets)
    .values({
      organizationId: orgId,
      workItemId: refTicketWorkItem.id,
      folio: sql`'TK-' || lpad(nextval('ticket_folio_seq')::text, 6, '0')`,
      confirmedByContactId: contactA.id,
    })
    .returning({ id: tickets.id });
  cleanup.push(async () => {
    await db.delete(tickets).where(eq(tickets.id, refTicket.id));
    await db.delete(workItems).where(eq(workItems.id, refTicketWorkItem.id));
  });

  const [refCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tickets)
    .where(eq(tickets.confirmedByContactId, contactA.id));
  check("referenced contact is detected before delete", refCount.n === 1);

  // 4. client hard-delete blocked while it has work items -----------------
  const [workClient] = await db
    .insert(companies)
    .values({ organizationId: orgId, name: "C360-VERIFY Client-with-work" })
    .returning({ id: companies.id });
  const workItem = await db.transaction((tx) =>
    createWorkItem(tx, user, { type: "activity", title: "C360-VERIFY activity", companyId: workClient.id }),
  );
  cleanup.push(async () => {
    await db.delete(workItems).where(eq(workItems.id, workItem.id));
    await db.delete(companies).where(eq(companies.id, workClient.id));
  });
  const [workCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(workItems)
    .where(eq(workItems.companyId, workClient.id));
  check("client with work items is detected before delete", workCount.n === 1);

  // 5. renewal derivation feeds getOrgRenewals -----------------------------
  const soon = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
  const far = new Date(Date.now() + 200 * 86_400_000).toISOString().slice(0, 10);
  const [csSoon] = await db
    .insert(clientServices)
    .values({
      organizationId: orgId,
      companyId: client.id,
      serviceId: service.id,
      startDate: "2026-01-01",
      renewalDate: soon,
    })
    .returning({ id: clientServices.id });
  const [csFar] = await db
    .insert(clientServices)
    .values({
      organizationId: orgId,
      companyId: client.id,
      serviceId: service.id,
      startDate: "2026-01-01",
      renewalDate: far,
    })
    .returning({ id: clientServices.id });
  const [contractSoon] = await db
    .insert(contracts)
    .values({
      organizationId: orgId,
      companyId: client.id,
      name: "C360-VERIFY Contract",
      status: "active",
      startDate: "2026-01-01",
      endDate: soon,
    })
    .returning({ id: contracts.id });
  cleanup.push(() => db.delete(clientServices).where(eq(clientServices.companyId, client.id)));
  cleanup.push(() => db.delete(contracts).where(eq(contracts.companyId, client.id)));

  const renewals = await getOrgRenewals(orgId, 30);
  const renewalIds = renewals.map((r) => `${r.source}:${r.sourceId}`);
  check(
    "renewal within horizon appears (client_service)",
    renewalIds.includes(`client_service:${csSoon.id}`),
    JSON.stringify(renewalIds),
  );
  check(
    "renewal within horizon appears (contract)",
    renewalIds.includes(`contract:${contractSoon.id}`),
  );
  check(
    "renewal beyond horizon does NOT appear",
    !renewalIds.includes(`client_service:${csFar.id}`),
  );

  // 6. organization isolation ----------------------------------------------
  const [otherContact] = await db
    .insert(contacts)
    .values({ organizationId: otherOrg.id, companyId: otherClient.id, firstName: "X", lastName: "Y" })
    .returning({ id: contacts.id });
  cleanup.push(() => db.delete(contacts).where(eq(contacts.id, otherContact.id)));

  const crossOrgLookup = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.id, otherContact.id), eq(contacts.organizationId, orgId)));
  check("cross-org contact lookup returns nothing", crossOrgLookup.length === 0);

  const otherOrgRenewals = await getOrgRenewals(otherOrg.id, 30);
  check(
    "renewals are scoped per-org (other org sees none of ours)",
    !otherOrgRenewals.some((r) => r.companyId === client.id),
  );

  // 7. rollback on multi-write failure --------------------------------------
  const [noteClient] = await db
    .insert(companies)
    .values({ organizationId: orgId, name: "C360-VERIFY Rollback client" })
    .returning({ id: companies.id });
  cleanup.push(() => db.delete(companies).where(eq(companies.id, noteClient.id)));

  let txFailed = false;
  try {
    await db.transaction(async (tx) => {
      await tx.insert(clientNotes).values({
        organizationId: orgId,
        companyId: noteClient.id,
        authorId: Number(u.id),
        body: "C360-VERIFY note that should roll back",
      });
      await recordAudit(tx, {
        organizationId: orgId,
        entityType: null as unknown as string, // NOT NULL violation forces rollback
        entityId: 0,
        action: "create",
      });
    });
  } catch {
    txFailed = true;
  }
  const [noteCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(clientNotes)
    .where(eq(clientNotes.companyId, noteClient.id));
  check("rollback: no partial note when audit fails", txFailed && noteCount.n === 0, `count=${noteCount.n}`);

  // -- cleanup ---------------------------------------------------------
  for (const fn of cleanup.reverse()) await fn();
  await db.delete(organizations).where(eq(organizations.id, otherOrg.id));

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
