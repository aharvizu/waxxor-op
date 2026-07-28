import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRightLeft } from "lucide-react";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { activities, companies, users, workItems } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { Badge, Card, CardHeader, PageHeader, buttonSecondaryClass } from "@/components/ui";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { activityStatusMeta, activityTypeMeta } from "@/lib/labels";
import { getCatalogNames } from "@/lib/settings-data";
import { TimeEntriesCard } from "@/components/time/time-entries-card";
import { ActivityForm } from "../activity-form";
import { TransitionButtons, WorkflowCard } from "../activity-controls";

export const metadata: Metadata = { title: "Activity" };

export default async function ActivityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const activityId = Number(id);
  if (!Number.isInteger(activityId)) notFound();

  const [row] = await db
    .select({ activity: activities, item: workItems, companyName: companies.name })
    .from(activities)
    .innerJoin(workItems, eq(activities.workItemId, workItems.id))
    .leftJoin(companies, eq(workItems.companyId, companies.id))
    .where(
      and(
        eq(activities.id, activityId),
        eq(activities.organizationId, user.organizationId),
      ),
    );
  if (!row) notFound();
  // Converted activities live in the Helpdesk now — old links follow them.
  if (row.activity.convertedAt && row.activity.convertedTicketId) {
    redirect(`/helpdesk/${row.activity.convertedTicketId}`);
  }

  const [companyRows, userRows, activityTypeOptions] = await Promise.all([
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
    getCatalogNames(user.organizationId, "activity_type"),
  ]);

  const a = row.activity;
  const w = row.item;
  const archived = a.archivedAt !== null;

  return (
    <div className="max-w-4xl">
      <PageHeader
        title={w.title}
        subtitle={`${activityTypeMeta[a.activityType]?.label ?? a.activityType}${
          row.companyName ? ` · ${row.companyName}` : ""
        } · Created ${fmtDateTime(w.createdAt)}${
          w.completedAt ? ` · Completed ${fmtDateTime(w.completedAt)}` : ""
        }${archived ? ` · Archived ${fmtDateTime(a.archivedAt!)}` : ""}`}
        action={
          <Badge tone={activityStatusMeta[w.status]?.tone ?? "slate"}>
            {activityStatusMeta[w.status]?.label ?? w.status}
          </Badge>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <TransitionButtons
          activityId={a.id}
          completed={w.status === "completed"}
          archived={archived}
        />
        <WorkflowCard
          activityId={a.id}
          status={w.status}
          assigneeId={w.assigneeId}
          users={userRows}
          archived={archived}
        />
        {!archived ? (
          <Link href={`/activities/${a.id}/convert`} className={buttonSecondaryClass}>
            <ArrowRightLeft /> Convert to ticket
          </Link>
        ) : null}
        <Link href={`/inbox?workItemId=${w.id}`} className={buttonSecondaryClass}>
          Conversaciones
        </Link>
      </div>

      <Card className="overflow-hidden">
        <CardHeader
          title="Details"
          description={
            archived
              ? "This activity is archived — restore it to make changes."
              : "Everything about this activity."
          }
        />
        <div className="p-6">
          {archived ? (
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="font-medium text-faint">Description</dt>
                <dd className="mt-1 whitespace-pre-wrap text-fg">
                  {w.description ?? "—"}
                </dd>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="font-medium text-faint">Start date</dt>
                  <dd className="mt-1 text-muted">{w.startDate ? fmtDate(w.startDate) : "—"}</dd>
                </div>
                <div>
                  <dt className="font-medium text-faint">Due date</dt>
                  <dd className="mt-1 text-muted">{w.dueDate ? fmtDate(w.dueDate) : "—"}</dd>
                </div>
              </div>
            </dl>
          ) : (
            <ActivityForm
              activity={{
                id: a.id,
                title: w.title,
                description: w.description,
                activityType: a.activityType,
                priority: w.priority,
                companyId: w.companyId,
                startDate: w.startDate,
                dueDate: w.dueDate,
                estimatedMinutes: w.estimatedMinutes,
              }}
              companies={companyRows}
              activityTypeOptions={activityTypeOptions}
              submitLabel="Save changes"
            />
          )}
        </div>
      </Card>

      <div className="mt-6">
        <TimeEntriesCard workItemId={w.id} readOnly={archived} />
      </div>
    </div>
  );
}
