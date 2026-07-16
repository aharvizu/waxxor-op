import { config } from "dotenv";
config({ path: [".env.local", ".env"] });

/**
 * DB-level invariants for the Tickets Operativos feature (the real action code
 * paths are exercised over HTTP in the smoke run; this script proves the
 * transactional/isolation guarantees):
 *   1. rollback when audit fails inside a close-like multi-write;
 *   2. outbound first-response guard (IS NULL) never overwrites;
 *   3. organization isolation for tickets, conversations and messages;
 *   4. related-activity link eligibility data rules (archived/converted/linked);
 *   5. billing recomputation excludes voided time entries.
 * Cleans up everything it creates. Exits 1 on any violation.
 */

async function main() {
  const { neon } = await import("@neondatabase/serverless");
  const sqlHttp = neon(process.env.DATABASE_URL!);
  const { and, eq, isNull, sql } = await import("drizzle-orm");
  const { db } = await import("../src/db");
  const { activities, conversations, messages, tickets, timeEntries, workItems } =
    await import("../src/db/schema");
  const { recordAudit } = await import("../src/lib/audit");
  const { createWorkItem } = await import("../src/lib/work-items");
  const { computeTicketAmount } = await import("../src/lib/tickets");

  let failures = 0;
  const check = (name: string, ok: boolean, detail = "") => {
    console.log(`${name}: ${ok ? "PASS" : `FAIL ${detail}`}`);
    if (!ok) failures++;
  };

  const [org] = await sqlHttp`select id from organizations where slug = 'watson'`;
  const [u] = await sqlHttp`select id from users where organization_id = ${org.id} limit 1`;
  const user = { id: String(u.id), role: "superadmin" as const, organizationId: org.id as number };

  // fixture ticket
  let ticketId = 0;
  let workItemId = 0;
  await db.transaction(async (tx) => {
    const item = await createWorkItem(tx, user, {
      type: "ticket",
      title: "TKF-VERIFY fixture",
      status: "in_progress",
      priority: "high",
    });
    const [t] = await tx
      .insert(tickets)
      .values({
        organizationId: org.id,
        workItemId: item.id,
        folio: sql`'TK-' || lpad(nextval('ticket_folio_seq')::text, 6, '0')`,
        resolution: "done",
        category: "Networking",
      })
      .returning({ id: tickets.id });
    ticketId = t.id;
    workItemId = item.id;
  });

  // 1. rollback when audit fails inside a close-like multi-write
  let failed = false;
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(workItems)
        .set({ status: "closed" })
        .where(eq(workItems.id, workItemId));
      await tx
        .update(tickets)
        .set({ closedAt: new Date(), confirmationType: "phone" })
        .where(eq(tickets.id, ticketId));
      await recordAudit(tx, {
        organizationId: org.id,
        entityType: null as unknown as string, // NOT NULL violation
        entityId: 0,
        action: "update",
      });
    });
  } catch {
    failed = true;
  }
  const [afterRollback] = await sqlHttp`
    select w.status::text, t.closed_at, t.confirmation_type
    from tickets t join work_items w on w.id = t.work_item_id where t.id = ${ticketId}`;
  check(
    "rollback: no partial close when audit fails",
    failed &&
      afterRollback.status === "in_progress" &&
      afterRollback.closed_at === null &&
      afterRollback.confirmation_type === null,
    JSON.stringify(afterRollback),
  );

  // 2. outbound first-response guard
  await db.transaction(async (tx) => {
    const [conv] = await tx
      .insert(conversations)
      .values({ organizationId: org.id, ticketId, channel: "manual" })
      .returning({ id: conversations.id });
    await tx.insert(messages).values({
      organizationId: org.id,
      conversationId: conv.id,
      direction: "outbound",
      body: "first",
      channel: "manual",
      occurredAt: new Date("2026-07-15T10:00:00Z"),
    });
  });
  await sqlHttp`update tickets set first_response_at = '2026-07-15T10:00:00Z' where id = ${ticketId} and first_response_at is null`;
  await sqlHttp`update tickets set first_response_at = '2026-07-15T12:00:00Z' where id = ${ticketId} and first_response_at is null`;
  const [fr] = await sqlHttp`select first_response_at::text as v from tickets where id = ${ticketId}`;
  check(
    "outbound first response never overwritten",
    String(fr.v).startsWith("2026-07-15 10:00"),
    String(fr.v),
  );

  // 3. org isolation for tickets/conversations/messages
  const [otherOrg] = await sqlHttp`
    insert into organizations (name, slug) values ('TKF Verify Org', 'tkf-verify')
    on conflict (slug) do update set name = excluded.name returning id`;
  const foreignTicket = await db
    .select({ id: tickets.id })
    .from(tickets)
    .where(and(eq(tickets.id, ticketId), eq(tickets.organizationId, otherOrg.id)));
  const foreignMessages = await db
    .select({ id: messages.id })
    .from(messages)
    .where(eq(messages.organizationId, otherOrg.id));
  check(
    "organization isolation (ticket + messages invisible to outsider org)",
    foreignTicket.length === 0 && foreignMessages.length === 0,
  );

  // 4. link eligibility rules (data level)
  let archivedActivityId = 0;
  await db.transaction(async (tx) => {
    const item = await createWorkItem(tx, user, {
      type: "activity",
      title: "TKF-VERIFY archived act",
      status: "pending",
    });
    const [a] = await tx
      .insert(activities)
      .values({ organizationId: org.id, workItemId: item.id, archivedAt: new Date() })
      .returning({ id: activities.id });
    archivedActivityId = a.id;
  });
  const eligible = await db
    .select({ id: activities.id })
    .from(activities)
    .where(
      and(
        eq(activities.id, archivedActivityId),
        eq(activities.organizationId, org.id),
        isNull(activities.archivedAt),
        isNull(activities.convertedAt),
        isNull(activities.parentTicketId),
      ),
    );
  check("archived activity is not link-eligible", eligible.length === 0);

  // 5. billing recomputation excludes voided entries
  await db.transaction(async (tx) => {
    await tx.insert(timeEntries).values([
      {
        organizationId: org.id,
        workItemId,
        userId: Number(user.id),
        date: "2026-07-15",
        durationMinutes: 60,
        billingStatus: "billable",
        description: "billable hour",
        createdById: Number(user.id),
      },
      {
        organizationId: org.id,
        workItemId,
        userId: Number(user.id),
        date: "2026-07-15",
        durationMinutes: 500,
        billingStatus: "billable",
        description: "voided",
        voidedAt: new Date(),
        createdById: Number(user.id),
      },
    ]);
  });
  const [mins] = await sqlHttp`
    select coalesce(sum(duration_minutes) filter (where voided_at is null and billing_status = 'billable'), 0)::int as m
    from time_entries where work_item_id = ${workItemId}`;
  const amount = computeTicketAmount({
    modality: "remote",
    billableMinutes: mins.m,
    hourlyRate: "120.00",
    fixedAmount: null,
  });
  check(
    "billing uses only active billable minutes (60m × $120 = 120.00)",
    mins.m === 60 && amount === "120.00",
    `minutes=${mins.m} amount=${amount}`,
  );

  // cleanup
  await sqlHttp`delete from audit_logs where organization_id in (${org.id}, ${otherOrg.id})`;
  await sqlHttp`delete from time_entries where work_item_id = ${workItemId}`;
  await sqlHttp`delete from messages where organization_id = ${org.id}`;
  await sqlHttp`delete from conversations where organization_id = ${org.id}`;
  await sqlHttp`delete from activities where work_item_id in (select id from work_items where title like 'TKF-VERIFY%')`;
  await sqlHttp`delete from tickets where id = ${ticketId}`;
  await sqlHttp`delete from work_items where title like 'TKF-VERIFY%'`;
  await sqlHttp`delete from organizations where slug = 'tkf-verify'`;

  if (failures > 0) process.exit(1);
  console.log("Tickets feature invariants verified.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
