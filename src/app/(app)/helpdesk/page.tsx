import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { LifeBuoy, Plus } from "lucide-react";
import { db } from "@/db";
import { clients, tickets, users } from "@/db/schema";
import {
  Avatar,
  Badge,
  Card,
  EmptyState,
  PageHeader,
  THead,
  Table,
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
            <Plus /> New ticket
          </Link>
        }
      />

      <div className="mb-5 inline-flex flex-wrap items-center gap-1 rounded-lg border border-edge bg-surface p-1 shadow-card">
        {filters.map((f) => (
          <Link
            key={f.key}
            href={f.key === "all" ? "/helpdesk" : `/helpdesk?status=${f.key}`}
            aria-current={active === f.key ? "page" : undefined}
            className={cx(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150",
              active === f.key
                ? "bg-primary-soft text-primary"
                : "text-muted hover:bg-subtle hover:text-fg",
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<LifeBuoy />}
          title="No tickets here"
          action={
            <Link href="/helpdesk/new" className={buttonClass}>
              <Plus /> New ticket
            </Link>
          }
        >
          No tickets match this filter. New customer requests and internal issues
          will show up here.
        </EmptyState>
      ) : (
        <Card className="overflow-visible">
          <Table>
            <THead>
              <tr>
                <Th>Ticket</Th>
                <Th>Client</Th>
                <Th>Assignee</Th>
                <Th>Priority</Th>
                <Th>Status</Th>
                <Th>Updated</Th>
              </tr>
            </THead>
            <tbody className="divide-y divide-edge">
              {rows.map((t) => (
                <tr key={t.id} className="group transition-colors hover:bg-subtle">
                  <Td>
                    <Link
                      href={`/helpdesk/${t.id}`}
                      className="font-medium text-fg transition-colors group-hover:text-primary"
                    >
                      <span className="mr-1.5 text-faint">#{t.id}</span>
                      {t.subject}
                    </Link>
                  </Td>
                  <Td className="text-muted">{t.clientName ?? "—"}</Td>
                  <Td>
                    {t.assigneeName ? (
                      <span className="flex items-center gap-2 text-fg">
                        <Avatar name={t.assigneeName} size="xs" />
                        {t.assigneeName}
                      </span>
                    ) : (
                      <span className="text-faint">Unassigned</span>
                    )}
                  </Td>
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
                  <Td className="text-muted tabular-nums">{fmtDateTime(t.updatedAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
