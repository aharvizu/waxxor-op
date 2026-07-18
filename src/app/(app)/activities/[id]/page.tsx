import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRightLeft } from "lucide-react";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { activities, clients, users, workItems } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { Badge, Card, CardHeader, PageHeader, buttonSecondaryClass } from "@/components/ui";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { activityStatusMeta, activityTypeMeta } from "@/lib/labels";
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
    .select({ activity: activities, item: workItems, clientName: clients.name })
    .from(activities)
    .innerJoin(workItems, eq(activities.workItemId, workItems.id))
    .leftJoin(clients, eq(workItems.clientId, clients.id))
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

  const [clientRows, userRows] = await Promise.all([
    db
      .select({ id: clients.id, name: clients.name })
      .from(clients)
      .where(eq(clients.organizationId, user.organizationId))
      .orderBy(asc(clients.name)),
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(eq(users.organizationId, user.organizationId))
      .orderBy(asc(users.name)),
  ]);

  const a = row.activity;
  const w = row.item;
  const archived = a.archivedAt !== null;

  return (
    <div className="max-w-4xl">
      <PageHeader
        title={w.title}
        subtitle={`${activityTypeMeta[a.activityType]?.label ?? a.activityType}${
          row.clientName ? ` · ${row.clientName}` : ""
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
        {!archived ? (
          <Link href={`/activities/${a.id}/convert`} className={buttonSecondaryClass}>
            <ArrowRightLeft /> Convert to ticket
          </Link>
        ) : null}
        <Link href={`/inbox?workItemId=${w.id}`} className={buttonSecondaryClass}>
          Conversaciones
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="overflow-hidden lg:col-span-2">
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
                  clientId: w.clientId,
                  startDate: w.startDate,
                  dueDate: w.dueDate,
                  estimatedMinutes: w.estimatedMinutes,
                }}
                clients={clientRows}
                submitLabel="Save changes"
              />
            )}
          </div>
        </Card>

        <Card className="h-fit overflow-hidden">
          <CardHeader title="Workflow" description="Status and owner." />
          <div className="p-5">
            <WorkflowCard
              activityId={a.id}
              status={w.status}
              assigneeId={w.assigneeId}
              users={userRows}
              archived={archived}
            />
          </div>
        </Card>
      </div>

      <div className="mt-6">
        <TimeEntriesCard workItemId={w.id} readOnly={archived} />
      </div>
    </div>
  );
}
