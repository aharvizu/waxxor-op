import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { clients, reports } from "@/db/schema";
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Td,
  Th,
  buttonClass,
  buttonSecondaryClass,
} from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { reportStatusMeta } from "@/lib/labels";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage() {
  const rows = await db
    .select({
      id: reports.id,
      title: reports.title,
      status: reports.status,
      sentAt: reports.sentAt,
      createdAt: reports.createdAt,
      clientName: clients.name,
    })
    .from(reports)
    .leftJoin(clients, eq(reports.clientId, clients.id))
    .orderBy(desc(reports.createdAt));

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Customer-facing reports generated from your templates."
        action={
          <div className="flex gap-2">
            <Link href="/reports/templates" className={buttonSecondaryClass}>
              Templates
            </Link>
            <Link href="/reports/new" className={buttonClass}>
              New report
            </Link>
          </div>
        }
      />

      {rows.length === 0 ? (
        <EmptyState>
          No reports yet. Define a template, then generate your first report.
        </EmptyState>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <Th>Report</Th>
                <Th>Client</Th>
                <Th>Status</Th>
                <Th>Created</Th>
                <Th>Sent</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <Td>
                    <Link
                      href={`/reports/${r.id}`}
                      className="font-medium hover:text-cyan-700"
                    >
                      {r.title}
                    </Link>
                  </Td>
                  <Td className="text-slate-500">{r.clientName ?? "—"}</Td>
                  <Td>
                    <Badge tone={reportStatusMeta[r.status].tone}>
                      {reportStatusMeta[r.status].label}
                    </Badge>
                  </Td>
                  <Td className="text-slate-500">{fmtDateTime(r.createdAt)}</Td>
                  <Td className="text-slate-500">{fmtDateTime(r.sentAt)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
