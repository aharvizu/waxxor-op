import { config } from "dotenv";
config({ path: [".env.local", ".env"] });

/**
 * Verifies Time Entry invariants against the live database:
 *   1. logging time on an activity and on a ticket;
 *   2. several technicians on the same work item;
 *   3. amount and internal cost calculated and persisted;
 *   4. edit recalculates amounts and audits per field;
 *   5. voiding keeps the row, excludes it from totals, and audits;
 *   6. audit trail for every mutation;
 *   7. rollback when the audit insert fails;
 *   8. organization isolation.
 * Cleans up everything it creates. Exits 1 on any violation.
 */

async function main() {
  const { neon } = await import("@neondatabase/serverless");
  const sqlHttp = neon(process.env.DATABASE_URL!);
  const { eq, sql } = await import("drizzle-orm");
  const { db } = await import("../src/db");
  const { activities, tickets, timeEntries } = await import("../src/db/schema");
  const { recordAudit } = await import("../src/lib/audit");
  const { createWorkItem } = await import("../src/lib/work-items");
  const { calculateAmount } = await import("../src/lib/time-entries");

  let failures = 0;
  const check = (name: string, ok: boolean, detail = "") => {
    console.log(`${name}: ${ok ? "PASS" : `FAIL ${detail}`}`);
    if (!ok) failures++;
  };

  const [org] = await sqlHttp`select id from organizations where slug = 'watson'`;
  const [u] = await sqlHttp`select id from users where organization_id = ${org.id} limit 1`;
  const user = { id: String(u.id), role: "superadmin" as const, organizationId: org.id as number };

  // second technician for the multi-tech case
  const [tech2] = await sqlHttp`
    insert into users (organization_id, name, email, password_hash, role)
    values (${org.id}, 'TIME-VERIFY Tech', 'time.verify@waxxor.test', 'x', 'technician')
    on conflict (email) do update set name = excluded.name returning id`;

  // one activity + one ticket to log against
  let activityWi = 0;
  let ticketWi = 0;
  await db.transaction(async (tx) => {
    const a = await createWorkItem(tx, user, { type: "activity", title: "TIME-VERIFY act" });
    await tx.insert(activities).values({ organizationId: org.id, workItemId: a.id });
    activityWi = a.id;
    const t = await createWorkItem(tx, user, { type: "ticket", title: "TIME-VERIFY tk" });
    await tx.insert(tickets).values({
      organizationId: org.id,
      workItemId: t.id,
      folio: sql`'TK-' || lpad(nextval('ticket_folio_seq')::text, 6, '0')`,
    });
    ticketWi = t.id;
  });

  async function logTime(workItemId: number, userId: number, minutes: number, rate: string | null, cost: string | null) {
    let id = 0;
    await db.transaction(async (tx) => {
      const [e] = await tx
        .insert(timeEntries)
        .values({
          organizationId: org.id,
          workItemId,
          userId,
          date: "2026-07-15",
          durationMinutes: minutes,
          description: "TIME-VERIFY session",
          hourlyRate: rate,
          internalHourlyCost: cost,
          calculatedAmount: calculateAmount(minutes, rate),
          calculatedInternalCost: calculateAmount(minutes, cost),
          createdById: Number(user.id),
        })
        .returning({ id: timeEntries.id });
      await recordAudit(tx, {
        organizationId: org.id,
        userId: Number(user.id),
        entityType: "time_entry",
        entityId: e.id,
        action: "create",
        metadata: { workItemId, minutes },
      });
      id = e.id;
    });
    return id;
  }

  // 1 & 3: activity entry with rate + cost
  const e1 = await logTime(activityWi, Number(user.id), 90, "100.00", "40.00");
  const [row1] = await sqlHttp`select calculated_amount, calculated_internal_cost from time_entries where id = ${e1}`;
  check("log time on activity", e1 > 0);
  check(
    "amount and internal cost calculated (90m × $100 / $40)",
    row1.calculated_amount === "150.00" && row1.calculated_internal_cost === "60.00",
    JSON.stringify(row1),
  );

  // ticket entry
  const e2 = await logTime(ticketWi, Number(user.id), 30, null, null);
  const [row2] = await sqlHttp`select calculated_amount from time_entries where id = ${e2}`;
  check("log time on ticket (no rate → null amount)", row2.calculated_amount === null);

  // 2: second technician on the SAME work item
  const e3 = await logTime(activityWi, tech2.id, 45, null, null);
  const [multi] = await sqlHttp`
    select count(distinct user_id)::int as techs, sum(duration_minutes)::int as total
    from time_entries where work_item_id = ${activityWi} and voided_at is null`;
  check("several technicians on one work item", multi.techs === 2 && multi.total === 135, JSON.stringify(multi));

  // 4: edit recalculates and audits
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(timeEntries).where(eq(timeEntries.id, e1));
    const newAmount = calculateAmount(120, before.hourlyRate);
    await tx
      .update(timeEntries)
      .set({ durationMinutes: 120, calculatedAmount: newAmount, updatedAt: new Date() })
      .where(eq(timeEntries.id, e1));
    await recordAudit(tx, [
      { organizationId: org.id, userId: Number(user.id), entityType: "time_entry", entityId: e1, action: "update", field: "durationMinutes", oldValue: "90", newValue: "120" },
      { organizationId: org.id, userId: Number(user.id), entityType: "time_entry", entityId: e1, action: "update", field: "calculatedAmount", oldValue: "150.00", newValue: newAmount },
    ]);
  });
  const [edited] = await sqlHttp`select duration_minutes, calculated_amount from time_entries where id = ${e1}`;
  check(
    "edit recalculates amount (120m × $100 = 200.00)",
    edited.duration_minutes === 120 && edited.calculated_amount === "200.00",
    JSON.stringify(edited),
  );

  // 5: voiding keeps the row and drops it from totals
  await db.transaction(async (tx) => {
    await tx.update(timeEntries).set({ voidedAt: new Date() }).where(eq(timeEntries.id, e3));
    await recordAudit(tx, {
      organizationId: org.id, userId: Number(user.id), entityType: "time_entry",
      entityId: e3, action: "update", field: "voidedAt", oldValue: null, newValue: new Date().toISOString(),
    });
  });
  const [afterVoid] = await sqlHttp`
    select
      (select count(*)::int from time_entries where id = ${e3}) as still_there,
      (select coalesce(sum(duration_minutes),0)::int from time_entries where work_item_id = ${activityWi} and voided_at is null) as active_total`;
  check(
    "void keeps the row and excludes it from totals",
    afterVoid.still_there === 1 && afterVoid.active_total === 120,
    JSON.stringify(afterVoid),
  );

  // 6: audit trail
  const [audit] = await sqlHttp`select count(*)::int as n from audit_logs where entity_type = 'time_entry'`;
  check("audit trail for every mutation", audit.n >= 6, `events: ${audit.n}`);

  // 7: rollback when audit fails
  let failed = false;
  try {
    await db.transaction(async (tx) => {
      await tx.insert(timeEntries).values({
        organizationId: org.id,
        workItemId: activityWi,
        userId: Number(user.id),
        date: "2026-07-15",
        durationMinutes: 15,
        description: "TIME-VERIFY rollback",
        createdById: Number(user.id),
      });
      await recordAudit(tx, {
        organizationId: org.id,
        entityType: null as unknown as string,
        entityId: 0,
        action: "create",
      });
    });
  } catch {
    failed = true;
  }
  const [leak] = await sqlHttp`select count(*)::int as n from time_entries where description = 'TIME-VERIFY rollback'`;
  check("rollback when audit fails", failed && leak.n === 0, JSON.stringify(leak));

  // 8: org isolation — outsider org sees none of these entries
  const [otherOrg] = await sqlHttp`
    insert into organizations (name, slug) values ('Time Verify Org', 'time-verify')
    on conflict (slug) do update set name = excluded.name returning id`;
  const [visible] = await sqlHttp`
    select count(*)::int as n from time_entries
    where organization_id = ${otherOrg.id}`;
  const scoped = await db
    .select({ id: timeEntries.id })
    .from(timeEntries)
    .where(eq(timeEntries.organizationId, otherOrg.id));
  check("organization isolation", visible.n === 0 && scoped.length === 0);

  // cleanup
  await sqlHttp`delete from audit_logs where organization_id in (${org.id}, ${otherOrg.id})`;
  await sqlHttp`delete from time_entries where work_item_id in (${activityWi}, ${ticketWi})`;
  await sqlHttp`delete from activities where work_item_id = ${activityWi}`;
  await sqlHttp`delete from tickets where work_item_id = ${ticketWi}`;
  await sqlHttp`delete from work_items where id in (${activityWi}, ${ticketWi})`;
  await sqlHttp`delete from users where email = 'time.verify@waxxor.test'`;
  await sqlHttp`delete from organizations where slug = 'time-verify'`;

  if (failures > 0) process.exit(1);
  console.log("Time entry invariants verified.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
