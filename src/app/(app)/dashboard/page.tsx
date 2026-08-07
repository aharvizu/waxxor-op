import Link from "next/link";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import {
  ArrowUpRight,
  CircleDollarSign,
  ClipboardCheck,
  FolderKanban,
  LifeBuoy,
  Percent,
  Send,
} from "lucide-react";
import { db } from "@/db";
import {
  activities,
  companies,
  kpiEntries,
  kpis,
  projects,
  quoteItems,
  quotes,
  tickets,
  workItems,
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
import { requireUser } from "@/lib/session";
import { activityStatusMeta, activityTypeMeta, ticketPriorityMeta, ticketStatusMeta } from "@/lib/labels";

/** Same "open" set as Client 360's openActivities (company360-data.ts) — not done, not cancelled, not archived. */
const OPEN_ACTIVITY_STATUSES = ["pending", "in_progress", "waiting", "blocked"] as const;

export default async function DashboardPage() {
  const user = await requireUser();
  const orgId = user.organizationId;
  const [
    [openTickets],
    [totalTickets],
    [openActivities],
    [totalActivities],
    [activeProjects],
    [totalProjects],
    [pendingQuotes],
    [acceptedQuotes],
    [decidedQuotes],
    [pipeline],
    recentTickets,
    recentActivities,
    kpiRows,
  ] = await Promise.all([
    db
      .select({ value: count() })
      .from(workItems)
      .where(
        and(
          eq(workItems.organizationId, orgId),
          eq(workItems.type, "ticket"),
          inArray(workItems.status, ["new", "assigned", "in_progress", "waiting_customer", "waiting_third_party", "scheduled", "reopened"]),
        ),
      ),
    db
      .select({ value: count() })
      .from(workItems)
      .where(and(eq(workItems.organizationId, orgId), eq(workItems.type, "ticket"))),
    db
      .select({ value: count() })
      .from(workItems)
      .where(
        and(
          eq(workItems.organizationId, orgId),
          eq(workItems.type, "activity"),
          inArray(workItems.status, OPEN_ACTIVITY_STATUSES),
        ),
      ),
    db
      .select({ value: count() })
      .from(workItems)
      .where(and(eq(workItems.organizationId, orgId), eq(workItems.type, "activity"))),
    db
      .select({ value: count() })
      .from(projects)
      .where(and(eq(projects.organizationId, orgId), eq(projects.status, "active"))),
    db.select({ value: count() }).from(projects).where(eq(projects.organizationId, orgId)),
    db
      .select({ value: count() })
      .from(quotes)
      .where(and(eq(quotes.organizationId, orgId), eq(quotes.status, "sent"))),
    db
      .select({ value: count() })
      .from(quotes)
      .where(and(eq(quotes.organizationId, orgId), eq(quotes.status, "accepted"))),
    db
      .select({ value: count() })
      .from(quotes)
      .where(
        and(
          eq(quotes.organizationId, orgId),
          inArray(quotes.status, ["accepted", "rejected", "expired"]),
        ),
      ),
    db
      .select({
        value: sql<string>`coalesce(sum(${quoteItems.quantity} * ${quoteItems.unitPrice}), 0)`,
      })
      .from(quoteItems)
      .innerJoin(quotes, eq(quoteItems.quoteId, quotes.id))
      .where(and(eq(quotes.organizationId, orgId), eq(quotes.status, "sent"))),
    db
      .select({
        id: tickets.id,
        subject: workItems.title,
        status: workItems.status,
        priority: workItems.priority,
        companyName: companies.name,
        createdAt: workItems.createdAt,
      })
      .from(tickets)
      .innerJoin(workItems, eq(tickets.workItemId, workItems.id))
      .leftJoin(companies, eq(workItems.companyId, companies.id))
      .where(eq(tickets.organizationId, orgId))
      .orderBy(desc(workItems.createdAt))
      .limit(6),
    db
      .select({
        id: activities.id,
        subject: workItems.title,
        status: workItems.status,
        activityType: activities.activityType,
        companyName: companies.name,
        createdAt: workItems.createdAt,
      })
      .from(activities)
      .innerJoin(workItems, eq(activities.workItemId, workItems.id))
      .leftJoin(companies, eq(workItems.companyId, companies.id))
      .where(eq(activities.organizationId, orgId))
      .orderBy(desc(workItems.createdAt))
      .limit(6),
    db
      .select({
        id: kpis.id,
        name: kpis.name,
        unit: kpis.unit,
        target: kpis.target,
        // "kpis"."id" is hardcoded (not `${kpis.id}`) because Drizzle drops
        // the table qualifier for a single-table outer query, which then
        // resolves against kpi_entries' OWN "id" column inside this
        // subquery (a different sequence entirely) instead of correlating
        // to the outer kpi — silently returning null for every KPI.
        latest: sql<string | null>`(
          select ${kpiEntries.value} from ${kpiEntries}
          where ${kpiEntries.kpiId} = "kpis"."id"
          order by ${kpiEntries.period} desc limit 1
        )`,
      })
      .from(kpis)
      .where(eq(kpis.organizationId, orgId))
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
        subtitle="A snapshot of day-to-day operations."
      />

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-6">
        <Link href="/helpdesk" className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60">
          <StatCard
            icon={<LifeBuoy />}
            label="Open tickets"
            value={String(openTickets.value)}
            hint="Tickets that are open, in progress, or waiting on the customer"
            footer={`of ${totalTickets.value} total`}
          />
        </Link>
        <Link href="/activities" className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60">
          <StatCard
            icon={<ClipboardCheck />}
            label="Open activities"
            value={String(openActivities.value)}
            hint="Activities pending, in progress, waiting, or blocked"
            footer={`of ${totalActivities.value} total`}
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
            hint="Quotes sent to companies and awaiting a decision"
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

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden">
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
                    <Td className="text-muted">{t.companyName ?? "—"}</Td>
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

        <Card className="overflow-hidden">
          <CardHeader
            title="Recent activities"
            description="Latest activity across Activities."
            action={
              <Link
                href="/activities"
                className="inline-flex items-center gap-1 text-sm font-medium text-primary transition-colors hover:text-primary-hover"
              >
                View all <ArrowUpRight className="size-3.5" />
              </Link>
            }
          />
          {recentActivities.length === 0 ? (
            <p className="px-5 py-8 text-sm text-muted">
              No activities yet. Create one from the Activities page.
            </p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Activity</Th>
                  <Th>Client</Th>
                  <Th>Type</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge">
                {recentActivities.map((a) => (
                  <tr key={a.id} className="transition-colors hover:bg-subtle">
                    <Td>
                      <Link
                        href={`/activities/${a.id}`}
                        className="font-medium text-fg transition-colors hover:text-primary"
                      >
                        <span className="mr-1.5 text-faint">#{a.id}</span>
                        {a.subject}
                      </Link>
                    </Td>
                    <Td className="text-muted">{a.companyName ?? "—"}</Td>
                    <Td>
                      <Badge tone={activityTypeMeta[a.activityType]?.tone ?? "slate"}>
                        {activityTypeMeta[a.activityType]?.label ?? a.activityType}
                      </Badge>
                    </Td>
                    <Td>
                      <Badge tone={activityStatusMeta[a.status]?.tone ?? "slate"}>
                        {activityStatusMeta[a.status]?.label ?? a.status}
                      </Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      <Card className="mt-6 overflow-hidden">
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
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
            {kpiRows.map((k) => {
              const latest = k.latest === null ? null : Number(k.latest);
              const target = k.target ? Number(k.target) : null;
              const pct =
                latest !== null && target ? (latest / target) * 100 : null;
              return (
                <div key={k.id} className="rounded-lg border border-edge bg-canvas p-4">
                  <span className="block truncate text-sm font-medium text-fg">
                    {k.name}
                  </span>
                  <div className="mt-1 flex items-baseline gap-1.5">
                    <span className="text-lg font-semibold tabular-nums">
                      {latest ?? "—"}
                    </span>
                    {k.unit ? (
                      <span className="text-sm text-muted">{k.unit}</span>
                    ) : null}
                    {target !== null ? (
                      <span className="text-xs text-faint">
                        / {target}
                        {k.unit ? ` ${k.unit}` : ""}
                      </span>
                    ) : null}
                  </div>
                  {pct !== null ? <Progress value={pct} className="mt-2.5" /> : null}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
