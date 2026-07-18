import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { activities, clients, users, workItems } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { Card, CardHeader, PageHeader, buttonGhostClass } from "@/components/ui";
import { activityStatusMeta } from "@/lib/labels";
import { ConvertForm } from "./convert-form";

export const metadata: Metadata = { title: "Convert to ticket" };

export default async function ConvertActivityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const activityId = Number(id);
  if (!Number.isInteger(activityId)) notFound();

  const [row] = await db
    .select({ activity: activities, item: workItems })
    .from(activities)
    .innerJoin(workItems, eq(activities.workItemId, workItems.id))
    .where(
      and(
        eq(activities.id, activityId),
        eq(activities.organizationId, user.organizationId),
      ),
    );
  if (!row) notFound();
  if (row.activity.convertedAt && row.activity.convertedTicketId) {
    redirect(`/helpdesk/${row.activity.convertedTicketId}`);
  }
  // Archived activities cannot be converted — send the user back to restore first.
  if (row.activity.archivedAt) redirect(`/activities/${activityId}`);

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

  return (
    <div className="max-w-2xl">
      <PageHeader
        title={`Convert “${row.item.title}”`}
        subtitle={`Current status: ${
          activityStatusMeta[row.item.status]?.label ?? row.item.status
        }. The resulting ticket starts as Open with a new folio; this cannot be undone automatically.`}
        action={
          <Link href={`/activities/${activityId}`} className={buttonGhostClass}>
            <ArrowLeft /> Back to activity
          </Link>
        }
      />
      <Card className="overflow-hidden">
        <CardHeader
          title="Helpdesk details"
          description="Only what a ticket needs and the activity doesn't have yet."
        />
        <div className="p-6">
          <ConvertForm
            activityId={row.activity.id}
            clientId={row.item.clientId}
            assigneeId={row.item.assigneeId}
            priority={row.item.priority}
            cancelled={row.item.status === "cancelled"}
            inProject={row.activity.projectId !== null}
            clients={clientRows}
            users={userRows}
          />
        </div>
      </Card>
    </div>
  );
}
