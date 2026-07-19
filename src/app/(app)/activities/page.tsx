import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, desc, eq, isNotNull, isNull, lt, notInArray } from "drizzle-orm";
import { ClipboardCheck, Plus } from "lucide-react";
import { db } from "@/db";
import { activities, companies, users, workItems } from "@/db/schema";
import { requireUser } from "@/lib/session";
import {
  ACTIVITY_STATUSES,
  ACTIVITY_TYPES,
  type ActivityStatus,
  type ActivityType,
} from "@/lib/activities";
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
import { fmtDate } from "@/lib/format";
import { activityStatusMeta, activityTypeMeta } from "@/lib/labels";

export const metadata: Metadata = { title: "Activities" };

const views = [
  { key: "all", label: "All" },
  { key: "mine", label: "Mine" },
  { key: "unassigned", label: "Unassigned" },
  { key: "overdue", label: "Overdue" },
  { key: "no_date", label: "No date" },
  { key: "completed", label: "Completed" },
  { key: "archived", label: "Archived" },
] as const;
type ViewKey = (typeof views)[number]["key"];

type Search = {
  view?: string;
  status?: string;
  priority?: string;
  assignee?: string;
  client?: string;
  type?: string;
};

export default async function ActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const view: ViewKey = views.some((v) => v.key === params.view)
    ? (params.view as ViewKey)
    : "all";

  const today = new Date().toISOString().slice(0, 10);
  const conditions = [
    eq(workItems.organizationId, user.organizationId),
    eq(workItems.type, "activity"),
    isNull(activities.convertedAt), // converted activities live in the Helpdesk now
  ];

  if (view === "archived") {
    conditions.push(isNotNull(activities.archivedAt));
  } else {
    conditions.push(isNull(activities.archivedAt));
    if (view === "mine") conditions.push(eq(workItems.assigneeId, Number(user.id)));
    if (view === "unassigned") conditions.push(isNull(workItems.assigneeId));
    if (view === "overdue") {
      conditions.push(
        lt(workItems.dueDate, today),
        notInArray(workItems.status, ["completed", "cancelled"]),
      );
    }
    if (view === "no_date") conditions.push(isNull(workItems.dueDate));
    if (view === "completed") conditions.push(eq(workItems.status, "completed"));
  }

  // basic filters on top of the view
  if ((ACTIVITY_STATUSES as readonly string[]).includes(params.status ?? "")) {
    conditions.push(eq(workItems.status, params.status as ActivityStatus));
  }
  if (["low", "medium", "high", "critical"].includes(params.priority ?? "")) {
    conditions.push(
      eq(workItems.priority, params.priority as (typeof workItems.priority.enumValues)[number]),
    );
  }
  const assigneeId = Number(params.assignee);
  if (Number.isInteger(assigneeId) && assigneeId > 0) {
    conditions.push(eq(workItems.assigneeId, assigneeId));
  }
  const companyId = Number(params.client);
  if (Number.isInteger(companyId) && companyId > 0) {
    conditions.push(eq(workItems.companyId, companyId));
  }
  if ((ACTIVITY_TYPES as readonly string[]).includes(params.type ?? "")) {
    conditions.push(eq(activities.activityType, params.type as ActivityType));
  }

  const [rows, companyRows, userRows] = await Promise.all([
    db
      .select({
        id: activities.id,
        title: workItems.title,
        status: workItems.status,
        priority: workItems.priority,
        activityType: activities.activityType,
        dueDate: workItems.dueDate,
        companyName: companies.name,
        assigneeName: users.name,
      })
      .from(activities)
      .innerJoin(workItems, eq(activities.workItemId, workItems.id))
      .leftJoin(companies, eq(workItems.companyId, companies.id))
      .leftJoin(users, eq(workItems.assigneeId, users.id))
      .where(and(...conditions))
      .orderBy(desc(workItems.updatedAt)),
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
  ]);

  const overdueSet = new Set(
    view === "archived"
      ? []
      : rows
          .filter(
            (r) =>
              r.dueDate &&
              r.dueDate < today &&
              r.status !== "completed" &&
              r.status !== "cancelled",
          )
          .map((r) => r.id),
  );

  return (
    <div>
      <PageHeader
        title="Activities"
        subtitle="Standalone work — follow-ups, meetings, internal tasks — that isn’t a ticket or a project."
        action={
          <Link href="/activities/new" className={buttonClass}>
            <Plus /> New activity
          </Link>
        }
      />

      <div className="mb-4 inline-flex flex-wrap items-center gap-1 rounded-lg border border-edge bg-surface p-1 shadow-card">
        {views.map((v) => (
          <Link
            key={v.key}
            href={v.key === "all" ? "/activities" : `/activities?view=${v.key}`}
            aria-current={view === v.key ? "page" : undefined}
            className={cx(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150",
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
        className="mb-5 grid grid-cols-2 items-end gap-3 sm:grid-cols-3 lg:grid-cols-6"
      >
        <input type="hidden" name="view" value={view} />
        <select name="status" defaultValue={params.status ?? ""} aria-label="Status" className={inputClass}>
          <option value="">Any status</option>
          {ACTIVITY_STATUSES.map((s) => (
            <option key={s} value={s}>
              {activityStatusMeta[s]?.label ?? s}
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
        <select name="assignee" defaultValue={params.assignee ?? ""} aria-label="Assignee" className={inputClass}>
          <option value="">Any assignee</option>
          {userRows.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <select name="client" defaultValue={params.client ?? ""} aria-label="Client" className={inputClass}>
          <option value="">Any client</option>
          {companyRows.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select name="type" defaultValue={params.type ?? ""} aria-label="Type" className={inputClass}>
          <option value="">Any type</option>
          {ACTIVITY_TYPES.map((t) => (
            <option key={t} value={t}>
              {activityTypeMeta[t]?.label ?? t}
            </option>
          ))}
        </select>
        <button type="submit" className={buttonSecondaryClass}>
          Apply filters
        </button>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck />}
          title="No activities here"
          action={
            <Link href="/activities/new" className={buttonClass}>
              <Plus /> New activity
            </Link>
          }
        >
          Nothing matches this view or filters. Activities can exist without a
          client or date — capture everything, forget nothing.
        </EmptyState>
      ) : (
        <Card className="overflow-visible">
          <Table>
            <THead>
              <tr>
                <Th>Activity</Th>
                <Th>Type</Th>
                <Th>Client</Th>
                <Th>Assignee</Th>
                <Th>Priority</Th>
                <Th>Status</Th>
                <Th>Due</Th>
              </tr>
            </THead>
            <tbody className="divide-y divide-edge">
              {rows.map((a) => (
                <tr key={a.id} className="group transition-colors hover:bg-subtle">
                  <Td>
                    <Link
                      href={`/activities/${a.id}`}
                      className="font-medium text-fg transition-colors group-hover:text-primary"
                    >
                      {a.title}
                    </Link>
                  </Td>
                  <Td className="text-muted">
                    {activityTypeMeta[a.activityType]?.label ?? a.activityType}
                  </Td>
                  <Td className="text-muted">{a.companyName ?? "—"}</Td>
                  <Td className="text-muted">{a.assigneeName ?? "Unassigned"}</Td>
                  <Td>
                    <Badge tone={a.priority === "critical" ? "red" : a.priority === "high" ? "amber" : a.priority === "medium" ? "blue" : "slate"}>
                      {a.priority.charAt(0).toUpperCase() + a.priority.slice(1)}
                    </Badge>
                  </Td>
                  <Td>
                    <Badge tone={activityStatusMeta[a.status]?.tone ?? "slate"}>
                      {activityStatusMeta[a.status]?.label ?? a.status}
                    </Badge>
                  </Td>
                  <Td
                    className={cx(
                      "tabular-nums",
                      overdueSet.has(a.id) ? "font-medium text-danger" : "text-muted",
                    )}
                  >
                    {a.dueDate ? fmtDate(a.dueDate) : "—"}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
