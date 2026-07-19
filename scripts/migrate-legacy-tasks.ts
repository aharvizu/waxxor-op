import { config } from "dotenv";
config({ path: [".env.local", ".env"] });

/**
 * One-time data migration: legacy flat `tasks` → WorkItem/Activity rows inside
 * a "General" list of their project (Projects feature, 2026-07-17).
 * - Idempotent: tasks already migrated (marked in audit metadata) are skipped.
 * - The legacy `tasks` table is left in place, frozen (dropping it is a
 *   separate destructive decision).
 * status mapping: todo→pending, in_progress→in_progress, done→completed.
 */

async function main() {
  const { and, eq, sql } = await import("drizzle-orm");
  const { db } = await import("../src/db");
  const { activities, projectLists, projects, tasks, workItems } = await import("../src/db/schema");
  const { recordAudit } = await import("../src/lib/audit");

  const allTasks = await db.select().from(tasks);
  if (allTasks.length === 0) {
    console.log("No legacy tasks to migrate.");
    process.exit(0);
  }

  const migrated = await db
    .select({ id: sql<number>`(metadata ->> 'legacyTaskId')::int` })
    .from(sql`audit_logs`)
    .where(sql`metadata ? 'legacyTaskId'`);
  const done = new Set(migrated.map((m) => m.id));

  let count = 0;
  for (const task of allTasks) {
    if (done.has(task.id)) continue;
    await db.transaction(async (tx) => {
      const [project] = await tx.select().from(projects).where(eq(projects.id, task.projectId));
      if (!project) return;
      // find or create the project's "General" list
      let [list] = await tx
        .select()
        .from(projectLists)
        .where(and(eq(projectLists.projectId, project.id), eq(projectLists.name, "General")));
      if (!list) {
        [list] = await tx
          .insert(projectLists)
          .values({
            organizationId: project.organizationId,
            projectId: project.id,
            name: "General",
            position: 0,
          })
          .returning();
      }
      const status =
        task.status === "done" ? "completed" : task.status === "in_progress" ? "in_progress" : "pending";
      const [item] = await tx
        .insert(workItems)
        .values({
          organizationId: task.organizationId,
          type: "activity",
          title: task.title,
          status,
          companyId: project.companyId,
          assigneeId: task.assigneeId,
          dueDate: task.dueDate,
          completedAt: task.status === "done" ? new Date() : null,
          createdAt: task.createdAt,
        })
        .returning({ id: workItems.id });
      const [activity] = await tx
        .insert(activities)
        .values({
          organizationId: task.organizationId,
          workItemId: item.id,
          projectId: project.id,
          projectListId: list.id,
        })
        .returning({ id: activities.id });
      await recordAudit(tx, {
        organizationId: task.organizationId,
        userId: null,
        entityType: "activity",
        entityId: activity.id,
        action: "create",
        source: "system",
        metadata: {
          legacyTaskId: task.id,
          projectId: project.id,
          projectListId: list.id,
          migratedFrom: "tasks",
        },
      });
      count++;
    });
  }
  console.log(`Migrated ${count} legacy task(s). Legacy 'tasks' table left frozen.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
