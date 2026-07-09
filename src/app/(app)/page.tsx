import Link from "next/link";
import { count, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  clients,
  kpiEntries,
  kpis,
  projects,
  quoteItems,
  quotes,
  tickets,
} from "@/db/schema";
import { Badge, Card, PageHeader, Td, Th } from "@/components/ui";
import { fmtMoney } from "@/lib/format";
import { ticketPriorityMeta, ticketStatusMeta } from "@/lib/labels";

export default async function DashboardPage() {
  const [
    [openTickets],
    [activeProjects],
    [pendingQuotes],
    [acceptedQuotes],
    [decidedQuotes],
    [pipeline],
    recentTickets,
    kpiRows,
  ] = await Promise.all([
    db
      .select({ value: count() })
      .from(tickets)
      .where(inArray(tickets.status, ["open", "in_progress", "waiting_on_customer"])),
    db.select({ value: count() }).from(projects).where(eq(projects.status, "active")),
    db.select({ value: count() }).from(quotes).where(eq(quotes.status, "sent")),
    db.select({ value: count() }).from(quotes).where(eq(quotes.status, "accepted")),
    db
      .select({ value: count() })
      .from(quotes)
      .where(inArray(quotes.status, ["accepted", "rejected", "expired"])),
    db
      .select({
        value: sql<string>`coalesce(sum(${quoteItems.quantity} * ${quoteItems.unitPrice}), 0)`,
      })
      .from(quoteItems)
      .innerJoin(quotes, eq(quoteItems.quoteId, quotes.id))
      .where(eq(quotes.status, "sent")),
    db
      .select({
        id: tickets.id,
        subject: tickets.subject,
        status: tickets.status,
        priority: tickets.priority,
        clientName: clients.name,
        createdAt: tickets.createdAt,
      })
      .from(tickets)
      .leftJoin(clients, eq(tickets.clientId, clients.id))
      .orderBy(desc(tickets.createdAt))
      .limit(6),
    db
      .select({
        id: kpis.id,
        name: kpis.name,
        unit: kpis.unit,
        target: kpis.target,
        latest: sql<string | null>`(
          select ${kpiEntries.value} from ${kpiEntries}
          where ${kpiEntries.kpiId} = ${kpis.id}
          order by ${kpiEntries.period} desc limit 1
        )`,
      })
      .from(kpis)
      .orderBy(kpis.name)
      .limit(8),
  ]);

  const acceptanceRate =
    decidedQuotes.value > 0
      ? Math.round((acceptedQuotes.value / decidedQuotes.value) * 100)
      : null;

  const stats = [
    { label: "Open tickets", value: String(openTickets.value), href: "/helpdesk" },
    { label: "Active projects", value: String(activeProjects.value), href: "/projects" },
    { label: "Quotes awaiting reply", value: String(pendingQuotes.value), href: "/quotes" },
    { label: "Pipeline (sent quotes)", value: fmtMoney(pipeline.value), href: "/quotes" },
    {
      label: "Quote acceptance rate",
      value: acceptanceRate === null ? "—" : `${acceptanceRate}%`,
      href: "/quotes",
    },
  ];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="A snapshot of Waxxor's day-to-day operations."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((s) => (
          <Link key={s.label} href={s.href}>
            <Card className="p-5 transition-shadow hover:shadow-md">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {s.label}
              </div>
              <div className="mt-2 text-2xl font-semibold tabular-nums">{s.value}</div>
            </Card>
          </Link>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="overflow-hidden xl:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold">Recent tickets</h2>
            <Link href="/helpdesk" className="text-sm font-medium text-purple-700 hover:underline">
              View all
            </Link>
          </div>
          {recentTickets.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">
              No tickets yet. Create one from the Helpdesk page.
            </p>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <Th>Ticket</Th>
                  <Th>Client</Th>
                  <Th>Priority</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentTickets.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <Td>
                      <Link
                        href={`/helpdesk/${t.id}`}
                        className="font-medium text-slate-900 hover:text-purple-700"
                      >
                        #{t.id} {t.subject}
                      </Link>
                    </Td>
                    <Td className="text-slate-500">{t.clientName ?? "—"}</Td>
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
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold">KPIs</h2>
            <Link href="/kpis" className="text-sm font-medium text-purple-700 hover:underline">
              Manage
            </Link>
          </div>
          {kpiRows.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">
              No KPIs defined yet. Add them on the KPIs page.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {kpiRows.map((k) => (
                <li key={k.id} className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-slate-700">{k.name}</span>
                  <span className="text-sm font-semibold tabular-nums">
                    {k.latest ?? "—"}
                    {k.unit ? ` ${k.unit}` : ""}
                    {k.target ? (
                      <span className="ml-1 font-normal text-slate-400">
                        / {k.target}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
