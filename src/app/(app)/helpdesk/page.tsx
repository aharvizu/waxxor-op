import type { Metadata } from "next";
import Link from "next/link";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  sql,
} from "drizzle-orm";
import { LifeBuoy, Plus } from "lucide-react";
import { db } from "@/db";
import { companies, slaDefinitions, tickets, timeEntries, users, workItems } from "@/db/schema";
import { requireUser } from "@/lib/session";
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
  cx,
  inputClass,
} from "@/components/ui";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { ticketBillingMeta, ticketPriorityMeta, ticketStatusMeta } from "@/lib/labels";
import { TICKET_BILLING_STATUSES, TICKET_STATUSES, type TicketStatus } from "@/lib/tickets";
import { formatMinutes } from "@/lib/time-entries";
import { TicketRowActions } from "./ticket-row-actions";

export const metadata: Metadata = { title: "Helpdesk" };

const ACTIVE_STATUSES: TicketStatus[] = [
  "new",
  "assigned",
  "in_progress",
  "waiting_customer",
  "waiting_third_party",
  "scheduled",
  "reopened",
];

const views = [
  { key: "all", label: "All" },
  { key: "new", label: "New" },
  { key: "unassigned", label: "Unassigned" },
  { key: "mine", label: "Mine" },
  { key: "in_progress", label: "In progress" },
  { key: "waiting_customer", label: "Waiting customer" },
  { key: "waiting_third_party", label: "Waiting third party" },
  { key: "due_soon", label: "Due soon" },
  { key: "overdue", label: "Overdue" },
  { key: "pending_confirmation", label: "Pending confirmation" },
  { key: "billable", label: "Billable" },
  { key: "recurrent", label: "Recurrent" },
  { key: "closed", label: "Closed" },
  { key: "reopened", label: "Reopened" },
] as const;
type ViewKey = (typeof views)[number]["key"];

type Search = {
  view?: string;
  status?: string;
  priority?: string;
  client?: string;
  assignee?: string;
  category?: string;
  sla?: string;
  billing?: string;
  from?: string;
  to?: string;
  channel?: string;
};

export default async function HelpdeskPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const view: ViewKey = views.some((v) => v.key === params.view)
    ? (params.view as ViewKey)
    : "all";
  const now = new Date();
  const soon = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const conditions = [eq(tickets.organizationId, user.organizationId)];

  switch (view) {
    case "new":
      conditions.push(eq(workItems.status, "new"));
      break;
    case "unassigned":
      conditions.push(isNull(workItems.assigneeId), inArray(workItems.status, ACTIVE_STATUSES));
      break;
    case "mine":
      conditions.push(eq(workItems.assigneeId, Number(user.id)));
      break;
    case "in_progress":
      conditions.push(eq(workItems.status, "in_progress"));
      break;
    case "waiting_customer":
      conditions.push(eq(workItems.status, "waiting_customer"));
      break;
    case "waiting_third_party":
      conditions.push(eq(workItems.status, "waiting_third_party"));
      break;
    case "due_soon":
      conditions.push(
        inArray(workItems.status, ACTIVE_STATUSES),
        isNotNull(tickets.resolutionTargetAt),
        gte(tickets.resolutionTargetAt, now),
        lte(tickets.resolutionTargetAt, soon),
      );
      break;
    case "overdue":
      conditions.push(
        inArray(workItems.status, ACTIVE_STATUSES),
        isNotNull(tickets.resolutionTargetAt),
        lt(tickets.resolutionTargetAt, now),
      );
      break;
    case "pending_confirmation":
      conditions.push(eq(workItems.status, "pending_confirmation"));
      break;
    case "billable":
      conditions.push(inArray(tickets.billingStatus, ["billable", "contract_overage"]));
      break;
    case "recurrent":
      conditions.push(
        sql`exists (select 1 from recurrence_executions re
          where re.generated_entity_type = 'ticket' and re.generated_entity_id = ${tickets.id})`,
      );
      break;
    case "closed":
      conditions.push(inArray(workItems.status, ["closed", "cancelled"]));
      break;
    case "reopened":
      conditions.push(eq(workItems.status, "reopened"));
      break;
  }

  if ((TICKET_STATUSES as readonly string[]).includes(params.status ?? "")) {
    conditions.push(eq(workItems.status, params.status as TicketStatus));
  }
  if (["low", "medium", "high", "critical"].includes(params.priority ?? "")) {
    conditions.push(
      eq(workItems.priority, params.priority as (typeof workItems.priority.enumValues)[number]),
    );
  }
  const companyId = Number(params.client);
  if (Number.isInteger(companyId) && companyId > 0) {
    conditions.push(eq(workItems.companyId, companyId));
  }
  const assigneeId = Number(params.assignee);
  if (Number.isInteger(assigneeId) && assigneeId > 0) {
    conditions.push(eq(workItems.assigneeId, assigneeId));
  }
  if (params.category?.trim()) {
    conditions.push(eq(tickets.category, params.category.trim()));
  }
  const slaId = Number(params.sla);
  if (Number.isInteger(slaId) && slaId > 0) {
    conditions.push(eq(tickets.slaDefinitionId, slaId));
  }
  if ((TICKET_BILLING_STATUSES as readonly string[]).includes(params.billing ?? "")) {
    conditions.push(
      eq(tickets.billingStatus, params.billing as (typeof tickets.billingStatus.enumValues)[number]),
    );
  }
  if (params.channel?.trim()) conditions.push(eq(tickets.channel, params.channel.trim()));
  if (/^\d{4}-\d{2}-\d{2}$/.test(params.from ?? "")) {
    conditions.push(gte(workItems.createdAt, new Date(`${params.from}T00:00:00Z`)));
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(params.to ?? "")) {
    conditions.push(lte(workItems.createdAt, new Date(`${params.to}T23:59:59Z`)));
  }

  const timeByItem = db.$with("time_by_item").as(
    db
      .select({
        workItemId: timeEntries.workItemId,
        minutes: sql<number>`coalesce(sum(${timeEntries.durationMinutes}), 0)::int`.as("minutes"),
      })
      .from(timeEntries)
      .where(isNull(timeEntries.voidedAt))
      .groupBy(timeEntries.workItemId),
  );

  const [rows, companyRows, userRows, slaRows, categoryRows] = await Promise.all([
    db
      .with(timeByItem)
      .select({
        id: tickets.id,
        folio: tickets.folio,
        title: workItems.title,
        status: workItems.status,
        priority: workItems.priority,
        category: tickets.category,
        slaName: tickets.slaName,
        resolutionTargetAt: tickets.resolutionTargetAt,
        billingStatus: tickets.billingStatus,
        companyName: companies.name,
        assigneeId: workItems.assigneeId,
        assigneeName: users.name,
        updatedAt: workItems.updatedAt,
        minutes: sql<number>`coalesce(${timeByItem.minutes}, 0)::int`,
      })
      .from(tickets)
      .innerJoin(workItems, eq(tickets.workItemId, workItems.id))
      .leftJoin(companies, eq(workItems.companyId, companies.id))
      .leftJoin(users, eq(workItems.assigneeId, users.id))
      .leftJoin(timeByItem, eq(timeByItem.workItemId, workItems.id))
      .where(and(...conditions))
      .orderBy(desc(workItems.updatedAt))
      .limit(200),
    db
      .select({ id: companies.id, name: companies.name })
      .from(companies)
      .where(eq(companies.organizationId, user.organizationId))
      .orderBy(asc(companies.name)),
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(eq(users.organizationId, user.organizationId))
      .orderBy(asc(users.name)),
    db
      .select({ id: slaDefinitions.id, name: slaDefinitions.name })
      .from(slaDefinitions)
      .where(eq(slaDefinitions.organizationId, user.organizationId))
      .orderBy(asc(slaDefinitions.name)),
    db
      .selectDistinct({ category: tickets.category })
      .from(tickets)
      .where(and(eq(tickets.organizationId, user.organizationId), isNotNull(tickets.category))),
  ]);

  return (
    <div>
      <PageHeader
        title="Helpdesk"
        subtitle="Operational tickets: create, assign, work, document, measure, resolve, confirm, close."
        action={
          <Link href="/helpdesk/new" className={buttonClass}>
            <Plus /> New ticket
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-1 rounded-lg border border-edge bg-surface p-1 shadow-card">
        {views.map((v) => (
          <Link
            key={v.key}
            href={v.key === "all" ? "/helpdesk" : `/helpdesk?view=${v.key}`}
            aria-current={view === v.key ? "page" : undefined}
            className={cx(
              "rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors duration-150",
              view === v.key
                ? "bg-primary-soft text-primary"
                : "text-muted hover:bg-subtle hover:text-fg",
            )}
          >
            {v.label}
          </Link>
        ))}
      </div>

      <form
        method="GET"
        className="mb-5 grid grid-cols-2 items-end gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-10"
      >
        <input type="hidden" name="view" value={view} />
        <select name="status" defaultValue={params.status ?? ""} aria-label="Status" className={inputClass}>
          <option value="">Any status</option>
          {TICKET_STATUSES.map((s) => (
            <option key={s} value={s}>
              {ticketStatusMeta[s]?.label ?? s}
            </option>
          ))}
        </select>
        <select name="priority" defaultValue={params.priority ?? ""} aria-label="Priority" className={inputClass}>
          <option value="">Any priority</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
        <select name="client" defaultValue={params.client ?? ""} aria-label="Client" className={inputClass}>
          <option value="">Any client</option>
          {companyRows.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select name="assignee" defaultValue={params.assignee ?? ""} aria-label="Assignee" className={inputClass}>
          <option value="">Any assignee</option>
          {userRows.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <select name="category" defaultValue={params.category ?? ""} aria-label="Category" className={inputClass}>
          <option value="">Any category</option>
          {categoryRows.map((c) =>
            c.category ? (
              <option key={c.category} value={c.category}>
                {c.category}
              </option>
            ) : null,
          )}
        </select>
        <select name="sla" defaultValue={params.sla ?? ""} aria-label="SLA" className={inputClass}>
          <option value="">Any SLA</option>
          {slaRows.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select name="billing" defaultValue={params.billing ?? ""} aria-label="Billing" className={inputClass}>
          <option value="">Any billing</option>
          {TICKET_BILLING_STATUSES.map((b) => (
            <option key={b} value={b}>
              {ticketBillingMeta[b]?.label ?? b}
            </option>
          ))}
        </select>
        <select name="channel" defaultValue={params.channel ?? ""} aria-label="Channel" className={inputClass}>
          <option value="">Any channel</option>
          {["email", "phone", "whatsapp", "portal", "in_person", "internal", "manual"].map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input name="from" type="date" defaultValue={params.from ?? ""} aria-label="Created from" className={inputClass} />
        <div className="flex gap-2">
          <input name="to" type="date" defaultValue={params.to ?? ""} aria-label="Created to" className={inputClass} />
          <button type="submit" className={buttonSecondaryClass}>
            Apply
          </button>
        </div>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon={<LifeBuoy />}
          title={view === "recurrent" ? "No recurring tickets yet" : "No tickets here"}
          action={
            <Link href={view === "recurrent" ? "/recurring/new?targetType=ticket" : "/helpdesk/new"} className={buttonClass}>
              <Plus /> {view === "recurrent" ? "New recurrence" : "New ticket"}
            </Link>
          }
        >
          {view === "recurrent"
            ? "Tickets generated automatically by a Recurrence will appear here."
            : "No tickets match this view or filters."}
        </EmptyState>
      ) : (
        <Card className="overflow-visible">
            <Table>
              <THead>
                <tr>
                  <Th>Folio</Th>
                  <Th>Ticket</Th>
                  <Th>Client</Th>
                  <Th>Assignee</Th>
                  <Th>Status</Th>
                  <Th>Priority</Th>
                  <Th>Category</Th>
                  <Th>SLA</Th>
                  <Th>Due</Th>
                  <Th>Time</Th>
                  <Th>Billing</Th>
                  <Th>Updated</Th>
                  <Th>Actions</Th>
                </tr>
              </THead>
              <tbody className="divide-y divide-edge">
                {rows.map((r) => {
                  const overdue =
                    r.resolutionTargetAt &&
                    r.resolutionTargetAt.getTime() < now.getTime() &&
                    (ACTIVE_STATUSES as string[]).includes(r.status);
                  return (
                    <tr key={r.id} className="group transition-colors hover:bg-subtle">
                      <Td className="font-mono text-xs text-faint">{r.folio}</Td>
                      <Td>
                        <Link
                          href={`/helpdesk/${r.id}`}
                          className="font-medium text-fg transition-colors group-hover:text-primary"
                        >
                          {r.title}
                        </Link>
                      </Td>
                      <Td className="text-muted">{r.companyName ?? "—"}</Td>
                      <Td className="text-muted">{r.assigneeName ?? "Unassigned"}</Td>
                      <Td>
                        <Badge tone={ticketStatusMeta[r.status]?.tone ?? "slate"}>
                          {ticketStatusMeta[r.status]?.label ?? r.status}
                        </Badge>
                      </Td>
                      <Td>
                        <Badge tone={ticketPriorityMeta[r.priority]?.tone ?? "slate"}>
                          {ticketPriorityMeta[r.priority]?.label ?? r.priority}
                        </Badge>
                      </Td>
                      <Td className="text-muted">{r.category ?? "—"}</Td>
                      <Td className="text-muted">{r.slaName ?? "—"}</Td>
                      <Td
                        className={cx(
                          "tabular-nums",
                          overdue ? "font-medium text-danger" : "text-muted",
                        )}
                      >
                        {r.resolutionTargetAt ? fmtDate(r.resolutionTargetAt) : "—"}
                      </Td>
                      <Td className="text-muted tabular-nums">
                        {r.minutes > 0 ? formatMinutes(r.minutes) : "—"}
                      </Td>
                      <Td>
                        <Badge tone={ticketBillingMeta[r.billingStatus]?.tone ?? "slate"}>
                          {ticketBillingMeta[r.billingStatus]?.label ?? r.billingStatus}
                        </Badge>
                      </Td>
                      <Td className="text-muted tabular-nums">{fmtDateTime(r.updatedAt)}</Td>
                      <Td>
                        <TicketRowActions
                          ticketId={r.id}
                          status={r.status}
                          priority={r.priority}
                          assigneeId={r.assigneeId}
                          users={userRows}
                        />
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
        </Card>
      )}
    </div>
  );
}
