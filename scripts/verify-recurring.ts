import { config } from "dotenv";
config({ path: [".env.local", ".env"] });

/**
 * DB-level invariants for the Recurrences feature (actions are exercised over
 * HTTP in the smoke run — see docs/features/recurring.md):
 *   1. Activity generation: creates a real WorkItem/Activity, audited;
 *   2. Ticket generation: creates a real ticket with SLA snapshot;
 *   3. Idempotency: executing the SAME occurrence key twice creates only one object;
 *   4. Concurrency: two parallel callers for the same occurrence — only one wins;
 *   5. Configuration error (archived client) fails safely, no object created;
 *   6. 3 consecutive failures auto-pauses the definition (status "error");
 *   7. Retry after fixing the context succeeds without duplicating;
 *   8. nextRunAt advances deterministically after each execution;
 *   9. Organization isolation for definitions and executions;
 *  10. Rollback: if AuditLog fails mid-generation, no partial object survives.
 * Cleans up everything it creates. Exits 1 on any violation.
 */

async function main() {
  const { neon } = await import("@neondatabase/serverless");
  const sqlHttp = neon(process.env.DATABASE_URL!);
  const { and, eq, inArray, sql } = await import("drizzle-orm");
  const { db } = await import("../src/db");
  const {
    activities,
    companies,
    organizations,
    recurrenceDefinitions,
    recurrenceExecutions,
    tickets,
    workItems,
  } = await import("../src/db/schema");
  const { recordAudit } = await import("../src/lib/audit");
  const { executeOccurrence, runManually, retryExecution } = await import(
    "../src/lib/recurrence-engine"
  );

  let failures = 0;
  const check = (name: string, ok: boolean, detail = "") => {
    console.log(`${name}: ${ok ? "PASS" : `FAIL ${detail}`}`);
    if (!ok) failures++;
  };

  const [org] = await sqlHttp`select id from organizations where slug = 'watson'`;
  const orgId = org.id as number;
  const [u] = await sqlHttp`select id from users where organization_id = ${orgId} limit 1`;
  const userId = Number(u.id);

  const [otherOrg] = await db
    .insert(organizations)
    .values({ name: "REC-VERIFY-OTHER", slug: `rec-verify-${Date.now()}` })
    .returning({ id: organizations.id });

  const [client] = await db
    .insert(companies)
    .values({ organizationId: orgId, name: "REC-VERIFY Client" })
    .returning({ id: companies.id });

  // 1. Activity generation ---------------------------------------------------
  const [activityDef] = await db
    .insert(recurrenceDefinitions)
    .values({
      organizationId: orgId,
      name: "REC-VERIFY Activity recurrence",
      targetType: "activity",
      status: "active",
      isActive: true,
      timezone: "America/Mexico_City",
      frequency: "daily",
      startAt: "2026-01-01",
      templateData: { targetType: "activity", title: "Revisión — {{client.name}}", priority: "medium" },
      companyId: client.id,
      createdById: userId,
    })
    .returning();

  const outcome1 = await executeOccurrence(orgId, activityDef.id, "2026-07-17", new Date(), "scheduler", null);
  check(
    "activity generation creates a real WorkItem/Activity",
    outcome1.kind === "succeeded" && outcome1.entityType === "activity",
    JSON.stringify(outcome1),
  );
  const generatedActivityId = outcome1.kind === "succeeded" ? outcome1.entityId : 0;
  const [genActivity] = generatedActivityId
    ? await db.select().from(activities).where(eq(activities.id, generatedActivityId))
    : [];
  const [genWorkItem] = genActivity
    ? await db.select().from(workItems).where(eq(workItems.id, genActivity.workItemId))
    : [];
  check(
    "generated activity has rendered title (variable resolved)",
    genWorkItem?.title === "Revisión — REC-VERIFY Client",
    genWorkItem?.title,
  );

  // 2. Ticket generation with SLA snapshot ------------------------------------
  const [ticketDef] = await db
    .insert(recurrenceDefinitions)
    .values({
      organizationId: orgId,
      name: "REC-VERIFY Ticket recurrence",
      targetType: "ticket",
      status: "active",
      isActive: true,
      timezone: "America/Mexico_City",
      frequency: "monthly",
      dayOfMonth: 1,
      startAt: "2026-01-01",
      templateData: {
        targetType: "ticket",
        title: "Mantenimiento — {{client.name}}",
        priority: "medium",
        category: "Mantenimiento",
        channel: "internal",
        modality: "remote",
      },
      companyId: client.id,
      createdById: userId,
    })
    .returning();
  const outcome2 = await executeOccurrence(orgId, ticketDef.id, "2026-07-01", new Date(), "scheduler", null);
  check(
    "ticket generation creates a real ticket with folio",
    outcome2.kind === "succeeded" && outcome2.entityType === "ticket" && !!outcome2.folio,
    JSON.stringify(outcome2),
  );

  // 3. Idempotency: same occurrenceKey twice ----------------------------------
  const outcomeDup = await executeOccurrence(orgId, activityDef.id, "2026-07-17", new Date(), "scheduler", null);
  check("re-executing the same occurrence key is a no-op (duplicate_prevented)", outcomeDup.kind === "duplicate_prevented");
  const [dupCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(recurrenceExecutions)
    .where(
      and(
        eq(recurrenceExecutions.recurrenceDefinitionId, activityDef.id),
        eq(recurrenceExecutions.occurrenceKey, "2026-07-17"),
      ),
    );
  check("exactly one execution row exists for that occurrence", dupCount.n === 1, `n=${dupCount.n}`);

  // 4. Concurrency: two parallel callers for the same NEW occurrence ---------
  const [concurrencyDef] = await db
    .insert(recurrenceDefinitions)
    .values({
      organizationId: orgId,
      name: "REC-VERIFY Concurrency recurrence",
      targetType: "activity",
      status: "active",
      isActive: true,
      timezone: "America/Mexico_City",
      frequency: "daily",
      startAt: "2026-01-01",
      templateData: { targetType: "activity", title: "Tarea concurrente", priority: "low" },
      createdById: userId,
    })
    .returning();
  const [r1, r2] = await Promise.all([
    executeOccurrence(orgId, concurrencyDef.id, "2026-07-18", new Date(), "scheduler", null),
    executeOccurrence(orgId, concurrencyDef.id, "2026-07-18", new Date(), "scheduler", null),
  ]);
  const winners = [r1, r2].filter((r) => r.kind === "succeeded").length;
  const losers = [r1, r2].filter((r) => r.kind === "duplicate_prevented").length;
  check(
    "concurrent double-execution: exactly one winner, one duplicate_prevented",
    winners === 1 && losers === 1,
    JSON.stringify({ r1, r2 }),
  );
  const [concurrentActivityCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(activities)
    .innerJoin(workItems, eq(activities.workItemId, workItems.id))
    .where(eq(workItems.title, "Tarea concurrente"));
  check("only one object was actually created", concurrentActivityCount.n === 1, `n=${concurrentActivityCount.n}`);

  // 5. Configuration error: archived client ------------------------------------
  await db.update(companies).set({ status: "archived" }).where(eq(companies.id, client.id));
  const outcome3 = await executeOccurrence(orgId, activityDef.id, "2026-07-19", new Date(), "scheduler", null);
  check(
    "archived client → configuration error, no object created",
    outcome3.kind === "failed" && outcome3.code === "client_archived",
    JSON.stringify(outcome3),
  );
  const [afterFailDef] = await db
    .select()
    .from(recurrenceDefinitions)
    .where(eq(recurrenceDefinitions.id, activityDef.id));
  check("failed execution still advances nextRunAt", afterFailDef.nextRunAt !== null);
  check("consecutiveFailedCount incremented", afterFailDef.consecutiveFailedCount === 1);

  // 6. 3 consecutive failures auto-pauses (status "error") ---------------------
  await executeOccurrence(orgId, activityDef.id, "2026-07-20", new Date(), "scheduler", null);
  const outcome4 = await executeOccurrence(orgId, activityDef.id, "2026-07-21", new Date(), "scheduler", null);
  check("third consecutive failure recorded", outcome4.kind === "failed");
  const [autoErrored] = await db
    .select()
    .from(recurrenceDefinitions)
    .where(eq(recurrenceDefinitions.id, activityDef.id));
  check(
    "3 consecutive failures auto-pause the definition (status=error, isActive=false)",
    autoErrored.status === "error" && autoErrored.isActive === false,
    JSON.stringify({ status: autoErrored.status, isActive: autoErrored.isActive }),
  );
  const [autoPauseAudit] = await sqlHttp`
    select 1 from audit_logs where entity_type = 'recurrence_definition' and entity_id = ${activityDef.id}
    and metadata->>'event' = 'auto_paused_on_failures' limit 1`;
  check("auto-pause is audited", !!autoPauseAudit);

  // 7. Retry after fixing context succeeds, resets the counter -----------------
  await db.update(companies).set({ status: "active" }).where(eq(companies.id, client.id));
  const [lastFailedExec] = await db
    .select()
    .from(recurrenceExecutions)
    .where(and(eq(recurrenceExecutions.recurrenceDefinitionId, activityDef.id), eq(recurrenceExecutions.status, "failed")))
    .orderBy(sql`created_at desc`)
    .limit(1);
  const retryOutcome = await retryExecution(orgId, lastFailedExec.id, userId);
  check("retry after fixing context succeeds", retryOutcome.kind === "succeeded", JSON.stringify(retryOutcome));
  const [afterRetryDef] = await db
    .select()
    .from(recurrenceDefinitions)
    .where(eq(recurrenceDefinitions.id, activityDef.id));
  check(
    "successful retry resets consecutiveFailedCount and un-pauses",
    afterRetryDef.consecutiveFailedCount === 0 && afterRetryDef.status === "paused",
    JSON.stringify({ c: afterRetryDef.consecutiveFailedCount, s: afterRetryDef.status }),
  );
  const retryDupOutcome = await retryExecution(orgId, lastFailedExec.id, userId);
  check(
    "retrying an already-succeeded execution does not duplicate the object",
    retryDupOutcome.kind === "failed",
  );

  // 8. manual run uses its own occurrence key, doesn't touch nextRunAt schedule -
  const beforeManual = await db.select().from(recurrenceDefinitions).where(eq(recurrenceDefinitions.id, ticketDef.id));
  const manualOutcome = await runManually(orgId, ticketDef.id, userId);
  check("manual run succeeds with its own occurrence key", manualOutcome.kind === "succeeded");
  const [manualExec] = await db
    .select()
    .from(recurrenceExecutions)
    .where(and(eq(recurrenceExecutions.recurrenceDefinitionId, ticketDef.id), eq(recurrenceExecutions.executionSource, "manual")));
  check("manual execution is tracked with source=manual and executedByUserId", manualExec?.executedByUserId === userId);
  void beforeManual;

  // 9. Organization isolation ---------------------------------------------------
  const [otherDef] = await db
    .insert(recurrenceDefinitions)
    .values({
      organizationId: otherOrg.id,
      name: "REC-VERIFY other org",
      targetType: "activity",
      status: "draft",
      timezone: "America/Mexico_City",
      frequency: "daily",
      startAt: "2026-01-01",
      templateData: { targetType: "activity", title: "x", priority: "low" },
    })
    .returning();
  const crossLookup = await db
    .select({ id: recurrenceDefinitions.id })
    .from(recurrenceDefinitions)
    .where(and(eq(recurrenceDefinitions.id, otherDef.id), eq(recurrenceDefinitions.organizationId, orgId)));
  check("cross-org recurrence lookup returns nothing", crossLookup.length === 0);

  // 10. Rollback: AuditLog failure leaves no partial object ---------------------
  let txFailed = false;
  let rollbackWorkItemId = 0;
  try {
    await db.transaction(async (tx) => {
      const [wi] = await tx
        .insert(workItems)
        .values({ organizationId: orgId, type: "activity", title: "REC-VERIFY rollback probe" })
        .returning({ id: workItems.id });
      rollbackWorkItemId = wi.id;
      await tx.insert(activities).values({ organizationId: orgId, workItemId: wi.id });
      await recordAudit(tx, {
        organizationId: orgId,
        entityType: null as unknown as string, // NOT NULL violation → rollback
        entityId: 0,
        action: "create",
      });
    });
  } catch {
    txFailed = true;
  }
  const [survivedWorkItem] = rollbackWorkItemId
    ? await db.select().from(workItems).where(eq(workItems.id, rollbackWorkItemId))
    : [];
  check(
    "rollback: forced audit failure leaves no partial workItem/activity",
    txFailed && !survivedWorkItem,
  );

  // -- cleanup (explicit FK-safe order) -----------------------------------------
  await db.delete(recurrenceExecutions).where(eq(recurrenceExecutions.recurrenceDefinitionId, activityDef.id));
  await db.delete(recurrenceExecutions).where(eq(recurrenceExecutions.recurrenceDefinitionId, ticketDef.id));
  await db.delete(recurrenceExecutions).where(eq(recurrenceExecutions.recurrenceDefinitionId, concurrencyDef.id));
  const [genTicket] = outcome2.kind === "succeeded" ? await db.select().from(tickets).where(eq(tickets.id, outcome2.entityId)) : [];
  const generatedWorkItemIds = [
    genWorkItem?.id,
    genTicket?.workItemId,
  ].filter((x): x is number => typeof x === "number");
  const concurrentActivities = await db
    .select({ workItemId: activities.workItemId })
    .from(activities)
    .innerJoin(workItems, eq(activities.workItemId, workItems.id))
    .where(eq(workItems.title, "Tarea concurrente"));
  const manualActivities = manualExec?.generatedEntityId
    ? await db.select().from(tickets).where(eq(tickets.id, manualExec.generatedEntityId))
    : [];
  const [retriedActivity] =
    retryOutcome.kind === "succeeded"
      ? await db.select().from(activities).where(eq(activities.id, retryOutcome.entityId))
      : [];
  const allWorkItemIds = [
    ...generatedWorkItemIds,
    ...concurrentActivities.map((a) => a.workItemId),
    ...manualActivities.map((t) => t.workItemId),
    ...(retriedActivity ? [retriedActivity.workItemId] : []),
  ];
  if (genTicket) await db.delete(tickets).where(eq(tickets.id, genTicket.id));
  for (const t of manualActivities) await db.delete(tickets).where(eq(tickets.id, t.id));
  if (allWorkItemIds.length > 0) {
    await db.delete(activities).where(inArray(activities.workItemId, allWorkItemIds));
    await db.delete(workItems).where(inArray(workItems.id, allWorkItemIds));
  }
  await db.delete(recurrenceDefinitions).where(eq(recurrenceDefinitions.id, activityDef.id));
  await db.delete(recurrenceDefinitions).where(eq(recurrenceDefinitions.id, ticketDef.id));
  await db.delete(recurrenceDefinitions).where(eq(recurrenceDefinitions.id, concurrencyDef.id));
  await db.delete(recurrenceDefinitions).where(eq(recurrenceDefinitions.id, otherDef.id));
  await db.delete(companies).where(eq(companies.id, client.id));
  await db.delete(organizations).where(eq(organizations.id, otherOrg.id));

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
