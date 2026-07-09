import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { ClipboardList, LayoutTemplate, Plus } from "lucide-react";
import { db } from "@/db";
import { clients, reports } from "@/db/schema";
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  THead,
  Table,
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
          <>
            <Link href="/reports/templates" className={buttonSecondaryClass}>
              <LayoutTemplate /> Templates
            </Link>
            <Link href="/reports/new" className={buttonClass}>
              <Plus /> New report
            </Link>
          </>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={<ClipboardList />}
          title="No reports yet"
          action={
            <Link href="/reports/new" className={buttonClass}>
              <Plus /> New report
            </Link>
          }
        >
          Define a template, then generate your first client-facing report from it.
        </EmptyState>
      ) : (
        <Card className="overflow-visible">
          <Table>
            <THead>
              <tr>
                <Th>Report</Th>
                <Th>Client</Th>
                <Th>Status</Th>
                <Th>Created</Th>
                <Th>Sent</Th>
              </tr>
            </THead>
            <tbody className="divide-y divide-edge">
              {rows.map((r) => (
                <tr key={r.id} className="group transition-colors hover:bg-subtle">
                  <Td>
                    <Link
                      href={`/reports/${r.id}`}
                      className="font-medium text-fg transition-colors group-hover:text-primary"
                    >
                      {r.title}
                    </Link>
                  </Td>
                  <Td className="text-muted">{r.clientName ?? "—"}</Td>
                  <Td>
                    <Badge tone={reportStatusMeta[r.status].tone}>
                      {reportStatusMeta[r.status].label}
                    </Badge>
                  </Td>
                  <Td className="text-muted tabular-nums">{fmtDateTime(r.createdAt)}</Td>
                  <Td className="text-muted tabular-nums">{fmtDateTime(r.sentAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
