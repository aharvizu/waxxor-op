import { config } from "dotenv";
config({ path: [".env.local", ".env"] });

/**
 * Local dev entry point for the Recurrences engine — runs the exact same
 * `runDueRecurrences` the cron route calls, without needing a deployed cron
 * or the CRON_SECRET. Usage: `npx tsx scripts/run-recurrences.ts [batchLimit]`.
 */
async function main() {
  const { runDueRecurrences } = await import("../src/lib/recurrence-engine");
  const { RECURRENCE_BATCH_LIMIT } = await import("../src/lib/recurrence");
  const batchLimit = Number(process.argv[2]) || RECURRENCE_BATCH_LIMIT;

  console.log(`Running due recurrences (batch limit ${batchLimit})…`);
  const result = await runDueRecurrences(batchLimit);
  console.log(
    `processed=${result.processed} succeeded=${result.succeeded} failed=${result.failed} duplicatePrevented=${result.duplicatePrevented}`,
  );
  for (const o of result.outcomes) {
    if (o.kind === "succeeded") {
      console.log(`  ✓ [${o.definitionId}] ${o.name} → ${o.entityType} #${o.entityId}${o.folio ? ` (${o.folio})` : ""}`);
    } else if (o.kind === "failed") {
      console.log(`  ✗ [${o.definitionId}] ${o.name} → ${o.code}: ${o.message}`);
    } else if (o.kind === "duplicate_prevented") {
      console.log(`  = [${o.definitionId}] ${o.name} → already processed`);
    }
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
