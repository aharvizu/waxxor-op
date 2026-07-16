import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, isNull, or, sql } from "drizzle-orm";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ClipboardCheck,
  FileText,
  History,
  Phone,
  StickyNote,
} from "lucide-react";
import { db } from "@/db";
import {
  activities,
  attachments,
  auditLogs,
  clients,
  conversations,
  messages,
  tickets,
  timeEntries,
  users,
  workItems,
} from "@/db/schema";
import { requireUser } from "@/lib/session";
import { Badge, Card, CardHeader } from "@/components/ui";
import { SlaPanel } from "@/components/sla-panel";
import { TimeEntriesCard } from "@/components/time/time-entries-card";
import { fmtDate, fmtDateTime, fmtMoney } from "@/lib/format";
import {
  activityStatusMeta,
  confirmationTypeMeta,
  ticketBillingMeta,
  ticketPriorityMeta,
  ticketStatusMeta,
} from "@/lib/labels";
import { formatMinutes } from "@/lib/time-entries";
import {
  BillingForm,
  CloseForm,
  Composer,
  DeleteAttachmentButton,
  DeleteTicketControl,
  NoteActions,
  PrimaryActions,
  RelatedActivityForms,
  ReopenControl,
  ResolveForm,
  SidePanelForm,
  StatusSelect,
  TabLink,
  TitleEditor,
  UnlinkButton,
  UploadForm,
} from "./ticket-panels";

export const metadata: Metadata = { title: "Ticket" };

const TABS = [
  ["conversation", "Conversation"],
  ["activities", "Activities"],
  ["time", "Time"],
  ["files", "Files"],
  ["history", "History"],
  ["resolution", "Resolution"],
] as const;

export default async function TicketPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requireUser();
  const [{ id }, { tab: rawTab }] = await Promise.all([params, searchParams]);
  const ticketId = Number(id);
  if (!Number.isInteger(ticketId)) notFound();
  const tab = TABS.some(([t]) => t === rawTab) ? rawTab! : "conversation";

  const [row] = await db
    .select({
      ticket: tickets,
      item: workItems,
      clientName: clients.name,
      assigneeName: users.name,
    })
    .from(tickets)
    .innerJoin(workItems, eq(tickets.workItemId, workItems.id))
    .leftJoin(clients, eq(workItems.clientId, clients.id))
    .leftJoin(users, eq(workItems.assigneeId, users.id))
    .where(and(eq(tickets.id, ticketId), eq(tickets.organizationId, user.organizationId)));
  if (!row) notFound();
  const t = row.ticket;
  const w = row.item;

  const [
    messageRows,
    auditRows,
    timeRows,
    related,
    fileRows,
    clientRows,
    userRows,
    linkable,
    [timeTotal],
  ] = await Promise.all([
    db
      .select({ message: messages, authorName: users.name })
      .from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .leftJoin(users, eq(messages.authorUserId, users.id))
      .where(eq(conversations.ticketId, t.id))
      .orderBy(desc(messages.occurredAt)),
    db
      .select({ log: auditLogs, actorName: users.name })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id))
      .where(
        and(
          eq(auditLogs.organizationId, user.organizationId),
          or(
            and(eq(auditLogs.entityType, "ticket"), eq(auditLogs.entityId, t.id)),
            and(eq(auditLogs.entityType, "work_item"), eq(auditLogs.entityId, w.id)),
          ),
        ),
      )
      .orderBy(desc(auditLogs.createdAt)),
    db
      .select({ entry: timeEntries, userName: users.name })
      .from(timeEntries)
      .leftJoin(users, eq(timeEntries.userId, users.id))
      .where(and(eq(timeEntries.workItemId, w.id), isNull(timeEntries.voidedAt)))
      .orderBy(desc(timeEntries.createdAt)),
    db
      .select({ activity: activities, item: workItems, assigneeName: users.name })
      .from(activities)
      .innerJoin(workItems, eq(activities.workItemId, workItems.id))
      .leftJoin(users, eq(workItems.assigneeId, users.id))
      .where(eq(activities.parentTicketId, t.id))
      .orderBy(asc(workItems.createdAt)),
    db
      .select({ attachment: attachments, uploaderName: users.name })
      .from(attachments)
      .leftJoin(users, eq(attachments.uploadedById, users.id))
      .where(eq(attachments.workItemId, w.id))
      .orderBy(desc(attachments.createdAt)),
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
    db
      .select({ id: activities.id, name: workItems.title })
      .from(activities)
      .innerJoin(workItems, eq(activities.workItemId, workItems.id))
      .where(
        and(
          eq(activities.organizationId, user.organizationId),
          isNull(activities.convertedAt),
          isNull(activities.archivedAt),
          isNull(activities.parentTicketId),
        ),
      )
      .orderBy(asc(workItems.title)),
    db
      .select({
        total: sql<number>`coalesce(sum(${timeEntries.durationMinutes}), 0)::int`,
        billable: sql<number>`coalesce(sum(${timeEntries.durationMinutes}) filter (where ${timeEntries.billingStatus} = 'billable'), 0)::int`,
      })
      .from(timeEntries)
      .where(and(eq(timeEntries.workItemId, w.id), isNull(timeEntries.voidedAt))),
  ]);

  // unified timeline: messages + operational audit + time entries
  type Event = {
    at: Date;
    icon: "in" | "out" | "note" | "call" | "audit" | "time";
    title: string;
    body?: string | null;
    actor?: string | null;
    messageId?: number;
    editable?: boolean;
  };
  const events: Event[] = [];
  for (const m of messageRows) {
    const meta = (m.message.metadata ?? {}) as Record<string, unknown>;
    events.push({
      at: m.message.occurredAt,
      icon: meta.call
        ? "call"
        : m.message.direction === "internal"
          ? "note"
          : m.message.direction === "inbound"
            ? "in"
            : "out",
      title: meta.call
        ? `Call logged (${m.message.channel})`
        : meta.confirmationRequest
          ? "Confirmation requested"
          : m.message.direction === "internal"
            ? `Internal note${m.message.editedAt ? " (edited)" : ""}`
            : m.message.direction === "inbound"
              ? `Received via ${m.message.channel}`
              : `Sent to client via ${m.message.channel}`,
      body: m.message.body,
      actor: m.authorName,
      messageId: m.message.id,
      editable:
        m.message.direction === "internal" && m.message.authorUserId === Number(user.id),
    });
  }
  for (const a of auditRows) {
    const meta = (a.log.metadata ?? {}) as Record<string, unknown>;
    events.push({
      at: a.log.createdAt,
      icon: "audit",
      title: a.log.field
        ? `${a.log.field}: ${a.log.oldValue ?? "—"} → ${a.log.newValue ?? "—"}`
        : `${a.log.entityType} ${a.log.action}${meta.event ? ` · ${String(meta.event)}` : ""}`,
      actor: a.actorName,
    });
  }
  for (const te of timeRows) {
    events.push({
      at: te.entry.createdAt,
      icon: "time",
      title: `${formatMinutes(te.entry.durationMinutes)} logged (${te.entry.timeType.replaceAll("_", " ")})`,
      body: te.entry.description,
      actor: te.userName,
    });
  }
  events.sort((a, b) => b.at.getTime() - a.at.getTime());

  const today = new Date().toISOString().slice(0, 10);
  const relatedStats = {
    total: related.length,
    completed: related.filter((r) => r.item.status === "completed").length,
    pending: related.filter(
      (r) => r.item.status !== "completed" && r.item.status !== "cancelled",
    ).length,
    overdue: related.filter(
      (r) =>
        r.item.dueDate &&
        r.item.dueDate < today &&
        r.item.status !== "completed" &&
        r.item.status !== "cancelled",
    ).length,
  };

  const isClosed = w.status === "closed" || w.status === "cancelled";
  const canReopen = ["resolved", "pending_confirmation", "closed", "cancelled"].includes(
    w.status,
  );
  const billingPending = t.billingStatus === "pending_review";
  const iconFor = {
    in: <ArrowDownLeft className="size-3.5" />,
    out: <ArrowUpRight className="size-3.5" />,
    note: <StickyNote className="size-3.5" />,
    call: <Phone className="size-3.5" />,
    audit: <History className="size-3.5" />,
    time: <ClipboardCheck className="size-3.5" />,
  } as const;

  return (
    <div>
      {/* header */}
      <div className="mb-6 space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <span className="font-mono text-xs text-faint">{t.folio}</span>
          <span aria-hidden>·</span>
          <span>{row.clientName ?? "No client"}</span>
          <span aria-hidden>·</span>
          <span>{row.assigneeName ?? "Unassigned"}</span>
          <span aria-hidden>·</span>
          <span className="tabular-nums">{formatMinutes(timeTotal.total)} logged</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-fg">
          <TitleEditor ticketId={t.id} title={w.title} />
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={ticketStatusMeta[w.status]?.tone ?? "slate"}>
            {ticketStatusMeta[w.status]?.label ?? w.status}
          </Badge>
          <Badge tone={ticketPriorityMeta[w.priority]?.tone ?? "slate"}>
            {ticketPriorityMeta[w.priority]?.label ?? w.priority}
          </Badge>
          <Badge tone={ticketBillingMeta[t.billingStatus]?.tone ?? "slate"}>
            {ticketBillingMeta[t.billingStatus]?.label ?? t.billingStatus}
          </Badge>
          {t.slaName ? <Badge tone="blue">SLA · {t.slaName}</Badge> : null}
          {t.reopenCount > 0 ? <Badge tone="red">Reopened ×{t.reopenCount}</Badge> : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <PrimaryActions ticketId={t.id} isClosed={isClosed} />
          {!isClosed && w.status !== "resolved" && w.status !== "pending_confirmation" ? (
            <StatusSelect ticketId={t.id} status={w.status} disabled={false} />
          ) : null}
          {canReopen ? <ReopenControl ticketId={t.id} /> : null}
          {user.role === "superadmin" ? <DeleteTicketControl ticketId={t.id} /> : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* center */}
        <div className="space-y-4 xl:col-span-2">
          <div className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-edge bg-surface p-1 shadow-card">
            {TABS.map(([key, label]) => (
              <TabLink key={key} href={`/helpdesk/${t.id}?tab=${key}`} active={tab === key}>
                {label}
                {key === "activities" && relatedStats.total > 0
                  ? ` (${relatedStats.total})`
                  : ""}
                {key === "files" && fileRows.length > 0 ? ` (${fileRows.length})` : ""}
              </TabLink>
            ))}
          </div>

          {tab === "conversation" ? (
            <Card className="overflow-hidden">
              <CardHeader
                title="Conversation & activity"
                description="Messages, notes, calls, time and operational changes — newest first. Nothing is sent externally in the MVP."
              />
              <div className="space-y-4 p-5">
                <div id="composer">
                  <Composer ticketId={t.id} />
                </div>
                {events.length === 0 ? (
                  <p className="text-sm text-muted">Nothing logged yet.</p>
                ) : (
                  <ul className="space-y-3">
                    {events.map((e, i) => (
                      <li key={i} className="flex gap-3">
                        <span
                          className={
                            e.icon === "note"
                              ? "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-amber-400/15 text-amber-600 dark:text-amber-300"
                              : e.icon === "audit"
                                ? "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-subtle text-faint"
                                : "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary"
                          }
                        >
                          {iconFor[e.icon]}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <span className="text-sm font-medium text-fg">{e.title}</span>
                            <span className="shrink-0 text-xs text-faint tabular-nums">
                              {e.actor ? `${e.actor} · ` : ""}
                              {fmtDateTime(e.at)}
                            </span>
                          </div>
                          {e.body ? (
                            <p className="mt-0.5 text-sm whitespace-pre-wrap text-muted">
                              {e.body}
                            </p>
                          ) : null}
                          {e.messageId ? (
                            <NoteActions
                              messageId={e.messageId}
                              ticketId={t.id}
                              body={e.body ?? ""}
                              canEdit={e.editable ?? false}
                              canDelete={user.role === "superadmin"}
                            />
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Card>
          ) : null}

          {tab === "activities" ? (
            <Card className="overflow-hidden">
              <CardHeader
                title="Related activities"
                description="Independent activities supporting this ticket — completing them never closes the ticket."
                action={
                  <span className="flex gap-2 text-xs text-muted">
                    <Badge tone="slate">Total {relatedStats.total}</Badge>
                    <Badge tone="green">Done {relatedStats.completed}</Badge>
                    <Badge tone="blue">Open {relatedStats.pending}</Badge>
                    {relatedStats.overdue > 0 ? (
                      <Badge tone="red">Overdue {relatedStats.overdue}</Badge>
                    ) : null}
                  </span>
                }
              />
              <div className="space-y-4 p-5">
                {related.length === 0 ? (
                  <p className="text-sm text-muted">No related activities yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {related.map((r) => (
                      <li
                        key={r.activity.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-edge bg-subtle px-4 py-3"
                      >
                        <div className="min-w-0">
                          <Link
                            href={`/activities/${r.activity.id}`}
                            className="truncate text-sm font-medium text-fg hover:text-primary"
                          >
                            {r.item.title}
                          </Link>
                          <div className="text-xs text-muted">
                            {r.assigneeName ?? "Unassigned"}
                            {r.item.dueDate ? ` · Due ${fmtDate(r.item.dueDate)}` : ""}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Badge tone={activityStatusMeta[r.item.status]?.tone ?? "slate"}>
                            {activityStatusMeta[r.item.status]?.label ?? r.item.status}
                          </Badge>
                          <UnlinkButton ticketId={t.id} activityId={r.activity.id} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <RelatedActivityForms ticketId={t.id} users={userRows} linkable={linkable} />
              </div>
            </Card>
          ) : null}

          {tab === "time" ? <TimeEntriesCard workItemId={w.id} readOnly={isClosed} /> : null}

          {tab === "files" ? (
            <Card className="overflow-hidden">
              <CardHeader
                title="Files"
                description="Metadata in Postgres; blobs on the local storage adapter (productive storage pending)."
              />
              <div className="space-y-4 p-5">
                <UploadForm ticketId={t.id} />
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
                          <DeleteAttachmentButton
                            attachmentId={f.attachment.id}
                            ticketId={t.id}
                          />
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Card>
          ) : null}

          {tab === "history" ? (
            <Card className="overflow-hidden">
              <CardHeader title="History" description="Complete audit trail for this ticket." />
              {auditRows.length === 0 ? (
                <p className="px-5 py-8 text-sm text-muted">No audit events.</p>
              ) : (
                <ul className="divide-y divide-edge">
                  {auditRows.map((a) => (
                    <li
                      key={a.log.id}
                      className="flex items-baseline justify-between gap-3 px-5 py-2.5 text-sm"
                    >
                      <span className="min-w-0">
                        <span className="font-medium text-fg">
                          {a.log.entityType}.{a.log.field ?? a.log.action}
                        </span>{" "}
                        <span className="text-muted">
                          {a.log.field
                            ? `${a.log.oldValue ?? "—"} → ${a.log.newValue ?? "—"}`
                            : ""}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-faint tabular-nums">
                        {a.actorName ?? "system"} · {fmtDateTime(a.log.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : null}

          {tab === "resolution" ? (
            <div className="space-y-4">
              {t.resolution ? (
                <Card className="overflow-hidden">
                  <CardHeader
                    title="Resolution"
                    description={`Resolved ${t.resolvedAt ? fmtDateTime(t.resolvedAt) : "—"} · ${t.category ?? "no category"}${t.subcategory ? ` / ${t.subcategory}` : ""}`}
                  />
                  <p className="p-5 text-sm whitespace-pre-wrap text-fg">{t.resolution}</p>
                </Card>
              ) : null}
              {t.confirmationType ? (
                <Card className="overflow-hidden">
                  <CardHeader
                    title="Confirmation"
                    description={`${confirmationTypeMeta[t.confirmationType]?.label ?? t.confirmationType} · ${t.confirmationAt ? fmtDateTime(t.confirmationAt) : "—"}${t.confirmationChannel ? ` · ${t.confirmationChannel}` : ""}`}
                  />
                  {t.confirmationNotes ? (
                    <p className="p-5 text-sm text-muted">{t.confirmationNotes}</p>
                  ) : null}
                </Card>
              ) : null}
              {isClosed ? (
                <Card className="overflow-hidden">
                  <CardHeader
                    title={w.status === "cancelled" ? "Cancelled" : "Closed"}
                    description={`${t.closedAt ? fmtDateTime(t.closedAt) : "—"} · SLA first response ${
                      t.slaFirstResponseMet === null
                        ? "n/a"
                        : t.slaFirstResponseMet
                          ? "met"
                          : "missed"
                    } · resolution ${
                      t.slaResolutionMet === null ? "n/a" : t.slaResolutionMet ? "met" : "missed"
                    }${t.timeExceptionReason ? ` · time exception: ${t.timeExceptionReason}` : ""}`}
                  />
                </Card>
              ) : w.status === "resolved" || w.status === "pending_confirmation" ? (
                <Card className="overflow-hidden">
                  <CardHeader
                    title="Close ticket"
                    description="Closure requires resolution, category, confirmation type and time (or an audited exception)."
                  />
                  <div className="p-5">
                    <CloseForm
                      ticketId={t.id}
                      hasTime={timeTotal.total > 0}
                      billingPending={billingPending}
                    />
                  </div>
                </Card>
              ) : (
                <Card className="overflow-hidden">
                  <CardHeader
                    title="Resolve ticket"
                    description={`Time logged so far: ${formatMinutes(timeTotal.total)}.`}
                  />
                  <div className="p-5">
                    <ResolveForm
                      ticketId={t.id}
                      category={t.category}
                      subcategory={t.subcategory}
                      hasTime={timeTotal.total > 0}
                      billingPending={billingPending}
                    />
                  </div>
                </Card>
              )}
            </div>
          ) : null}
        </div>

        {/* right panel */}
        <div className="space-y-6">
          <SlaPanel ticket={t} />
          <Card className="overflow-hidden">
            <CardHeader title="Billing" description="Operational classification — no invoicing." />
            <div className="p-5">
              {t.calculatedAmount ? (
                <p className="mb-3 text-sm text-muted">
                  Calculated amount:{" "}
                  <span className="font-semibold text-fg tabular-nums">
                    {fmtMoney(t.calculatedAmount)}
                  </span>
                </p>
              ) : null}
              <BillingForm
                ticketId={t.id}
                defaults={{
                  billingStatus: t.billingStatus,
                  billingModality: t.billingModality,
                  hourlyRate: t.hourlyRate,
                  fixedAmount: t.fixedAmount,
                  billingPeriod: t.billingPeriod,
                  externalReference: t.externalReference,
                  billingNotes: t.billingNotes,
                }}
                billableMinutes={timeTotal.billable}
              />
            </div>
          </Card>
          <Card className="overflow-hidden">
            <CardHeader title="Details" description="Inline editable." />
            <div className="p-5">
              <SidePanelForm
                ticketId={t.id}
                defaults={{
                  title: w.title,
                  description: w.description,
                  clientId: w.clientId,
                  assigneeId: w.assigneeId,
                  priority: w.priority,
                  category: t.category,
                  subcategory: t.subcategory,
                  channel: t.channel,
                  modality: t.modality,
                  contact: t.contact,
                }}
                clients={clientRows}
                users={userRows}
              />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
