import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowDownLeft, ArrowRightLeft, ArrowUpRight, FileText, Phone, StickyNote } from "lucide-react";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { activities, attachments, companies, conversations, messages, users, workItems } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { Badge, Card, CardHeader, PageHeader, buttonSecondaryClass } from "@/components/ui";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { getLabels } from "@/lib/labels";
import { getOrgLocale } from "@/lib/get-org-locale";
import { getCatalogNames } from "@/lib/settings-data";
import { TimeEntriesCard } from "@/components/time/time-entries-card";
import { ActivityForm } from "../activity-form";
import {
  ActivityComposer,
  ActivityMessageActions,
  ActivityUploadForm,
  DeleteActivityAttachmentButton,
  DeleteActivityButton,
  TransitionButtons,
  WorkflowCard,
} from "../activity-controls";

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

  const locale = await getOrgLocale(user.organizationId);
  const { activityStatusMeta, activityTypeMeta } = getLabels(locale);

  const [companyRows, userRows, activityTypeOptions, fileRows, messageRows] = await Promise.all([
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
    getCatalogNames(user.organizationId, "time_entry_type"),
    db
      .select({ attachment: attachments, uploaderName: users.name })
      .from(attachments)
      .leftJoin(users, eq(attachments.uploadedById, users.id))
      .where(eq(attachments.workItemId, row.item.id))
      .orderBy(desc(attachments.createdAt)),
    db
      .select({ message: messages, authorName: users.name })
      .from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .leftJoin(users, eq(messages.authorUserId, users.id))
      .where(eq(conversations.workItemId, row.item.id))
      .orderBy(desc(messages.occurredAt)),
  ]);

  const a = row.activity;
  const w = row.item;
  const archived = a.archivedAt !== null;

  return (
    <div className="max-w-4xl">
      <PageHeader
        title={
          <>
            <span className="mr-2 font-mono text-base font-normal text-faint">{a.folio}</span>
            {w.title}
          </>
        }
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
        {user.role === "superadmin" ? <DeleteActivityButton activityId={a.id} /> : null}
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

      <Card className="mt-6 overflow-hidden">
        <CardHeader
          title="Conversación"
          description="Mensajes, notas y llamadas de esta actividad — más recientes primero. Nada se envía externamente en el MVP."
          action={
            <Link href={`/inbox?workItemId=${w.id}`} className={buttonSecondaryClass}>
              Abrir en Inbox
            </Link>
          }
        />
        <div className="space-y-4 p-5">
          {!archived ? <ActivityComposer activityId={a.id} /> : null}
          {messageRows.length === 0 ? (
            <p className="text-sm text-muted">Nada registrado todavía.</p>
          ) : (
            <ul className="space-y-3">
              {messageRows.map((m) => {
                const meta = (m.message.metadata ?? {}) as Record<string, unknown>;
                const icon = meta.call ? (
                  <Phone className="size-3.5" />
                ) : m.message.direction === "internal" ? (
                  <StickyNote className="size-3.5" />
                ) : m.message.direction === "inbound" ? (
                  <ArrowDownLeft className="size-3.5" />
                ) : (
                  <ArrowUpRight className="size-3.5" />
                );
                const title = meta.call
                  ? `Llamada registrada (${m.message.channel})`
                  : m.message.direction === "internal"
                    ? `Nota interna${m.message.editedAt ? " (editada)" : ""}`
                    : m.message.direction === "inbound"
                      ? `Recibido vía ${m.message.channel}`
                      : `Enviado al cliente vía ${m.message.channel}`;
                return (
                  <li key={m.message.id} className="group flex gap-3">
                    <span
                      className={
                        m.message.direction === "internal"
                          ? "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-amber-400/15 text-amber-600 dark:text-amber-300"
                          : "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary"
                      }
                    >
                      {icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-sm font-medium text-fg">{title}</span>
                        <span className="shrink-0 text-xs text-faint tabular-nums">
                          {m.authorName ? `${m.authorName} · ` : ""}
                          {fmtDateTime(m.message.occurredAt)}
                        </span>
                      </div>
                      {m.message.deletedAt ? (
                        <p className="mt-0.5 text-sm text-faint italic">Mensaje eliminado</p>
                      ) : (
                        <p className="mt-0.5 text-sm whitespace-pre-wrap text-muted">{m.message.body}</p>
                      )}
                      {!m.message.deletedAt && m.message.authorUserId === Number(user.id) && !archived ? (
                        <ActivityMessageActions
                          key={`${m.message.id}-${m.message.editedAt?.getTime() ?? 0}`}
                          messageId={m.message.id}
                          activityId={a.id}
                          body={m.message.body}
                        />
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Card>

      <Card className="mt-6 overflow-hidden">
        <CardHeader title="Files" description="Attachments for this activity." />
        <div className="space-y-4 p-5">
          {!archived ? <ActivityUploadForm activityId={a.id} /> : null}
          {fileRows.length === 0 ? (
            <p className="text-sm text-muted">No files attached.</p>
          ) : (
            <ul className="space-y-2">
              {fileRows.map((f) => (
                <li
                  key={f.attachment.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-edge bg-subtle px-4 py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-2 text-sm">
                    <FileText className="size-4 shrink-0 text-faint" />
                    <a
                      href={`/api/attachments/${f.attachment.id}`}
                      className="truncate font-medium text-fg hover:text-primary"
                    >
                      {f.attachment.filename}
                    </a>
                    <span className="shrink-0 text-xs text-faint tabular-nums">
                      {(f.attachment.size / 1024).toFixed(0)} KB ·{" "}
                      {f.uploaderName ?? "?"} · {fmtDateTime(f.attachment.createdAt)}
                    </span>
                  </div>
                  {user.role === "superadmin" ? (
                    <DeleteActivityAttachmentButton attachmentId={f.attachment.id} activityId={a.id} />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <div className="mt-6">
        <TimeEntriesCard workItemId={w.id} readOnly={archived} />
      </div>
    </div>
  );
}
