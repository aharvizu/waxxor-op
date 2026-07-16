import { config } from "dotenv";
config({ path: [".env.local", ".env"] });

/**
 * Verifies WorkItem–Ticket invariants against the live database:
 *   1. one-to-one: every ticket links to exactly one work_item of type "ticket",
 *      and no type-"ticket" work_item is orphaned;
 *   2. org consistency: ticket.organization_id always equals its work item's;
 *   3. transactional creation: work_item + ticket + audit commit together, and
 *      a forced audit failure rolls back BOTH rows.
 * Exits 1 on any violation. The rollback test cleans itself by rolling back;
 * the commit test deletes its rows at the end.
 */

async function main() {
  const { neon } = await import("@neondatabase/serverless");
  const sqlHttp = neon(process.env.DATABASE_URL!);
  const { eq, sql } = await import("drizzle-orm");
  const { db } = await import("../src/db");
  const { tickets, workItems } = await import("../src/db/schema");
  const { recordAudit } = await import("../src/lib/audit");

  let failures = 0;
  const check = (name: string, ok: boolean, detail = "") => {
    console.log(`${name}: ${ok ? "PASS" : `FAIL ${detail}`}`);
    if (!ok) failures++;
  };

  // 1. one-to-one relation
  const [rel] = await sqlHttp`
    select
      (select count(*)::int from tickets) as tickets,
      (select count(distinct work_item_id)::int from tickets) as distinct_links,
      (select count(*)::int from tickets t join work_items w on w.id = t.work_item_id and w.type <> 'ticket') as wrong_type,
      (select count(*)::int from work_items w where w.type = 'ticket' and not exists (select 1 from tickets t where t.work_item_id = w.id)) as orphans`;
  check(
    "one-to-one ticket↔work_item",
    rel.tickets === rel.distinct_links && rel.wrong_type === 0 && rel.orphans === 0,
    JSON.stringify(rel),
  );

  // 2. organization consistency
  const [org] = await sqlHttp`
    select count(*)::int as mismatched
    from tickets t join work_items w on w.id = t.work_item_id
    where t.organization_id <> w.organization_id`;
  check("org consistency ticket vs work_item", org.mismatched === 0);

  // 3a. transactional creation commits atomically
  const [orgRow] = await sqlHttp`select id from organizations where slug = 'watson'`;
  const [userRow] = await sqlHttp`select id from users where organization_id = ${orgRow.id} limit 1`;
  const fakeUser = {
    id: String(userRow.id),
    role: "superadmin" as const,
    organizationId: orgRow.id as number,
  };
  const { createWorkItem } = await import("../src/lib/work-items");

  let createdIds: { wi: number; t: number } | null = null;
  await db.transaction(async (tx) => {
    const item = await createWorkItem(tx, fakeUser, {
      type: "ticket",
      title: "WI-VERIFY commit case",
    });
    const [t] = await tx
      .insert(tickets)
      .values({
        organizationId: orgRow.id,
        workItemId: item.id,
        folio: sql`'TK-' || lpad(nextval('ticket_folio_seq')::text, 6, '0')`,
      })
      .returning({ id: tickets.id });
    createdIds = { wi: item.id, t: t.id };
  });
  const [committed] = await sqlHttp`
    select
      (select count(*)::int from work_items where id = ${createdIds!.wi}) as wi,
      (select count(*)::int from tickets where id = ${createdIds!.t}) as t,
      (select count(*)::int from audit_logs where entity_type = 'work_item' and entity_id = ${createdIds!.wi}) as audit`;
  check(
    "transactional creation (work_item + ticket + audit)",
    committed.wi === 1 && committed.t === 1 && committed.audit === 1,
    JSON.stringify(committed),
  );

  // 3b. audit failure rolls back BOTH work_item and ticket
  const MARKER = "WI-VERIFY rollback case";
  try {
    await db.transaction(async (tx) => {
      const item = await createWorkItem(tx, fakeUser, { type: "ticket", title: MARKER });
      await tx.insert(tickets).values({
        organizationId: orgRow.id,
        workItemId: item.id,
        folio: sql`'TK-' || lpad(nextval('ticket_folio_seq')::text, 6, '0')`,
      });
      await recordAudit(tx, {
        organizationId: orgRow.id,
        entityType: null as unknown as string, // forces NOT NULL violation
        entityId: 0,
        action: "create",
      });
    });
    check("rollback on audit failure", false, "transaction committed unexpectedly");
  } catch {
    const [leak] = await sqlHttp`
      select
        (select count(*)::int from work_items where title = ${MARKER}) as wi,
        (select count(*)::int from tickets t join work_items w on w.id = t.work_item_id where w.title = ${MARKER}) as t`;
    check("rollback on audit failure", leak.wi === 0 && leak.t === 0, JSON.stringify(leak));
  }

  // cleanup rows from 3a
  await db.transaction(async (tx) => {
    await tx.delete(tickets).where(eq(tickets.id, createdIds!.t));
    await tx.delete(workItems).where(eq(workItems.id, createdIds!.wi));
  });
  await sqlHttp`delete from audit_logs where entity_type = 'work_item' and entity_id = ${createdIds!.wi}`;

  if (failures > 0) process.exit(1);
  console.log("WorkItem invariants verified.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
