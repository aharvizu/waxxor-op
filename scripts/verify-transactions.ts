import { config } from "dotenv";
config({ path: [".env.local", ".env"] });

/**
 * Proves that a business write and its audit trail are atomic:
 *   A) if the audit insert fails, the client write is rolled back;
 *   B) if the client write fails, the audit insert is rolled back.
 * Uses NOT NULL violations to force each failure. Leaves no rows behind
 * (rollback is the cleanup). Exits 1 if either guarantee does not hold.
 *
 * App modules are imported dynamically so dotenv runs before the db Pool
 * captures DATABASE_URL (static imports are hoisted above config()).
 */

const MARKER = "TX-VERIFY-DO-NOT-KEEP";

async function main() {
  const { eq, sql } = await import("drizzle-orm");
  const { db } = await import("../src/db");
  const { auditLogs, companies, organizations } = await import("../src/db/schema");
  const { recordAudit } = await import("../src/lib/audit");

  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, "watson"));
  if (!org) throw new Error("Default organization (slug: watson) not found");

  async function countWhere(
    table: typeof companies | typeof auditLogs,
    where: ReturnType<typeof eq>,
  ) {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(table)
      .where(where);
    return row.n;
  }

  let failures = 0;

  // A) audit fails → client creation must roll back
  try {
    await db.transaction(async (tx) => {
      await tx
        .insert(companies)
        .values({ name: MARKER, organizationId: org.id })
        .returning({ id: companies.id });
      await recordAudit(tx, {
        organizationId: org.id,
        entityType: null as unknown as string, // forces NOT NULL violation
        entityId: 0,
        action: "create",
      });
    });
    console.error("A: transaction unexpectedly committed");
    failures++;
  } catch {
    const leaked = await countWhere(companies, eq(companies.name, MARKER));
    if (leaked === 0) {
      console.log("A PASS — audit insert failed and the client write was rolled back");
    } else {
      console.error(`A FAIL — ${leaked} client row(s) survived the rollback`);
      failures++;
    }
  }

  // B) client write fails → audit insert must roll back
  const sentinelEntityId = 987654321;
  try {
    await db.transaction(async (tx) => {
      await recordAudit(tx, {
        organizationId: org.id,
        entityType: "client",
        entityId: sentinelEntityId,
        action: "update",
        field: "name",
        oldValue: "before",
        newValue: "after",
      });
      // forces NOT NULL violation on companies.name
      await tx
        .insert(companies)
        .values({ name: null as unknown as string, organizationId: org.id });
    });
    console.error("B: transaction unexpectedly committed");
    failures++;
  } catch {
    const leaked = await countWhere(auditLogs, eq(auditLogs.entityId, sentinelEntityId));
    if (leaked === 0) {
      console.log("B PASS — client write failed and the audit insert was rolled back");
    } else {
      console.error(`B FAIL — ${leaked} audit row(s) survived the rollback`);
      failures++;
    }
  }

  if (failures > 0) process.exit(1);
  console.log("Transactions verified: business write and audit log are atomic.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
