import { config } from "dotenv";
config({ path: [".env.local", ".env"] });

/**
 * DB-level invariants for the Settings feature (UI flows are exercised over
 * HTTP in the smoke run — see docs/features/settings.md):
 *   1. Settings upsert: one row per (org, key), update replaces the value;
 *   2. Invalid stored settings fall back to defaults on read (getSetting);
 *   3. Catalog uniqueness: same name in the same kind/parent is rejected;
 *   4. Subcategory names may repeat under different parents;
 *   5. Organization isolation: another org's settings/catalogs are invisible;
 *   6. API key: only the SHA-256 hash is stored, plaintext round-trips to it;
 *   7. User deactivation blocks nothing historical and open work reassigns
 *      transactionally (work item moved, closed item untouched);
 *   8. Invitation: token grants exactly one activation (cleared with password);
 *   9. Rollback: audit failure inside a settings transaction leaves no row;
 *  10. Engine reads the configured failure limit (org with limit 1 pauses
 *      after a single failure).
 * Cleans up everything it creates. Exits 1 on any violation.
 */

async function main() {
  const { and, eq, sql } = await import("drizzle-orm");
  const { db } = await import("../src/db");
  const {
    apiKeys,
    auditLogs,
    catalogItems,
    companies,
    organizationSettings,
    organizations,
    recurrenceDefinitions,
    recurrenceExecutions,
    users,
    workItems,
  } = await import("../src/db/schema");
  const { recordAudit } = await import("../src/lib/audit");
  const { generateApiKey, hashApiKey, generateInvitationToken } = await import(
    "../src/lib/settings"
  );
  const { getSetting, getCatalog } = await import("../src/lib/settings-data");
  const { executeOccurrence } = await import("../src/lib/recurrence-engine");

  let failures = 0;
  const check = (name: string, ok: boolean, detail = "") => {
    if (!ok) failures += 1;
    console.log(`${name}: ${ok ? "PASS" : `FAIL ${detail}`}`);
  };

  const [org] = await db.select().from(organizations).where(eq(organizations.slug, "watson"));
  if (!org) throw new Error("Watson org missing");
  const [admin] = await db.select().from(users).where(eq(users.organizationId, org.id)).limit(1);
  if (!admin) throw new Error("No user in org");

  // Second org for isolation checks
  const [otherOrg] = await db
    .insert(organizations)
    .values({ name: "SET Verify Org", slug: "set-verify-org" })
    .returning();

  const cleanupIds = {
    catalogItems: [] as number[],
    settings: [] as number[],
    apiKeys: [] as number[],
    users: [] as number[],
    workItems: [] as number[],
    companies: [] as number[],
    recDefs: [] as number[],
  };

  try {
    /* 1. settings upsert */
    const write = async (value: unknown) =>
      db
        .insert(organizationSettings)
        .values({ organizationId: org.id, key: "recurrence.defaults", value, updatedById: admin.id })
        .onConflictDoUpdate({
          target: [organizationSettings.organizationId, organizationSettings.key],
          set: { value, updatedById: admin.id, updatedAt: new Date() },
        })
        .returning({ id: organizationSettings.id });
    const [first] = await write({ defaultTimezone: "America/Mexico_City", defaultTimeOfDay: "08:00", maxConsecutiveFailures: 2 });
    const [second] = await write({ defaultTimezone: "America/Mexico_City", defaultTimeOfDay: "10:30", maxConsecutiveFailures: 1 });
    cleanupIds.settings.push(first.id);
    const rows = await db
      .select()
      .from(organizationSettings)
      .where(and(eq(organizationSettings.organizationId, org.id), eq(organizationSettings.key, "recurrence.defaults")));
    check("settings upsert keeps one row per (org, key)", rows.length === 1 && first.id === second.id);
    const setting = await getSetting(org.id, "recurrence.defaults");
    check("getSetting returns the stored value", setting.defaultTimeOfDay === "10:30" && setting.maxConsecutiveFailures === 1);

    /* 2. invalid stored value falls back to defaults */
    await write({ maxConsecutiveFailures: -9, defaultTimeOfDay: "99:99" });
    const fallback = await getSetting(org.id, "recurrence.defaults");
    check(
      "invalid stored settings fall back to defaults on read",
      fallback.maxConsecutiveFailures === 3 && fallback.defaultTimeOfDay === "09:00",
    );
    await write({ defaultTimezone: "America/Mexico_City", defaultTimeOfDay: "09:00", maxConsecutiveFailures: 1 });

    /* 3-4. catalog uniqueness + repeated subnames under different parents */
    const [catA] = await db
      .insert(catalogItems)
      .values({ organizationId: org.id, kind: "ticket_category", name: "SET-Cat-A", createdById: admin.id })
      .returning();
    const [catB] = await db
      .insert(catalogItems)
      .values({ organizationId: org.id, kind: "ticket_category", name: "SET-Cat-B", createdById: admin.id })
      .returning();
    cleanupIds.catalogItems.push(catA.id, catB.id);
    let dupRejected = false;
    try {
      await db
        .insert(catalogItems)
        .values({ organizationId: org.id, kind: "ticket_category", name: "SET-Cat-A", createdById: admin.id });
    } catch {
      dupRejected = true;
    }
    check("duplicate catalog name in same kind/level rejected", dupRejected);
    const [subA] = await db
      .insert(catalogItems)
      .values({ organizationId: org.id, kind: "ticket_category", name: "SET-Otro", parentId: catA.id, createdById: admin.id })
      .returning();
    const [subB] = await db
      .insert(catalogItems)
      .values({ organizationId: org.id, kind: "ticket_category", name: "SET-Otro", parentId: catB.id, createdById: admin.id })
      .returning();
    cleanupIds.catalogItems.push(subA.id, subB.id);
    check("same subcategory name allowed under different parents", Boolean(subA.id && subB.id));

    /* 5. org isolation */
    const otherCatalog = await getCatalog(otherOrg.id, "ticket_category");
    const otherSetting = await db
      .select()
      .from(organizationSettings)
      .where(eq(organizationSettings.organizationId, otherOrg.id));
    check(
      "another org sees no catalogs/settings",
      otherCatalog.length === 0 && otherSetting.length === 0,
    );

    /* 6. api key hash-only storage */
    const generated = generateApiKey();
    const [key] = await db
      .insert(apiKeys)
      .values({
        organizationId: org.id,
        name: "SET-verify-key",
        prefix: generated.prefix,
        tokenHash: generated.tokenHash,
        createdById: admin.id,
      })
      .returning();
    cleanupIds.apiKeys.push(key.id);
    check(
      "api key stores only the hash (plaintext round-trips)",
      key.tokenHash === hashApiKey(generated.token) && !key.tokenHash.includes(generated.token.slice(-8)),
    );

    /* 7. deactivation + transactional reassignment */
    const [fromUser] = await db
      .insert(users)
      .values({
        organizationId: org.id,
        name: "SET From User",
        email: "set-from@verify.local",
        passwordHash: "x",
        role: "technician",
      })
      .returning();
    const [toUser] = await db
      .insert(users)
      .values({
        organizationId: org.id,
        name: "SET To User",
        email: "set-to@verify.local",
        passwordHash: "x",
        role: "technician",
      })
      .returning();
    cleanupIds.users.push(fromUser.id, toUser.id);
    const [openItem] = await db
      .insert(workItems)
      .values({
        organizationId: org.id,
        type: "activity",
        title: "SET open item",
        status: "pending",
        priority: "medium",
        assigneeId: fromUser.id,
        createdById: admin.id,
      })
      .returning();
    const [closedItem] = await db
      .insert(workItems)
      .values({
        organizationId: org.id,
        type: "activity",
        title: "SET closed item",
        status: "completed",
        priority: "medium",
        assigneeId: fromUser.id,
        createdById: admin.id,
      })
      .returning();
    cleanupIds.workItems.push(openItem.id, closedItem.id);
    await db.transaction(async (tx) => {
      await tx
        .update(workItems)
        .set({ assigneeId: toUser.id })
        .where(
          and(
            eq(workItems.organizationId, org.id),
            eq(workItems.assigneeId, fromUser.id),
            sql`${workItems.status} not in ('resolved','closed','completed','cancelled','archived')`,
          ),
        );
      await tx.update(users).set({ isActive: false }).where(eq(users.id, fromUser.id));
      await recordAudit(tx, {
        organizationId: org.id,
        userId: admin.id,
        entityType: "user",
        entityId: fromUser.id,
        action: "update",
        field: "isActive",
        oldValue: "true",
        newValue: "false",
        metadata: { event: "user_deactivated" },
      });
    });
    const [openAfter] = await db.select().from(workItems).where(eq(workItems.id, openItem.id));
    const [closedAfter] = await db.select().from(workItems).where(eq(workItems.id, closedItem.id));
    const [fromAfter] = await db.select().from(users).where(eq(users.id, fromUser.id));
    check(
      "deactivation reassigns open work, leaves history intact",
      openAfter.assigneeId === toUser.id && closedAfter.assigneeId === fromUser.id && fromAfter.isActive === false,
    );

    /* 8. invitation single-use */
    const token = generateInvitationToken();
    await db.update(users).set({ invitationToken: token, invitedAt: new Date() }).where(eq(users.id, toUser.id));
    const [byToken] = await db.select().from(users).where(eq(users.invitationToken, token));
    await db.update(users).set({ passwordHash: "new-hash", invitationToken: null }).where(eq(users.id, toUser.id));
    const [byTokenAfter] = await db.select().from(users).where(eq(users.invitationToken, token));
    check("invitation token resolves once and is cleared on accept", byToken?.id === toUser.id && !byTokenAfter);

    /* 9. rollback on audit failure */
    const beforeCount = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(organizationSettings)
      .where(eq(organizationSettings.organizationId, org.id));
    let rolledBack = false;
    try {
      await db.transaction(async (tx) => {
        await tx
          .insert(organizationSettings)
          .values({ organizationId: org.id, key: "reports.branding", value: { footerText: "SET rollback" }, updatedById: admin.id });
        // organizationId null violates NOT NULL -> whole tx must roll back
        await recordAudit(tx, {
          organizationId: null as unknown as number,
          userId: admin.id,
          entityType: "organization_setting",
          entityId: 0,
          action: "create",
        });
      });
    } catch {
      rolledBack = true;
    }
    const afterCount = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(organizationSettings)
      .where(eq(organizationSettings.organizationId, org.id));
    check(
      "audit failure rolls back the settings write",
      rolledBack && Number(afterCount[0].n) === Number(beforeCount[0].n),
    );

    /* 10. engine honors the configured failure limit (1) */
    const [cli] = await db
      .insert(companies)
      .values({ organizationId: org.id, name: "SET Verify Client", status: "archived" })
      .returning();
    cleanupIds.companies.push(cli.id);
    const [def] = await db
      .insert(recurrenceDefinitions)
      .values({
        organizationId: org.id,
        name: "SET verify limit",
        targetType: "activity",
        status: "active",
        isActive: true,
        frequency: "daily",
        interval: 1,
        timeOfDay: "09:00",
        timezone: "America/Mexico_City",
        startAt: "2026-01-01",
        nextRunAt: new Date("2026-01-01T15:00:00Z"),
        companyId: cli.id, // archived client -> configuration error on execution
        createdById: admin.id,
        templateData: { titleTemplate: "SET {{date}}", activityType: "general" },
      })
      .returning();
    cleanupIds.recDefs.push(def.id);
    await executeOccurrence(org.id, def.id, "2026-01-01", new Date("2026-01-01T15:00:00Z"), "manual", admin.id);
    const [defAfter] = await db
      .select()
      .from(recurrenceDefinitions)
      .where(eq(recurrenceDefinitions.id, def.id));
    check(
      "engine pauses after 1 failure when the org limit is 1",
      defAfter.status === "error" && defAfter.consecutiveFailedCount === 1 && defAfter.isActive === false,
    );
  } finally {
    /* cleanup — FK-safe order */
    for (const id of cleanupIds.recDefs) {
      await db.delete(recurrenceExecutions).where(eq(recurrenceExecutions.recurrenceDefinitionId, id));
      await db.delete(recurrenceDefinitions).where(eq(recurrenceDefinitions.id, id));
    }
    for (const id of cleanupIds.companies) await db.delete(companies).where(eq(companies.id, id));
    for (const id of cleanupIds.workItems) await db.delete(workItems).where(eq(workItems.id, id));
    for (const id of cleanupIds.users) {
      await db.delete(auditLogs).where(and(eq(auditLogs.entityType, "user"), eq(auditLogs.entityId, id)));
      await db.delete(users).where(eq(users.id, id));
    }
    for (const id of cleanupIds.apiKeys) await db.delete(apiKeys).where(eq(apiKeys.id, id));
    for (const id of cleanupIds.catalogItems.reverse()) await db.delete(catalogItems).where(eq(catalogItems.id, id));
    await db
      .delete(organizationSettings)
      .where(and(eq(organizationSettings.organizationId, org.id), eq(organizationSettings.key, "recurrence.defaults")));
    await db.delete(organizations).where(eq(organizations.id, otherOrg.id));
  }

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
