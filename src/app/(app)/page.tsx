import Link from "next/link";
import { count, desc, eq, inArray, sql } from "drizzle-orm";
import {
  ArrowUpRight,
  CircleDollarSign,
  FolderKanban,
  LifeBuoy,
  Percent,
  Send,
} from "lucide-react";
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
import {
  Badge,
  Card,
  CardHeader,
  PageHeader,
  Progress,
  StatCard,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { fmtMoney } from "@/lib/format";
import { ticketPriorityMeta, ticketStatusMeta } from "@/lib/labels";

export default async function DashboardPage() {
  const [
    [openTickets],
    [totalTickets],
    [activeProjects],
    [totalProjects],
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
    db.select({ value: count() }).from(tickets),
    db.select({ value: count() }).from(projects).where(eq(projects.status, "active")),
    db.select({ value: count() }).from(projects),
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

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="A snapshot of Waxxor’s day-to-day operations."
      />

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-5">
        <Link href="/helpdesk" className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60">
          <StatCard
            icon={<LifeBuoy />}
            label="Open tickets"
            value={String(openTickets.value)}
            hint="Tickets that are open, in progress, or waiting on the customer"
            footer={`of ${totalTickets.value} total`}
          />
        </Link>
        <Link href="/projects" className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60">
          <StatCard
            icon={<FolderKanban />}
            label="Active projects"
            value={String(activeProjects.value)}
            hint="Projects currently in the active state"
            footer={`of ${totalProjects.value} total`}
          />
        </Link>
        <Link href="/quotes" className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60">
          <StatCard
            icon={<Send />}
            label="Quotes awaiting reply"
            value={String(pendingQuotes.value)}
            hint="Quotes sent to clients and awaiting a decision"
            footer="sent, no decision yet"
          />
        </Link>
        <Link href="/quotes" className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60">
          <StatCard
            icon={<CircleDollarSign />}
            label="Pipeline"
            value={fmtMoney(pipeline.value)}
            hint="Combined value of all sent quotes"
            footer={`across ${pendingQuotes.value} sent ${pendingQuotes.value === 1 ? "quote" : "quotes"}`}
          />
        </Link>
        <Link href="/quotes" className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60">
          <StatCard
            icon={<Percent />}
            label="Quote acceptance"
            value={acceptanceRate === null ? "—" : `${acceptanceRate}%`}
            hint="Accepted quotes as a share of all decided quotes"
            footer={
              decidedQuotes.value > 0
                ? `${acceptedQuotes.value} of ${decidedQuotes.value} decided`
                : "no decided quotes yet"
            }
          />
        </Link>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="overflow-hidden xl:col-span-2">
          <CardHeader
            title="Recent tickets"
            description="Latest activity across the helpdesk."
            action={
              <Link
                href="/helpdesk"
                className="inline-flex items-center gap-1 text-sm font-medium text-primary transition-colors hover:text-primary-hover"
              >
                View all <ArrowUpRight className="size-3.5" />
              </Link>
            }
          />
          {recentTickets.length === 0 ? (
            <p className="px-5 py-8 text-sm text-muted">
              No tickets yet. Create one from the Helpdesk page.
            </p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Ticket</Th>
                  <Th>Client</Th>
                  <Th>Priority</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge">
                {recentTickets.map((t) => (
                  <tr key={t.id} className="transition-colors hover:bg-subtle">
                    <Td>
                      <Link
                        href={`/helpdesk/${t.id}`}
                        className="font-medium text-fg transition-colors hover:text-primary"
                      >
                        <span className="mr-1.5 text-faint">#{t.id}</span>
                        {t.subject}
                      </Link>
                    </Td>
                    <Td className="text-muted">{t.clientName ?? "—"}</Td>
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
            </Table>
          )}
        </Card>

        <Card className="h-fit overflow-hidden">
          <CardHeader
            title="KPIs"
            description="Latest value vs. target."
            action={
              <Link
                href="/kpis"
                className="inline-flex items-center gap-1 text-sm font-medium text-primary transition-colors hover:text-primary-hover"
              >
                Manage <ArrowUpRight className="size-3.5" />
              </Link>
            }
          />
          {kpiRows.length === 0 ? (
            <p className="px-5 py-8 text-sm text-muted">
              No KPIs defined yet. Add them on the KPIs page.
            </p>
          ) : (
            <ul className="divide-y divide-edge">
              {kpiRows.map((k) => {
                const latest = k.latest === null ? null : Number(k.latest);
                const target = k.target ? Number(k.target) : null;
                const pct =
                  latest !== null && target ? (latest / target) * 100 : null;
                return (
                  <li key={k.id} className="px-5 py-3.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-sm font-medium text-fg">
                        {k.name}
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums">
                        {latest ?? "—"}
                        {k.unit ? (
                          <span className="ml-1 font-normal text-muted">{k.unit}</span>
                        ) : null}
                        {target !== null ? (
                          <span className="ml-1 font-normal text-faint">
                            / {target}
                          </span>
                        ) : null}
                      </span>
                    </div>
                    {pct !== null ? (
                      <Progress value={pct} className="mt-2.5" />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
