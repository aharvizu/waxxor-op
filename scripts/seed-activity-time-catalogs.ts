import { config } from "dotenv";
config({ path: [".env.local", ".env"] });

/**
 * One-time data migration (2026-07-28): populate the new activity_type /
 * time_entry_type catalog_items kinds with one row per current Postgres enum
 * value, per organization. Existing activities.activity_type /
 * time_entries.time_type rows already hold these exact string values (the
 * column just changed from enum to text — no row backfill needed, unlike the
 * ticket-catalogs migration which introduced new FK columns). Idempotent:
 * orgs that already have rows for a kind are skipped.
 */

const ACTIVITY_TYPES: { name: string; color: string }[] = [
  { name: "general", color: "#64748b" },
  { name: "follow_up", color: "#3b82f6" },
  { name: "meeting", color: "#8b5cf6" },
  { name: "research", color: "#3b82f6" },
  { name: "documentation", color: "#64748b" },
  { name: "training", color: "#10b981" },
  { name: "review", color: "#f59e0b" },
  { name: "implementation", color: "#a855f7" },
  { name: "preventive", color: "#10b981" },
  { name: "administrative", color: "#64748b" },
  { name: "commercial", color: "#f59e0b" },
  { name: "reminder", color: "#ef4444" },
];

const TIME_ENTRY_TYPES: { name: string; color: string }[] = [
  { name: "technical_work", color: "#3b82f6" },
  { name: "remote_support", color: "#10b981" },
  { name: "onsite_support", color: "#8b5cf6" },
  { name: "travel", color: "#64748b" },
  { name: "waiting_customer", color: "#f59e0b" },
  { name: "waiting_provider", color: "#f59e0b" },
  { name: "research", color: "#3b82f6" },
  { name: "documentation", color: "#64748b" },
  { name: "meeting", color: "#8b5cf6" },
  { name: "training", color: "#10b981" },
  { name: "administration", color: "#64748b" },
  { name: "commercial", color: "#f59e0b" },
];

async function main() {
  const { and, eq } = await import("drizzle-orm");
  const { db } = await import("../src/db");
  const { organizations, catalogItems } = await import("../src/db/schema");

  const kinds: { kind: "activity_type" | "time_entry_type"; values: { name: string; color: string }[] }[] = [
    { kind: "activity_type", values: ACTIVITY_TYPES },
    { kind: "time_entry_type", values: TIME_ENTRY_TYPES },
  ];

  const orgs = await db.select().from(organizations);
  for (const org of orgs) {
    for (const { kind, values } of kinds) {
      const [existing] = await db
        .select({ id: catalogItems.id })
        .from(catalogItems)
        .where(and(eq(catalogItems.organizationId, org.id), eq(catalogItems.kind, kind)));
      if (existing) {
        console.log(`Org ${org.id} (${org.name}) — ${kind}: already seeded, skipping.`);
        continue;
      }
      await db.insert(catalogItems).values(
        values.map((v, i) => ({
          organizationId: org.id,
          kind,
          name: v.name,
          color: v.color,
          sortOrder: i,
          isActive: true,
        })),
      );
      console.log(`Org ${org.id} (${org.name}) — ${kind}: seeded ${values.length} rows.`);
    }
  }
  console.log(`\nDone — ${orgs.length} organization(s) processed.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
