import { config } from "dotenv";
config({ path: [".env.local", ".env"] });

/**
 * Verifies the organization migration invariants against the live database:
 *   1. the default organization (slug: watson) exists and is active;
 *   2. every business table has zero rows without organization_id
 *      (NOT NULL enforces it — this double-checks the backfill and prints counts).
 * Exits 1 on any violation.
 */

const BUSINESS_TABLES = [
  "users",
  "companies",
  "tickets",
  "work_items",
  "projects",
  "tasks",
  "quotes",
  "report_templates",
  "reports",
  "kpis",
  "audit_logs",
];

async function main() {
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(process.env.DATABASE_URL!);

  let failures = 0;

  const orgs = await sql`select id, name, slug, status::text from organizations where slug = 'watson'`;
  if (orgs.length === 1 && orgs[0].status === "active") {
    console.log(`org PASS — default organization "${orgs[0].name}" (id ${orgs[0].id}, active)`);
  } else {
    console.error("org FAIL — default organization (slug: watson) missing or inactive");
    failures++;
  }

  for (const table of BUSINESS_TABLES) {
    const [row] = await sql.query(
      `select count(*)::int as total, count(organization_id)::int as with_org from ${table}`,
      [],
    );
    const ok = row.total === row.with_org;
    console.log(
      `${table.padEnd(18)} total: ${String(row.total).padStart(4)}  with org: ${String(row.with_org).padStart(4)}  ${ok ? "PASS" : "FAIL"}`,
    );
    if (!ok) failures++;
  }

  if (failures > 0) process.exit(1);
  console.log("Organization invariants verified.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
