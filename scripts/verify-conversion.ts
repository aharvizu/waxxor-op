import { config } from "dotenv";
config({ path: [".env.local", ".env"] });

/**
 * Verifies the Activity → Ticket conversion against the live database:
 *   1. successful conversion keeps the SAME work_items.id (no second WorkItem);
 *   2. a unique, immutable folio is generated in the same transaction;
 *   3. completed activities convert to a ticket in "open" (Nuevo);
 *   4. activities without client are rejected;
 *   5. archived activities are rejected;
 *   6. rollback when the ticket insert fails (forced unique violation);
 *   7. rollback when the audit insert fails;
 *   8. org isolation (outsider cannot convert);
 *   9. converted activity disappears from activity queries and appears as ticket.
 * Cleans up everything it creates. Exits 1 on any violation.
 */

async function main() {
  const { neon } = await import("@neondatabase/serverless");
  const sqlHttp = neon(process.env.DATABASE_URL!);
  const { eq, sql } = await import("drizzle-orm");
  const { db } = await import("../src/db");
  const { activities, tickets, workItems } = await import("../src/db/schema");
  const { recordAudit } = await import("../src/lib/audit");
  const { createWorkItem } = await import("../src/lib/work-items");
  const { ConversionError, convertActivityToTicket } = await import(
    "../src/lib/convert-activity"
  );

  let failures = 0;
  const check = (name: string, ok: boolean, detail = "") => {
    console.log(`${name}: ${ok ? "PASS" : `FAIL ${detail}`}`);
    if (!ok) failures++;
  };

  const [org] = await sqlHttp`select id from organizations where slug = 'watson'`;
  const [u] = await sqlHttp`select id from users where organization_id = ${org.id} limit 1`;
  const user = { id: String(u.id), role: "superadmin" as const, organizationId: org.id as number };

  const [client] = await sqlHttp`insert into clients (organization_id, name) values (${org.id}, 'CONV-VERIFY Client') returning id`;

  async function makeActivity(opts: {
    title: string;
    clientId?: number | null;
    status?: string;
    archived?: boolean;
    completed?: boolean;
  }) {
    let activityId = 0;
    let workItemId = 0;
    await db.transaction(async (tx) => {
      const item = await createWorkItem(tx, user, {
        type: "activity",
        title: opts.title,
        status: (opts.status ?? "pending") as never,
        clientId: opts.clientId ?? null,
      });
      if (opts.completed) {
        await tx
          .update(workItems)
          .set({ status: "completed", completedAt: new Date() })
          .where(eq(workItems.id, item.id));
      }
      const [a] = await tx
        .insert(activities)
        .values({
          organizationId: org.id,
          workItemId: item.id,
          archivedAt: opts.archived ? new Date() : null,
        })
        .returning({ id: activities.id });
      activityId = a.id;
      workItemId = item.id;
    });
    return { activityId, workItemId };
  }

  const convertInput = (activityId: number, clientId: number | null) => ({
    activityId,
    clientId,
    category: "Networking",
    subcategory: null,
    channel: "email" as const,
    modality: "remote" as const,
    priority: "high" as const,
  });

  // 1–3: successful conversion of a COMPLETED activity
  const done = await makeActivity({
    title: "CONV-VERIFY completed",
    clientId: client.id,
    completed: true,
  });
  const result = await convertActivityToTicket(user, convertInput(done.activityId, null));
  check("same WorkItem.id preserved", result.workItemId === done.workItemId);
  check("folio generated (TK-######)", /^TK-\d{6}$/.test(result.folio), result.folio);

  const [after] = await sqlHttp`
    select w.type::text, w.status::text, w.completed_at, t.folio, t.work_item_id, a.converted_at, a.converted_ticket_id
    from work_items w
    join tickets t on t.work_item_id = w.id
    join activities a on a.work_item_id = w.id
    where w.id = ${done.workItemId}`;
  check(
    "completed activity → ticket starts new (Nuevo)",
    after.type === "ticket" && after.status === "new" && after.completed_at === null,
    JSON.stringify(after),
  );
  check(
    "activity tombstone points at the ticket",
    after.converted_at !== null && after.converted_ticket_id === result.ticketId,
  );
  const [wiCount] = await sqlHttp`
    select count(*)::int as n from work_items where title = 'CONV-VERIFY completed'`;
  check("no second WorkItem created", wiCount.n === 1);

  // audit event
  const [conv] = await sqlHttp`
    select metadata from audit_logs where entity_type = 'work_item' and entity_id = ${done.workItemId} and action = 'convert'`;
  check(
    "convert audit event with previous state",
    conv !== undefined &&
      conv.metadata.previous.status === "completed" &&
      conv.metadata.folio === result.folio,
    JSON.stringify(conv?.metadata ?? null),
  );

  // 9. disappears from activity queries, appears as ticket
  const [listed] = await sqlHttp`
    select count(*)::int as n from activities a
    join work_items w on w.id = a.work_item_id
    where w.organization_id = ${org.id} and w.type = 'activity' and a.converted_at is null and w.title = 'CONV-VERIFY completed'`;
  const [asTicket] = await sqlHttp`
    select count(*)::int as n from tickets t join work_items w on w.id = t.work_item_id
    where w.title = 'CONV-VERIFY completed' and t.organization_id = ${org.id}`;
  check("gone from activity listings, present in helpdesk", listed.n === 0 && asTicket.n === 1);

  // 4. no client → rejected
  const noClient = await makeActivity({ title: "CONV-VERIFY no client" });
  let reason = "";
  try {
    await convertActivityToTicket(user, convertInput(noClient.activityId, null));
  } catch (e) {
    reason = e instanceof ConversionError ? e.reason : String(e);
  }
  check("activity without client rejected", reason === "no_client");

  // 5. archived → rejected
  const arch = await makeActivity({
    title: "CONV-VERIFY archived",
    clientId: client.id,
    archived: true,
  });
  reason = "";
  try {
    await convertActivityToTicket(user, convertInput(arch.activityId, null));
  } catch (e) {
    reason = e instanceof ConversionError ? e.reason : String(e);
  }
  check("archived activity rejected", reason === "archived");

  // 6. rollback when ticket insert fails: pre-occupy the unique work_item_id slot
  const roll = await makeActivity({ title: "CONV-VERIFY tk-fail", clientId: client.id });
  const conflictFolio = `TK-CONFLICT-${roll.workItemId}`;
  await sqlHttp`
    insert into tickets (organization_id, work_item_id, folio)
    values (${org.id}, ${roll.workItemId}, ${conflictFolio})`;
  let failed = false;
  try {
    await convertActivityToTicket(user, convertInput(roll.activityId, null));
  } catch {
    failed = true;
  }
  const [rollState] = await sqlHttp`
    select w.type::text, a.converted_at from work_items w join activities a on a.work_item_id = w.id where w.id = ${roll.workItemId}`;
  check(
    "rollback when ticket insert fails (work item still an activity)",
    failed && rollState.type === "activity" && rollState.converted_at === null,
    JSON.stringify(rollState),
  );
  await sqlHttp`delete from tickets where work_item_id = ${roll.workItemId}`;

  // 7. rollback when audit fails (same statements, forced NOT NULL violation)
  const roll2 = await makeActivity({ title: "CONV-VERIFY audit-fail", clientId: client.id });
  failed = false;
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(workItems)
        .set({ type: "ticket", status: "open" })
        .where(eq(workItems.id, roll2.workItemId));
      await tx.insert(tickets).values({
        organizationId: org.id,
        workItemId: roll2.workItemId,
        folio: sql`'TK-' || lpad(nextval('ticket_folio_seq')::text, 6, '0')`,
      });
      await tx
        .update(activities)
        .set({ convertedAt: new Date() })
        .where(eq(activities.id, roll2.activityId));
      await recordAudit(tx, {
        organizationId: org.id,
        entityType: null as unknown as string,
        entityId: 0,
        action: "convert",
      });
    });
  } catch {
    failed = true;
  }
  const [roll2State] = await sqlHttp`
    select w.type::text, a.converted_at,
      (select count(*)::int from tickets where work_item_id = ${roll2.workItemId}) as tickets
    from work_items w join activities a on a.work_item_id = w.id where w.id = ${roll2.workItemId}`;
  check(
    "rollback when audit fails (nothing persisted)",
    failed &&
      roll2State.type === "activity" &&
      roll2State.converted_at === null &&
      roll2State.tickets === 0,
    JSON.stringify(roll2State),
  );

  // 8. org isolation
  const [otherOrg] = await sqlHttp`
    insert into organizations (name, slug) values ('Conv Verify Org', 'conv-verify')
    on conflict (slug) do update set name = excluded.name returning id`;
  const outsider = { id: "999999", role: "superadmin" as const, organizationId: otherOrg.id as number };
  reason = "";
  try {
    await convertActivityToTicket(outsider, convertInput(noClient.activityId, null));
  } catch (e) {
    reason = e instanceof ConversionError ? e.reason : String(e);
  }
  check("org isolation (outsider gets not_found)", reason === "not_found");

  // cleanup (activities first: converted_ticket_id references tickets)
  await sqlHttp`delete from audit_logs where organization_id in (${org.id}, ${otherOrg.id})`;
  await sqlHttp`delete from activities where work_item_id in (select id from work_items where title like 'CONV-VERIFY%')`;
  await sqlHttp`delete from tickets where work_item_id in (select id from work_items where title like 'CONV-VERIFY%')`;
  await sqlHttp`delete from work_items where title like 'CONV-VERIFY%'`;
  await sqlHttp`delete from clients where name = 'CONV-VERIFY Client'`;
  await sqlHttp`delete from organizations where slug = 'conv-verify'`;

  if (failures > 0) process.exit(1);
  console.log("Conversion invariants verified.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
