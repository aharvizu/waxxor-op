import { config } from "dotenv";
config({ path: [".env.local", ".env"] });

/**
 * One-time data migration (2026-07-30): merge the `activity_type` catalog
 * kind into `time_entry_type` ("Tipos de trabajo") — the app no longer reads
 * `activity_type` (every consumer was repointed at `time_entry_type`), so
 * after this runs no `catalog_items` row should carry that kind. Per org, per
 * `activity_type` row: if a `time_entry_type` row with the same name
 * (case-insensitive) already exists, drop the `activity_type` duplicate;
 * otherwise flip its `kind` to `time_entry_type` in place (keeps id/color so
 * any dangling reference stays intact) with a fresh sortOrder appended after
 * the existing time_entry_type rows. `activities.activity_type` values on
 * existing rows are untouched — they're plain strings, not FKs, and every
 * value already exists (or now exists) as a `time_entry_type` catalog name.
 * Idempotent: orgs with zero remaining `activity_type` rows are skipped.
 */

async function main() {
  const { and, eq, sql } = await import("drizzle-orm");
  const { db } = await import("../src/db");
  const { organizations, catalogItems } = await import("../src/db/schema");

  const orgs = await db.select().from(organizations);
  let orgsMigrated = 0;

  for (const org of orgs) {
    const legacyRows = await db
      .select()
      .from(catalogItems)
      .where(and(eq(catalogItems.organizationId, org.id), eq(catalogItems.kind, "activity_type")));
    if (legacyRows.length === 0) {
      console.log(`Org ${org.id} (${org.name}): no activity_type rows — skipping.`);
      continue;
    }

    await db.transaction(async (tx) => {
      const targetRows = await tx
        .select()
        .from(catalogItems)
        .where(and(eq(catalogItems.organizationId, org.id), eq(catalogItems.kind, "time_entry_type")));
      const targetNames = new Set(targetRows.map((r) => r.name.toLowerCase()));
      let nextSortOrder = targetRows.reduce((max, r) => Math.max(max, r.sortOrder), -1) + 1;

      let converted = 0;
      let droppedDuplicates = 0;
      for (const row of legacyRows) {
        if (targetNames.has(row.name.toLowerCase())) {
          await tx.delete(catalogItems).where(eq(catalogItems.id, row.id));
          droppedDuplicates++;
          continue;
        }
        await tx
          .update(catalogItems)
          .set({ kind: "time_entry_type", sortOrder: nextSortOrder, updatedAt: new Date() })
          .where(eq(catalogItems.id, row.id));
        targetNames.add(row.name.toLowerCase());
        nextSortOrder++;
        converted++;
      }
      console.log(`Org ${org.id} (${org.name}): converted ${converted} row(s), dropped ${droppedDuplicates} exact duplicate(s).`);
    });
    orgsMigrated++;
  }

  const [{ remaining }] = await db
    .select({ remaining: sql<number>`count(*)::int` })
    .from(catalogItems)
    .where(eq(catalogItems.kind, "activity_type"));

  console.log(`\nOrgs migrated this run: ${orgsMigrated}.`);
  console.log(`Verification — catalog_items rows still kind='activity_type': ${remaining}.`);

  if (remaining > 0) {
    console.error("\nVerification FAILED — activity_type rows remain.");
    process.exit(1);
  }
  console.log("\nVerification passed — activity_type fully merged into time_entry_type.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
