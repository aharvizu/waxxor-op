import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { clients, reports } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { Badge, Card, PageHeader, inputClass, labelClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { PrintButton } from "@/components/print-button";
import { fmtDateTime } from "@/lib/format";
import { reportStatusMeta } from "@/lib/labels";
import { markReportSent, updateReport } from "../actions";

export const metadata: Metadata = { title: "Report" };

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const reportId = Number(id);
  if (!Number.isInteger(reportId)) notFound();

  const [row] = await db
    .select({ report: reports, clientName: clients.name })
    .from(reports)
    .leftJoin(clients, eq(reports.clientId, clients.id))
    .where(and(eq(reports.id, reportId), eq(reports.organizationId, user.organizationId)));
  if (!row) notFound();

  const r = row.report;

  return (
    <div className="max-w-4xl">
      <div className="print:hidden">
        <PageHeader
          title={r.title}
          subtitle={`${row.clientName ?? "No client"} · Created ${fmtDateTime(r.createdAt)}${
            r.sentAt ? ` · Sent ${fmtDateTime(r.sentAt)}` : ""
          }`}
          action={
            <div className="flex items-center gap-3">
              <Badge tone={reportStatusMeta[r.status].tone}>
                {reportStatusMeta[r.status].label}
              </Badge>
              <PrintButton />
              {r.status === "draft" ? (
                <form action={markReportSent}>
                  <input type="hidden" name="id" value={r.id} />
                  <SubmitButton>Mark as sent</SubmitButton>
                </form>
              ) : null}
            </div>
          }
        />
      </div>

      {/* Printable report document */}
      <Card className="hidden p-8 print:block print:rounded-none print:border-0 print:shadow-none">
        <div className="mb-6 flex items-center justify-between border-b border-edge-strong pb-4">
          <div>
            <div className="text-lg font-semibold">Waxxor — Information Security</div>
            <div className="text-xs text-muted">waxxor.com</div>
          </div>
          <div className="text-right text-sm text-muted">
            {row.clientName ?? ""}
          </div>
        </div>
        <h1 className="mb-4 text-2xl font-semibold">{r.title}</h1>
        <div className="whitespace-pre-wrap text-sm leading-6">{r.content}</div>
      </Card>

      <Card className="p-6 print:hidden">
        <form action={updateReport} className="space-y-4">
          <input type="hidden" name="id" value={r.id} />
          <div>
            <label htmlFor="title" className={labelClass}>
              Title
            </label>
            <input
              id="title"
              name="title"
              required
              defaultValue={r.title}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="content" className={labelClass}>
              Content
            </label>
            <textarea
              id="content"
              name="content"
              rows={24}
              defaultValue={r.content}
              className={`${inputClass} font-mono`}
            />
          </div>
          <SubmitButton>Save report</SubmitButton>
        </form>
      </Card>
    </div>
  );
}
