import { RECURRENCE_BATCH_LIMIT } from "@/lib/recurrence";
import { runDueRecurrences } from "@/lib/recurrence-engine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Scheduler entry point for the Recurrences engine. Invoked by Vercel Cron
 * (see vercel.json) or any external scheduler hitting this URL with the
 * shared secret. See docs/architecture/background-jobs.md for setup.
 *
 * Auth: `CRON_SECRET` env var, checked against `Authorization: Bearer <secret>`
 * (the header Vercel Cron sends automatically) — no public execution.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron/recurrences] CRON_SECRET is not configured — refusing to run.");
    return Response.json({ error: "not_configured" }, { status: 503 });
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  console.log("[cron/recurrences] run started");
  try {
    const result = await runDueRecurrences(RECURRENCE_BATCH_LIMIT);
    const durationMs = Date.now() - startedAt;
    console.log(
      `[cron/recurrences] run finished in ${durationMs}ms — processed=${result.processed} succeeded=${result.succeeded} failed=${result.failed} duplicatePrevented=${result.duplicatePrevented}`,
    );
    // Only counts and non-sensitive identifiers leave this endpoint — never
    // raw error messages (those stay in recurrence_executions.error_message,
    // visible only to authenticated internal users in the app).
    return Response.json({
      ok: true,
      durationMs,
      processed: result.processed,
      succeeded: result.succeeded,
      failed: result.failed,
      duplicatePrevented: result.duplicatePrevented,
    });
  } catch (err) {
    console.error("[cron/recurrences] run crashed", err);
    return Response.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
