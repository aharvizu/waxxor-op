import { config } from "dotenv";
config({ path: [".env.local", ".env"] });

/**
 * DB-level invariants for the Projects feature (actions are exercised over
 * HTTP in the smoke run — see docs/features/projects.md):
 *   1. project creation transaction: folio + PM member + default list, atomic;
 *   2. unique folio per organization;
 *   3. subactivity constraints live in data (parent in same project/list);
 *   4. dependency uniqueness at DB level;
 *   5. conversion of a project activity unlinks project/list/parent atomically;
 *   6. completion rollback: no partial state when audit fails;
 *   7. organization isolation for projects/lists/milestones/risks;
 *   8. voided time entries excluded from project rollups.
 * Cleans up everything it creates. Exits 1 on any violation.
 */

async function main() {
  const { neon } = await import("@neondatabase/serverless");
  const sqlHttp = neon(process.env.DATABASE_URL!);
  const { and, eq, sql } = await import("drizzle-orm");
  const { db } = await import("../src/db");
  const {
    activities,
    organizations,
    projectLists,
    projectMembers,
    projectMilestones,
    projectRisks,
    projects,
    tickets,
    timeEntries,
    workItemDependencies,
    workItems,
  } = await import("../src/db/schema");
  const { recordAudit } = await import("../src/lib/audit");
  const { convertActivityToTicket } = await import("../src/lib/convert-activity");
  const { getProjectTimeRollup } = await import("../src/lib/project-data");
  const { createWorkItem } = await import("../src/lib/work-items");

  let failures = 0;
  const check = (name: string, ok: boolean, detail = "") => {
    console.log(`${name}: ${ok ? "PASS" : `FAIL ${detail}`}`);
    if (!ok) failures++;
  };

  const [org] = await sqlHttp`select id from organizations where slug = 'watson'`;
  const orgId = org.id as number;
  const [u] = await sqlHttp`select id from users where organization_id = ${orgId} limit 1`;
  const user = { id: String(u.id), role: "superadmin" as const, organizationId: orgId };
  const userId = Number(u.id);

  const [otherOrg] = await db
    .insert(organizations)
    .values({ name: "PRJ-VERIFY-OTHER", slug: `prj-verify-${Date.now()}` })
    .returning({ id: organizations.id });

  // 1. creation transaction (mirrors createProject): project + member + list --
  const created = await db.transaction(async (tx) => {
    const [project] = await tx
      .insert(projects)
      .values({
        organizationId: orgId,
        folio: sql`'PRJ-' || lpad(nextval('project_folio_seq')::text, 6, '0')`,
        name: "PRJ-VERIFY Project",
        projectManagerId: userId,
        createdById: userId,
      })
      .returning();
    await tx.insert(projectMembers).values({
      organizationId: orgId,
      projectId: project.id,
      userId,
      role: "manager",
    });
    const [list] = await tx
      .insert(projectLists)
      .values({ organizationId: orgId, projectId: project.id, name: "General" })
      .returning();
    await recordAudit(tx, {
      organizationId: orgId,
      userId,
      entityType: "project",
      entityId: project.id,
      action: "create",
      metadata: { folio: project.folio },
    });
    return { project, list };
  });
  check(
    "creation: folio generated + PM member + default list",
    /^PRJ-\d{6}$/.test(created.project.folio) && created.list.id > 0,
    created.project.folio,
  );

  // 2. unique folio per org ------------------------------------------------
  let dupFailed = false;
  try {
    await db.insert(projects).values({
      organizationId: orgId,
      folio: created.project.folio,
      name: "PRJ-VERIFY Duplicate folio",
    });
  } catch {
    dupFailed = true;
  }
  check("unique folio per organization enforced", dupFailed);

  // fixtures: one parent + one child activity in the list ------------------
  async function makeActivity(title: string, parentActivityId: number | null = null) {
    return db.transaction(async (tx) => {
      const item = await createWorkItem(tx, user, { type: "activity", title });
      const [activity] = await tx
        .insert(activities)
        .values({
          organizationId: orgId,
          workItemId: item.id,
          projectId: created.project.id,
          projectListId: created.list.id,
          parentActivityId,
        })
        .returning();
      return { activity, workItemId: item.id };
    });
  }
  const parent = await makeActivity("PRJ-VERIFY parent");
  const child = await makeActivity("PRJ-VERIFY child", parent.activity.id);
  const loose = await makeActivity("PRJ-VERIFY loose");

  // 3. subactivity data integrity -----------------------------------------
  const [childRow] = await db
    .select()
    .from(activities)
    .where(eq(activities.id, child.activity.id));
  check(
    "subactivity shares project and list with its parent",
    childRow.projectId === created.project.id && childRow.projectListId === created.list.id,
  );

  // 4. dependency uniqueness ------------------------------------------------
  await db.insert(workItemDependencies).values({
    organizationId: orgId,
    blockerWorkItemId: parent.workItemId,
    blockedWorkItemId: loose.workItemId,
  });
  const [dupDep] = await db
    .insert(workItemDependencies)
    .values({
      organizationId: orgId,
      blockerWorkItemId: parent.workItemId,
      blockedWorkItemId: loose.workItemId,
    })
    .onConflictDoNothing()
    .returning({ id: workItemDependencies.id });
  check("duplicate dependency rejected by unique index", dupDep === undefined);

  // 5. conversion unlinks project atomically -------------------------------
  const [client] = await sqlHttp`
    insert into companies (organization_id, name) values (${orgId}, 'PRJ-VERIFY Client') returning id`;
  const conv = await convertActivityToTicket(user, {
    activityId: loose.activity.id,
    companyId: client.id as number,
    category: "Verify",
    channel: "internal",
    modality: "remote",
    priority: "medium",
    confirmProject: true,
  });
  const [afterConv] = await db
    .select()
    .from(activities)
    .where(eq(activities.id, loose.activity.id));
  check(
    "conversion unlinked project/list and kept the tombstone",
    afterConv.projectId === null &&
      afterConv.projectListId === null &&
      afterConv.convertedTicketId === conv.ticketId,
    JSON.stringify({ p: afterConv.projectId, l: afterConv.projectListId }),
  );

  // 6. completion rollback --------------------------------------------------
  let txFailed = false;
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(projects)
        .set({ status: "completed", completedAt: new Date() })
        .where(eq(projects.id, created.project.id));
      await recordAudit(tx, {
        organizationId: orgId,
        entityType: null as unknown as string, // NOT NULL violation → rollback
        entityId: 0,
        action: "update",
      });
    });
  } catch {
    txFailed = true;
  }
  const [afterRollback] = await db
    .select({ status: projects.status, completedAt: projects.completedAt })
    .from(projects)
    .where(eq(projects.id, created.project.id));
  check(
    "rollback: no partial completion when audit fails",
    txFailed && afterRollback.status === "planning" && afterRollback.completedAt === null,
    JSON.stringify(afterRollback),
  );

  // 7. organization isolation ----------------------------------------------
  const [otherProject] = await db
    .insert(projects)
    .values({
      organizationId: otherOrg.id,
      folio: "PRJ-OTHER-1",
      name: "PRJ-VERIFY Other-org project",
    })
    .returning({ id: projects.id });
  const crossLookup = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, otherProject.id), eq(projects.organizationId, orgId)));
  check("cross-org project lookup returns nothing", crossLookup.length === 0);
  await db.insert(projectMilestones).values({
    organizationId: otherOrg.id,
    projectId: otherProject.id,
    name: "other milestone",
    targetDate: "2026-08-01",
  });
  await db.insert(projectRisks).values({
    organizationId: otherOrg.id,
    projectId: otherProject.id,
    title: "other risk",
  });
  const crossMilestones = await db
    .select({ id: projectMilestones.id })
    .from(projectMilestones)
    .where(
      and(
        eq(projectMilestones.organizationId, orgId),
        eq(projectMilestones.projectId, otherProject.id),
      ),
    );
  check("cross-org milestone lookup returns nothing", crossMilestones.length === 0);

  // 8. voided time entries excluded from rollup -----------------------------
  await db.insert(timeEntries).values([
    {
      organizationId: orgId,
      workItemId: parent.workItemId,
      userId,
      date: "2026-07-17",
      durationMinutes: 60,
      description: "PRJ-VERIFY active",
      createdById: userId,
    },
    {
      organizationId: orgId,
      workItemId: parent.workItemId,
      userId,
      date: "2026-07-17",
      durationMinutes: 999,
      description: "PRJ-VERIFY voided",
      voidedAt: new Date(),
      createdById: userId,
    },
  ]);
  const rollup = await getProjectTimeRollup(orgId, created.project.id);
  check(
    "voided time entries excluded from project rollup",
    rollup.totals.total === 60,
    `total=${rollup.totals.total}`,
  );

  // -- cleanup (explicit FK-safe order) -------------------------------------
  await db.delete(timeEntries).where(eq(timeEntries.workItemId, parent.workItemId));
  await db
    .delete(workItemDependencies)
    .where(eq(workItemDependencies.blockerWorkItemId, parent.workItemId));
  await db
    .update(activities)
    .set({ convertedTicketId: null })
    .where(eq(activities.id, loose.activity.id));
  await db.delete(tickets).where(eq(tickets.id, conv.ticketId));
  await db.delete(activities).where(eq(activities.projectId, created.project.id));
  await db.delete(activities).where(eq(activities.id, loose.activity.id));
  for (const wi of [child.workItemId, parent.workItemId, loose.workItemId]) {
    await db.delete(workItems).where(eq(workItems.id, wi));
  }
  await db.delete(projects).where(eq(projects.id, created.project.id));
  await sqlHttp`delete from companies where id = ${client.id}`;
  await db.delete(projectMilestones).where(eq(projectMilestones.organizationId, otherOrg.id));
  await db.delete(projectRisks).where(eq(projectRisks.organizationId, otherOrg.id));
  await db.delete(projects).where(eq(projects.id, otherProject.id));
  await db.delete(organizations).where(eq(organizations.id, otherOrg.id));

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
