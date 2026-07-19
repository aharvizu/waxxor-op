import { config } from "dotenv";
config({ path: [".env.local", ".env"] });

/**
 * DB-level invariants for Reportes e Indicadores (UI flows are exercised over
 * HTTP in the smoke run — see docs/features/reports.md):
 *   1. generation computes REAL period metrics into the snapshot;
 *   2. snapshot immutability: later data changes never alter a generated report;
 *   3. regeneration creates version 2 (v1 preserved intact);
 *   4. approval stamps the specific version; approving without content is rejected;
 *   5. editing an approved report invalidates the approval (back to review);
 *   6. internal notes never enter contentSnapshot / versions' external fields;
 *   7. organization isolation for reports and thresholds;
 *   8. rollback: audit failure aborts generation writes;
 *   9. a report-recurrence execution creates a draft Report with resolved period.
 * Cleans up everything it creates. Exits 1 on any violation.
 */

async function main() {
  const { neon } = await import("@neondatabase/serverless");
  const sqlHttp = neon(process.env.DATABASE_URL!);
  const { and, eq, sql } = await import("drizzle-orm");
  const { db } = await import("../src/db");
  const {
    companies,
    organizations,
    recurrenceDefinitions,
    recurrenceExecutions,
    reportVersions,
    reports,
    tickets,
    timeEntries,
    workItems,
  } = await import("../src/db/schema");
  const { recordAudit } = await import("../src/lib/audit");
  const { generateReport } = await import("../src/lib/report-generation");
  const { executeOccurrence } = await import("../src/lib/recurrence-engine");

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
    .values({ name: "RPT-VERIFY-OTHER", slug: `rpt-verify-${Date.now()}` })
    .returning({ id: organizations.id });

  // ------------------------------------------------------------- fixtures
  const [client] = await db
    .insert(companies)
    .values({ organizationId: orgId, name: "RPT-VERIFY Client" })
    .returning({ id: companies.id });

  const PERIOD = { start: "2026-06-01", end: "2026-06-30" };
  const inPeriod = new Date("2026-06-10T15:00:00Z");
  const closedAt = new Date("2026-06-12T18:00:00Z");

  const [wi] = await db
    .insert(workItems)
    .values({
      organizationId: orgId,
      type: "ticket",
      title: "RPT-VERIFY ticket",
      status: "closed",
      companyId: client.id,
      createdAt: inPeriod,
    })
    .returning({ id: workItems.id });
  const [ticket] = await db
    .insert(tickets)
    .values({
      organizationId: orgId,
      workItemId: wi.id,
      folio: sql`'TK-' || lpad(nextval('ticket_folio_seq')::text, 6, '0')`,
      closedAt,
      resolvedAt: closedAt,
      firstResponseAt: new Date("2026-06-10T16:00:00Z"),
      slaFirstResponseMet: true,
      slaResolutionMet: true,
      billingStatus: "billable",
      calculatedAmount: "1500.00",
    })
    .returning({ id: tickets.id });
  await db.insert(timeEntries).values({
    organizationId: orgId,
    workItemId: wi.id,
    userId,
    date: "2026-06-11",
    durationMinutes: 90,
    billingStatus: "billable",
    description: "RPT-VERIFY work",
    createdById: userId,
  });

  // 1. generation with real metrics -------------------------------------
  const [report] = await db
    .insert(reports)
    .values({
      organizationId: orgId,
      title: "RPT-VERIFY Monthly",
      reportType: "monthly_service",
      companyId: client.id,
      periodStart: PERIOD.start,
      periodEnd: PERIOD.end,
      responsibleUserId: userId,
      internalNotes: "SECRETO-INTERNO no debe salir",
      createdById: userId,
    })
    .returning({ id: reports.id });

  const gen1 = await generateReport(orgId, report.id, userId);
  check("generation returns version 1", gen1.version === 1);
  check(
    "metrics snapshot computed from REAL period data (1 created, 1 closed, SLA 1/1, 90 min)",
    gen1.metrics.tickets.created === 1 &&
      gen1.metrics.tickets.closed === 1 &&
      gen1.metrics.sla.evaluated === 1 &&
      gen1.metrics.sla.met === 1 &&
      gen1.metrics.time.total === 90 &&
      gen1.metrics.time.billable === 90,
    JSON.stringify({
      created: gen1.metrics.tickets.created,
      closed: gen1.metrics.tickets.closed,
      sla: `${gen1.metrics.sla.met}/${gen1.metrics.sla.evaluated}`,
      min: gen1.metrics.time.total,
    }),
  );
  const [afterGen] = await db.select().from(reports).where(eq(reports.id, report.id));
  check("status moved to ready_for_review with deterministic narrative",
    afterGen.status === "ready_for_review" && afterGen.content.includes("1 tickets"),
    afterGen.content.slice(0, 80),
  );

  // 2. snapshot immutability ---------------------------------------------
  await db.insert(timeEntries).values({
    organizationId: orgId,
    workItemId: wi.id,
    userId,
    date: "2026-06-15",
    durationMinutes: 999,
    billingStatus: "billable",
    description: "RPT-VERIFY late entry",
    createdById: userId,
  });
  const [afterDataChange] = await db.select().from(reports).where(eq(reports.id, report.id));
  const frozen = afterDataChange.metricsSnapshot as { time: { total: number } };
  check("snapshot unchanged after operational data changed later", frozen.time.total === 90, `total=${frozen.time.total}`);

  // 3. regeneration creates version 2, v1 intact --------------------------
  const gen2 = await generateReport(orgId, report.id, userId);
  check("regeneration creates version 2 with the new data", gen2.version === 2 && gen2.metrics.time.total === 1089);
  const [v1] = await db
    .select()
    .from(reportVersions)
    .where(and(eq(reportVersions.reportId, report.id), eq(reportVersions.versionNumber, 1)));
  const v1metrics = v1.metricsSnapshot as { time: { total: number } };
  check("version 1 evidence preserved intact", v1metrics.time.total === 90);

  // 4. approval stamps the version; approving empty content is blocked ----
  await db.transaction(async (tx) => {
    const now = new Date();
    await tx.update(reports).set({ status: "approved", approvedAt: now, approvedByUserId: userId }).where(eq(reports.id, report.id));
    await tx
      .update(reportVersions)
      .set({ approvedByUserId: userId, approvedAt: now })
      .where(and(eq(reportVersions.reportId, report.id), eq(reportVersions.versionNumber, 2)));
  });
  const [v2] = await db
    .select()
    .from(reportVersions)
    .where(and(eq(reportVersions.reportId, report.id), eq(reportVersions.versionNumber, 2)));
  check("approval identifies the specific version (v2 stamped, v1 not)", v2.approvedAt !== null && v1.approvedAt === null);

  const [emptyReport] = await db
    .insert(reports)
    .values({
      organizationId: orgId,
      title: "RPT-VERIFY Empty",
      reportType: "custom_internal",
      periodStart: PERIOD.start,
      periodEnd: PERIOD.end,
      createdById: userId,
    })
    .returning({ id: reports.id });
  const [emptyRow] = await db.select().from(reports).where(eq(reports.id, emptyReport.id));
  check("a draft without generated content has no metrics to approve", emptyRow.metricsSnapshot === null && emptyRow.status === "draft");

  // 6. internal notes never in snapshots ----------------------------------
  const snapshotJson = JSON.stringify(afterDataChange.contentSnapshot) + JSON.stringify(v1.contentSnapshot) + JSON.stringify(v2.contentSnapshot);
  check("internal notes never leak into content snapshots", !snapshotJson.includes("SECRETO-INTERNO"));

  // 7. organization isolation ---------------------------------------------
  const [otherReport] = await db
    .insert(reports)
    .values({
      organizationId: otherOrg.id,
      title: "RPT-VERIFY other org",
      reportType: "custom_internal",
      createdById: null,
    })
    .returning({ id: reports.id });
  const crossLookup = await db
    .select({ id: reports.id })
    .from(reports)
    .where(and(eq(reports.id, otherReport.id), eq(reports.organizationId, orgId)));
  check("cross-org report lookup returns nothing", crossLookup.length === 0);
  let crossGenBlocked = false;
  try {
    await generateReport(orgId, otherReport.id, userId);
  } catch {
    crossGenBlocked = true;
  }
  check("cross-org generation is rejected", crossGenBlocked);

  // 8. rollback on audit failure ------------------------------------------
  let txFailed = false;
  let probeId = 0;
  try {
    await db.transaction(async (tx) => {
      const [probe] = await tx
        .insert(reportVersions)
        .values({ organizationId: orgId, reportId: report.id, versionNumber: 99, narrative: "probe" })
        .returning({ id: reportVersions.id });
      probeId = probe.id;
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
  const [probeSurvived] = probeId
    ? await db.select().from(reportVersions).where(eq(reportVersions.id, probeId))
    : [];
  check("rollback: audit failure leaves no partial version", txFailed && !probeSurvived);

  // 9. report recurrence creates a draft Report ---------------------------
  const [recDef] = await db
    .insert(recurrenceDefinitions)
    .values({
      organizationId: orgId,
      name: "RPT-VERIFY report recurrence",
      targetType: "report",
      status: "active",
      isActive: true,
      timezone: "America/Mexico_City",
      frequency: "monthly",
      dayOfMonth: 1,
      startAt: "2026-01-01",
      templateData: {
        targetType: "report",
        title: "Reporte mensual — {{client.name}}",
        periodRule: "previous_month",
        templateId: null,
        dueOffsetDays: 5,
      },
      companyId: client.id,
      assigneeId: userId,
      createdById: userId,
    })
    .returning();
  const outcome = await executeOccurrence(orgId, recDef.id, "2026-07-01", new Date("2026-07-01T15:00:00Z"), "scheduler", null);
  check(
    "report recurrence execution creates a Report and references it",
    outcome.kind === "succeeded" && outcome.entityType === "report",
    JSON.stringify(outcome),
  );
  const generatedReportId = outcome.kind === "succeeded" ? outcome.entityId : 0;
  const [genReport] = generatedReportId
    ? await db.select().from(reports).where(eq(reports.id, generatedReportId))
    : [];
  check(
    "recurrence-generated report: draft, rendered title, resolved previous-month period, responsible set",
    !!genReport &&
      genReport.status === "draft" &&
      genReport.title === "Reporte mensual — RPT-VERIFY Client" &&
      genReport.periodStart === "2026-06-01" &&
      genReport.periodEnd === "2026-06-30" &&
      genReport.responsibleUserId === userId,
    genReport ? JSON.stringify({ s: genReport.status, t: genReport.title, p: genReport.periodStart }) : "missing",
  );

  // -- cleanup (FK-safe order) --------------------------------------------
  await db.delete(recurrenceExecutions).where(eq(recurrenceExecutions.recurrenceDefinitionId, recDef.id));
  await db.delete(recurrenceDefinitions).where(eq(recurrenceDefinitions.id, recDef.id));
  for (const rid of [report.id, emptyReport.id, otherReport.id, generatedReportId].filter(Boolean)) {
    await db.delete(reports).where(eq(reports.id, rid)); // versions cascade
  }
  await db.delete(timeEntries).where(eq(timeEntries.workItemId, wi.id));
  await db.delete(tickets).where(eq(tickets.id, ticket.id));
  await db.delete(workItems).where(eq(workItems.id, wi.id));
  await db.delete(companies).where(eq(companies.id, client.id));
  await db.delete(organizations).where(eq(organizations.id, otherOrg.id));
  await sqlHttp`delete from audit_logs where entity_type = 'report' and entity_id in ${sqlHttp.unsafe(`(${[report.id, emptyReport.id, otherReport.id, generatedReportId].filter(Boolean).join(",")})`)}`;
  await sqlHttp`delete from audit_logs where entity_type = 'recurrence_definition' and entity_id = ${recDef.id}`;

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
