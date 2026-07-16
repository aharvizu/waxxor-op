import { config } from "dotenv";
config({ path: [".env.local", ".env"] });

/**
 * Verifies the Activities module invariants against the live database:
 *   1. creation with title only (no client, assignee or dates);
 *   2. complete sets completedAt / reopen clears it;
 *   3. archive sets archivedAt without deleting; restore derives the right status;
 *   4. every mutation leaves an audit trail;
 *   5. rollback: a failing audit insert rolls back work_item + activity;
 *   6. organization isolation: another org's user cannot see the activity.
 * Cleans up everything it creates. Exits 1 on any violation.
 */

async function main() {
  const { neon } = await import("@neondatabase/serverless");
  const sqlHttp = neon(process.env.DATABASE_URL!);
  const { and, eq } = await import("drizzle-orm");
  const { db } = await import("../src/db");
  const { activities, workItems } = await import("../src/db/schema");
  const { recordAudit } = await import("../src/lib/audit");
  const { createWorkItem, updateWorkItemFields, getWorkItemWithSpecialization } =
    await import("../src/lib/work-items");
  const { completedAtFor, restoredStatus } = await import("../src/lib/activities");

  let failures = 0;
  const check = (name: string, ok: boolean, detail = "") => {
    console.log(`${name}: ${ok ? "PASS" : `FAIL ${detail}`}`);
    if (!ok) failures++;
  };

  const [org] = await sqlHttp`select id from organizations where slug = 'watson'`;
  const [u] = await sqlHttp`select id from users where organization_id = ${org.id} limit 1`;
  const user = {
    id: String(u.id),
    role: "superadmin" as const,
    organizationId: org.id as number,
  };

  // 1. create with title only
  let activityId = 0;
  let workItemId = 0;
  await db.transaction(async (tx) => {
    const item = await createWorkItem(tx, user, {
      type: "activity",
      title: "ACT-VERIFY title only",
      status: "pending",
    });
    const [a] = await tx
      .insert(activities)
      .values({ organizationId: org.id, workItemId: item.id })
      .returning({ id: activities.id });
    await recordAudit(tx, {
      organizationId: org.id,
      userId: Number(user.id),
      entityType: "activity",
      entityId: a.id,
      action: "create",
      metadata: { workItemId: item.id },
    });
    activityId = a.id;
    workItemId = item.id;
  });
  const [created] = await sqlHttp`
    select w.title, w.status::text, w.client_id, w.assignee_id, w.due_date, a.activity_type::text
    from activities a join work_items w on w.id = a.work_item_id where a.id = ${activityId}`;
  check(
    "create with title only (no client/assignee/date)",
    created.title === "ACT-VERIFY title only" &&
      created.status === "pending" &&
      created.client_id === null &&
      created.assignee_id === null &&
      created.due_date === null &&
      created.activity_type === "general",
    JSON.stringify(created),
  );

  // 2. complete → completedAt set; reopen → cleared
  await db.transaction(async (tx) => {
    await updateWorkItemFields(tx, user, workItemId, {
      status: "completed",
      completedAt: completedAtFor("completed", null) as Date,
    });
  });
  const [done] = await sqlHttp`select status::text, completed_at from work_items where id = ${workItemId}`;
  check("complete sets completedAt", done.status === "completed" && done.completed_at !== null);

  await db.transaction(async (tx) => {
    await updateWorkItemFields(tx, user, workItemId, {
      status: "pending",
      completedAt: null,
    });
  });
  const [reopened] = await sqlHttp`select status::text, completed_at from work_items where id = ${workItemId}`;
  check("reopen clears completedAt", reopened.status === "pending" && reopened.completed_at === null);

  // 3. archive (no delete) and restore
  await db.transaction(async (tx) => {
    await updateWorkItemFields(tx, user, workItemId, { status: "archived" });
    await tx
      .update(activities)
      .set({ archivedAt: new Date() })
      .where(eq(activities.id, activityId));
  });
  const [archived] = await sqlHttp`
    select a.archived_at, w.status::text from activities a join work_items w on w.id = a.work_item_id where a.id = ${activityId}`;
  check("archive keeps the row and stamps archivedAt", archived.archived_at !== null && archived.status === "archived");

  await db.transaction(async (tx) => {
    await updateWorkItemFields(tx, user, workItemId, { status: restoredStatus(null) });
    await tx.update(activities).set({ archivedAt: null }).where(eq(activities.id, activityId));
  });
  const [restored] = await sqlHttp`
    select a.archived_at, w.status::text from activities a join work_items w on w.id = a.work_item_id where a.id = ${activityId}`;
  check("restore clears archivedAt and derives status", restored.archived_at === null && restored.status === "pending");

  // 4. audit trail exists for the mutations above
  const [audit] = await sqlHttp`
    select count(*)::int as n from audit_logs
    where (entity_type = 'work_item' and entity_id = ${workItemId})
       or (entity_type = 'activity' and entity_id = ${activityId})`;
  check("audit trail written for every mutation", audit.n >= 6, `events: ${audit.n}`);

  // 5. rollback when audit fails
  const MARKER = "ACT-VERIFY rollback";
  try {
    await db.transaction(async (tx) => {
      const item = await createWorkItem(tx, user, { type: "activity", title: MARKER });
      await tx
        .insert(activities)
        .values({ organizationId: org.id, workItemId: item.id });
      await recordAudit(tx, {
        organizationId: org.id,
        entityType: null as unknown as string, // NOT NULL violation
        entityId: 0,
        action: "create",
      });
    });
    check("rollback on audit failure", false, "committed unexpectedly");
  } catch {
    const [leak] = await sqlHttp`
      select
        (select count(*)::int from work_items where title = ${MARKER}) as wi,
        (select count(*)::int from activities a join work_items w on w.id = a.work_item_id where w.title = ${MARKER}) as act`;
    check("rollback on audit failure", leak.wi === 0 && leak.act === 0, JSON.stringify(leak));
  }

  // 6. org isolation: a user from another org cannot fetch the activity
  const [otherOrg] = await sqlHttp`
    insert into organizations (name, slug) values ('Act Verify Org', 'act-verify')
    on conflict (slug) do update set name = excluded.name returning id`;
  const outsider = { id: "999999", role: "superadmin" as const, organizationId: otherOrg.id as number };
  const visibleToOutsider = await getWorkItemWithSpecialization(outsider, workItemId);
  const visibleToOwner = await getWorkItemWithSpecialization(user, workItemId);
  check(
    "organization isolation",
    visibleToOutsider === null && visibleToOwner !== null && visibleToOwner.item.id === workItemId,
  );

  // cleanup
  await db.transaction(async (tx) => {
    await tx.delete(activities).where(eq(activities.id, activityId));
    await tx
      .delete(workItems)
      .where(and(eq(workItems.id, workItemId), eq(workItems.organizationId, org.id)));
  });
  await sqlHttp`delete from audit_logs where (entity_type = 'work_item' and entity_id = ${workItemId}) or (entity_type = 'activity' and entity_id = ${activityId})`;
  await sqlHttp`delete from organizations where slug = 'act-verify'`;

  if (failures > 0) process.exit(1);
  console.log("Activities invariants verified.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
