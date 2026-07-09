import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { clients, tickets, users } from "@/db/schema";
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Td,
  Th,
  buttonClass,
  cx,
} from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { ticketPriorityMeta, ticketStatusMeta } from "@/lib/labels";

export const metadata: Metadata = { title: "Helpdesk" };

const filters = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In progress" },
  { key: "waiting_on_customer", label: "Waiting" },
  { key: "resolved", label: "Resolved" },
  { key: "closed", label: "Closed" },
] as const;

export default async function HelpdeskPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const active = filters.some((f) => f.key === status) ? status! : "all";

  const rows = await db
    .select({
      id: tickets.id,
      subject: tickets.subject,
      status: tickets.status,
      priority: tickets.priority,
      clientName: clients.name,
      assigneeName: users.name,
      updatedAt: tickets.updatedAt,
    })
    .from(tickets)
    .leftJoin(clients, eq(tickets.clientId, clients.id))
    .leftJoin(users, eq(tickets.assigneeId, users.id))
    .where(
      active === "all"
        ? undefined
        : eq(tickets.status, active as (typeof tickets.status.enumValues)[number]),
    )
    .orderBy(desc(tickets.updatedAt));

  return (
    <div>
      <PageHeader
        title="Helpdesk"
        subtitle="Customer support tickets and internal issues."
        action={
          <Link href="/helpdesk/new" className={buttonClass}>
            New ticket
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {filters.map((f) => (
          <Link
            key={f.key}
            href={f.key === "all" ? "/helpdesk" : `/helpdesk?status=${f.key}`}
            className={cx(
              "rounded-full px-3 py-1 text-sm font-medium",
              active === f.key
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50",
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState>No tickets match this filter.</EmptyState>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <Th>Ticket</Th>
                <Th>Client</Th>
                <Th>Assignee</Th>
                <Th>Priority</Th>
                <Th>Status</Th>
                <Th>Updated</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <Td>
                    <Link
                      href={`/helpdesk/${t.id}`}
                      className="font-medium hover:text-cyan-700"
                    >
                      #{t.id} {t.subject}
                    </Link>
                  </Td>
                  <Td className="text-slate-500">{t.clientName ?? "—"}</Td>
                  <Td className="text-slate-500">{t.assigneeName ?? "Unassigned"}</Td>
                  <Td>
                    <Badge tone={ticketPriorityMeta[t.priority].tone}>
                      {ticketPriorityMeta[t.priority].label}
                    </Badge>
                  </Td>
                  <Td>
                    <Badge tone={ticketStatusMeta[t.status].tone}>
                      {ticketStatusMeta[t.status].label}
                    </Badge>
                  </Td>
                  <Td className="text-slate-500">{fmtDateTime(t.updatedAt)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
