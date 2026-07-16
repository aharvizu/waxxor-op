import { config } from "dotenv";
config({ path: [".env.local", ".env"] });

/** Ad-hoc query runner for verification: npx tsx scripts/q.ts "select ..." */
async function main() {
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql.query(process.argv[2], []);
  console.log(JSON.stringify(rows));
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
