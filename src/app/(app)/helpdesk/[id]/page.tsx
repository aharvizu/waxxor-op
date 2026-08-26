import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, isNull, or, sql } from "drizzle-orm";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
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
  companies,
  contacts,
  conversations,
  messages,
  tickets,
  timeEntries,
  users,
  workItems,
} from "@/db/schema";
import { requireUser } from "@/lib/session";
import { getCatalog, getCatalogNames } from "@/lib/settings-data";
import { getArticleForTicket } from "@/lib/knowledge-data";
import { getLabels } from "@/lib/labels";
import { getOrgLocale } from "@/lib/get-org-locale";
import { t as tt } from "@/lib/i18n";
import { canCreateDraft } from "@/lib/knowledge";
import { isWorkflowDropdownCategory } from "@/lib/tickets";
import { listTicketBillingStatuses, listTicketPriorities, listTicketStatuses } from "@/lib/ticket-catalogs";
import { CreateKbArticleForm } from "./kb-from-ticket-form";
import { Badge, Card, CardHeader, buttonSecondaryClass } from "@/components/ui";
import { SlaPanel } from "@/components/sla-panel";
import { TimeEntriesCard } from "@/components/time/time-entries-card";
import { fmtDate, fmtDateTime, fmtMoney } from "@/lib/format";
import { formatMinutes } from "@/lib/time-entries";
import {
  BillingForm,
  CatalogChip,
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

const TAB_KEYS = [
  "details",
  "billing",
  "conversation",
  "activities",
  "time",
  "files",
  "history",
  "resolution",
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
  const tab = TAB_KEYS.some((k) => k === rawTab) ? rawTab! : "details";

  const locale = await getOrgLocale(user.organizationId);
  const { activityStatusMeta, confirmationTypeMeta, knowledgeStatusMeta, slaHealthMeta } = getLabels(locale);
  const TAB_LABELS: Record<(typeof TAB_KEYS)[number], string> = {
    details: tt("Detalles", "Details", locale),
    billing: tt("Cobro", "Billing", locale),
    conversation: tt("Conversación", "Conversation", locale),
    activities: tt("Actividades", "Activities", locale),
    time: tt("Tiempo", "Time", locale),
    files: tt("Archivos", "Files", locale),
    history: tt("Historial", "History", locale),
    resolution: tt("Resolución", "Resolution", locale),
  };

  const [row] = await db
    .select({
      ticket: tickets,
      item: workItems,
      companyName: companies.name,
      assigneeName: users.name,
    })
    .from(tickets)
    .innerJoin(workItems, eq(tickets.workItemId, workItems.id))
    .leftJoin(companies, eq(workItems.companyId, companies.id))
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
    companyRows,
    contactRows,
    userRows,
    linkable,
    [timeTotal],
    [sourceActivity],
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
      .select({ id: companies.id, name: companies.name })
      .from(companies)
      .where(eq(companies.organizationId, user.organizationId))
      .orderBy(asc(companies.name)),
    db
      .select({
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        companyId: contacts.companyId,
      })
      .from(contacts)
      .where(and(eq(contacts.organizationId, user.organizationId), eq(contacts.isActive, true)))
      .orderBy(asc(contacts.lastName)),
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
    db
      .select({ id: activities.id, folio: activities.folio, title: workItems.title })
      .from(activities)
      .innerJoin(workItems, eq(activities.workItemId, workItems.id))
      .where(eq(activities.convertedTicketId, t.id))
      .limit(1),
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
        ? tt(`Llamada registrada (${m.message.channel})`, `Call logged (${m.message.channel})`, locale)
        : meta.confirmationRequest
          ? tt("Confirmación solicitada", "Confirmation requested", locale)
          : m.message.direction === "internal"
            ? tt(
                `Nota interna${m.message.editedAt ? " (editada)" : ""}`,
                `Internal note${m.message.editedAt ? " (edited)" : ""}`,
                locale,
              )
            : m.message.direction === "inbound"
              ? tt(`Recibido vía ${m.message.channel}`, `Received via ${m.message.channel}`, locale)
              : tt(`Enviado al cliente vía ${m.message.channel}`, `Sent to client via ${m.message.channel}`, locale),
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
      title: tt(
        `${formatMinutes(te.entry.durationMinutes)} registrado (${te.entry.timeType.replaceAll("_", " ")})`,
        `${formatMinutes(te.entry.durationMinutes)} logged (${te.entry.timeType.replaceAll("_", " ")})`,
        locale,
      ),
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

  const [statuses, priorities, billingStatuses] = await Promise.all([
    listTicketStatuses(user.organizationId, { includeInactive: true }),
    listTicketPriorities(user.organizationId, { includeInactive: true }),
    listTicketBillingStatuses(user.organizationId, { includeInactive: true }),
  ]);
  const currentStatus = statuses.find((s) => s.id === t.statusId);
  const currentPriority = priorities.find((p) => p.id === t.priorityId);
  const currentBilling = billingStatuses.find((b) => b.id === t.billingStatusId);

  const isClosed = currentStatus?.category === "closed" || currentStatus?.category === "cancelled";
  const canReopen = currentStatus?.category === "resolved" || currentStatus?.category === "closed" || currentStatus?.category === "cancelled";
  const billingPending = currentBilling?.category === "pending";
  const iconFor = {
    in: <ArrowDownLeft className="size-3.5" />,
    out: <ArrowUpRight className="size-3.5" />,
    note: <StickyNote className="size-3.5" />,
    call: <Phone className="size-3.5" />,
    audit: <History className="size-3.5" />,
    time: <ClipboardCheck className="size-3.5" />,
  } as const;

  const categoryItems = await getCatalog(user.organizationId, "ticket_category");
  const categoryNames = categoryItems.filter((c) => c.parentId === null).map((c) => c.name);
  const subcategoryNames = [...new Set(categoryItems.filter((c) => c.parentId !== null).map((c) => c.name))];
  const activityTypeOptions = await getCatalogNames(user.organizationId, "time_entry_type");
  const kbArticle = t.resolution ? await getArticleForTicket(user.organizationId, t.id) : null;

  const dropdownStatuses = statuses
    .filter((s) => s.isActive && isWorkflowDropdownCategory(s.category))
    .map((s) => ({ id: s.id, name: s.name }));
  const priorityOptions = priorities
    .filter((p) => p.isActive || p.id === t.priorityId)
    .map((p) => ({ id: p.id, name: p.name }));
  const billingOptions = billingStatuses
    .filter((b) => b.isActive || b.id === t.billingStatusId)
    .map((b) => ({ id: b.id, name: b.name }));
  const closeBillingOptions = billingStatuses
    .filter((b) => b.isActive && b.category !== "pending")
    .map((b) => ({ id: b.id, name: b.name }));

  return (
    <div>
      {/* Shared datalist: subcategory inputs across the panels reference it (category is a strict <select> everywhere now). */}
      {subcategoryNames.length > 0 ? (
        <datalist id="ticket-subcategory-options">
          {subcategoryNames.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      ) : null}
      {/* header */}
      <div className="mb-6 space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <span className="font-mono text-xs text-faint">{t.folio}</span>
          <span aria-hidden>·</span>
          {row.companyName && w.companyId ? (
            <Link href={`/companies/${w.companyId}`} className="font-medium text-primary hover:underline">
              {row.companyName}
            </Link>
          ) : (
            <span>{tt("Sin cliente", "No client", locale)}</span>
          )}
          <span aria-hidden>·</span>
          <span>{row.assigneeName ?? tt("Sin asignar", "Unassigned", locale)}</span>
          <span aria-hidden>·</span>
          <span className="tabular-nums">{tt(`${formatMinutes(timeTotal.total)} registrado`, `${formatMinutes(timeTotal.total)} logged`, locale)}</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-fg">
          <TitleEditor ticketId={t.id} title={w.title} />
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <CatalogChip option={currentStatus} />
          <CatalogChip option={currentPriority} />
          <CatalogChip option={currentBilling} />
          {t.slaName ? <Badge tone="blue">SLA · {t.slaName}</Badge> : null}
          {w.dueDate ? (
            <Badge tone="amber">
              <CalendarDays className="size-3" />
              {tt("Agendado", "Scheduled", locale)} · {fmtDate(w.dueDate)}
            </Badge>
          ) : null}
          {t.reopenCount > 0 ? <Badge tone="red">{tt("Reabierto", "Reopened", locale)} ×{t.reopenCount}</Badge> : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <PrimaryActions ticketId={t.id} isClosed={isClosed} />
          {!isClosed && currentStatus && isWorkflowDropdownCategory(currentStatus.category) ? (
            <StatusSelect
              ticketId={t.id}
              statusId={t.statusId}
              statuses={dropdownStatuses}
              currentStatusName={currentStatus?.name ?? "—"}
              disabled={false}
            />
          ) : null}
          {canReopen ? <ReopenControl ticketId={t.id} /> : null}
          {user.role === "superadmin" ? <DeleteTicketControl ticketId={t.id} /> : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* center */}
        <div className="space-y-4 xl:col-span-2">
          <div className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-edge bg-surface p-1 shadow-card">
            {TAB_KEYS.map((key) => (
              <TabLink key={key} href={`/helpdesk/${t.id}?tab=${key}`} active={tab === key}>
                {TAB_LABELS[key]}
                {key === "activities" && relatedStats.total > 0
                  ? ` (${relatedStats.total})`
                  : ""}
                {key === "files" && fileRows.length > 0 ? ` (${fileRows.length})` : ""}
              </TabLink>
            ))}
          </div>

          {tab === "details" ? (
            <Card className="overflow-hidden">
              <CardHeader title={tt("Detalles", "Details", locale)} description={tt("Editable en línea.", "Inline editable.", locale)} />
              <div className="p-5">
                <SidePanelForm
                  ticketId={t.id}
                  defaults={{
                    title: w.title,
                    description: w.description,
                    companyId: w.companyId,
                    contactId: w.contactId,
                    assigneeId: w.assigneeId,
                    priorityId: t.priorityId,
                    category: t.category,
                    subcategory: t.subcategory,
                    channel: t.channel,
                    modality: t.modality,
                    contact: t.contact,
                    dueDate: w.dueDate,
                  }}
                  companies={companyRows}
                  contacts={contactRows.map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName}`, companyId: c.companyId }))}
                  users={userRows}
                  priorities={priorityOptions}
                  categoryOptions={categoryNames}
                />
              </div>
            </Card>
          ) : null}

          {tab === "billing" ? (
            <Card className="overflow-hidden">
              <CardHeader
                title={tt("Cobro", "Billing", locale)}
                description={tt("Clasificación operativa — no es facturación.", "Operational classification — no invoicing.", locale)}
              />
              <div className="p-5">
                {t.calculatedAmount ? (
                  <p className="mb-3 text-sm text-muted">
                    {tt("Monto calculado:", "Calculated amount:", locale)}{" "}
                    <span className="font-semibold text-fg tabular-nums">
                      {fmtMoney(t.calculatedAmount)}
                    </span>
                  </p>
                ) : null}
                <BillingForm
                  ticketId={t.id}
                  defaults={{
                    billingStatusId: t.billingStatusId,
                    billingModality: t.billingModality,
                    hourlyRate: t.hourlyRate,
                    fixedAmount: t.fixedAmount,
                  }}
                  billableMinutes={timeTotal.billable}
                  billingStatuses={billingOptions}
                />
              </div>
            </Card>
          ) : null}

          {tab === "conversation" ? (
            <Card className="overflow-hidden">
              <CardHeader
                title={tt("Conversación y actividad", "Conversation & activity", locale)}
                description={tt(
                  "Mensajes, notas, llamadas, tiempo y cambios operativos — lo más reciente primero. Nada se envía externamente en el MVP.",
                  "Messages, notes, calls, time and operational changes — newest first. Nothing is sent externally in the MVP.",
                  locale,
                )}
                action={
                  <Link href={`/inbox?ticketId=${t.id}`} className={buttonSecondaryClass}>
                    {tt("Abrir en Inbox", "Open in Inbox", locale)}
                  </Link>
                }
              />
              <div className="space-y-4 p-5">
                <div id="composer">
                  <Composer ticketId={t.id} />
                </div>
                {events.length === 0 ? (
                  <p className="text-sm text-muted">{tt("Nada registrado todavía.", "Nothing logged yet.", locale)}</p>
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
            <>
            {sourceActivity ? (
              <Card className="overflow-hidden">
                <CardHeader
                  title={tt("Origen", "Origin", locale)}
                  description={tt(
                    "Este ticket nació de una actividad — se conserva como referencia histórica, de solo lectura.",
                    "This ticket originated from an activity — kept as a read-only historical reference.",
                    locale,
                  )}
                />
                <div className="p-5">
                  <Link
                    href={`/activities/${sourceActivity.id}`}
                    className="flex items-center gap-2 text-sm font-medium text-fg hover:text-primary"
                  >
                    <Badge tone="purple">{tt("Actividad", "Activity", locale)}</Badge>
                    <span className="font-mono text-xs text-faint">{sourceActivity.folio}</span>
                    {sourceActivity.title}
                  </Link>
                </div>
              </Card>
            ) : null}
            <Card className="overflow-hidden">
              <CardHeader
                title={tt("Actividades relacionadas", "Related activities", locale)}
                description={tt(
                  "Actividades independientes que apoyan este ticket — completarlas nunca cierra el ticket.",
                  "Independent activities supporting this ticket — completing them never closes the ticket.",
                  locale,
                )}
                action={
                  <span className="flex gap-2 text-xs text-muted">
                    <Badge tone="slate">{tt("Total", "Total", locale)} {relatedStats.total}</Badge>
                    <Badge tone="green">{tt("Completadas", "Done", locale)} {relatedStats.completed}</Badge>
                    <Badge tone="blue">{tt("Abiertas", "Open", locale)} {relatedStats.pending}</Badge>
                    {relatedStats.overdue > 0 ? (
                      <Badge tone="red">{tt("Vencidas", "Overdue", locale)} {relatedStats.overdue}</Badge>
                    ) : null}
                  </span>
                }
              />
              <div className="space-y-4 p-5">
                {related.length === 0 ? (
                  <p className="text-sm text-muted">{tt("Aún no hay actividades relacionadas.", "No related activities yet.", locale)}</p>
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
                            {r.assigneeName ?? tt("Sin asignar", "Unassigned", locale)}
                            {r.item.dueDate ? ` · ${tt("Vence", "Due", locale)} ${fmtDate(r.item.dueDate)}` : ""}
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
                <RelatedActivityForms
                  ticketId={t.id}
                  users={userRows}
                  linkable={linkable}
                  activityTypeOptions={activityTypeOptions}
                />
              </div>
            </Card>
            </>
          ) : null}

          {tab === "time" ? <TimeEntriesCard workItemId={w.id} readOnly={isClosed} /> : null}

          {tab === "files" ? (
            <Card className="overflow-hidden">
              <CardHeader
                title={tt("Archivos", "Files", locale)}
                description={tt(
                  "Metadatos en Postgres; los blobs viven en el adaptador de almacenamiento local (almacenamiento productivo pendiente).",
                  "Metadata in Postgres; blobs on the local storage adapter (productive storage pending).",
                  locale,
                )}
              />
              <div className="space-y-4 p-5">
                <UploadForm ticketId={t.id} />
                {fileRows.length === 0 ? (
                  <p className="text-sm text-muted">{tt("Sin archivos adjuntos.", "No files attached.", locale)}</p>
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
              <CardHeader
                title={tt("Historial", "History", locale)}
                description={tt("Bitácora de auditoría completa de este ticket.", "Complete audit trail for this ticket.", locale)}
              />
              {auditRows.length === 0 ? (
                <p className="px-5 py-8 text-sm text-muted">{tt("Sin eventos de auditoría.", "No audit events.", locale)}</p>
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
                        {a.actorName ?? tt("sistema", "system", locale)} · {fmtDateTime(a.log.createdAt)}
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
                    title={tt("Resolución", "Resolution", locale)}
                    description={tt(
                      `Resuelto ${t.resolvedAt ? fmtDateTime(t.resolvedAt) : "—"} · ${t.category ?? "sin categoría"}${t.subcategory ? ` / ${t.subcategory}` : ""}`,
                      `Resolved ${t.resolvedAt ? fmtDateTime(t.resolvedAt) : "—"} · ${t.category ?? "no category"}${t.subcategory ? ` / ${t.subcategory}` : ""}`,
                      locale,
                    )}
                  />
                  <p className="p-5 text-sm whitespace-pre-wrap text-fg">{t.resolution}</p>
                </Card>
              ) : null}
              {t.resolution ? (
                <Card className="overflow-hidden">
                  <CardHeader
                    title={tt("Base de conocimiento", "Knowledge base", locale)}
                    description={tt(
                      "Genera un artículo reutilizable a partir de esta resolución — siempre como borrador.",
                      "Generates a reusable article from this resolution — always as a draft.",
                      locale,
                    )}
                  />
                  <div className="p-5">
                    {kbArticle ? (
                      <p className="text-sm text-fg">
                        {tt("Ya se generó", "Already generated", locale)}{" "}
                        <Link href={`/knowledge/${kbArticle.id}`} className="font-medium text-primary hover:underline">
                          {kbArticle.title}
                        </Link>{" "}
                        <Badge tone={knowledgeStatusMeta[kbArticle.status]?.tone ?? "slate"}>
                          {knowledgeStatusMeta[kbArticle.status]?.label ?? kbArticle.status}
                        </Badge>
                      </p>
                    ) : canCreateDraft(user.role) ? (
                      <CreateKbArticleForm
                        ticketId={t.id}
                        defaultTitle={w.title}
                        defaultProblem={w.description}
                        defaultSolution={t.resolution}
                        defaultCategory={t.category}
                      />
                    ) : (
                      <p className="text-sm text-muted">
                        {tt(
                          "No tienes permiso para crear artículos de conocimiento.",
                          "You don't have permission to create knowledge articles.",
                          locale,
                        )}
                      </p>
                    )}
                  </div>
                </Card>
              ) : null}
              {t.confirmationType ? (
                <Card className="overflow-hidden">
                  <CardHeader
                    title={tt("Confirmación", "Confirmation", locale)}
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
                    title={
                      currentStatus?.category === "cancelled"
                        ? tt("Cancelado", "Cancelled", locale)
                        : tt("Cerrado", "Closed", locale)
                    }
                    description={tt(
                      `${t.closedAt ? fmtDateTime(t.closedAt) : "—"} · SLA primera respuesta ${
                        t.slaFirstResponseMet === null
                          ? "n/a"
                          : t.slaFirstResponseMet
                            ? "cumplido"
                            : "incumplido"
                      } · resolución ${
                        t.slaResolutionMet === null ? "n/a" : t.slaResolutionMet ? "cumplido" : "incumplido"
                      }${t.timeExceptionReason ? ` · excepción de tiempo: ${t.timeExceptionReason}` : ""}`,
                      `${t.closedAt ? fmtDateTime(t.closedAt) : "—"} · SLA first response ${
                        t.slaFirstResponseMet === null
                          ? "n/a"
                          : t.slaFirstResponseMet
                            ? "met"
                            : "missed"
                      } · resolution ${
                        t.slaResolutionMet === null ? "n/a" : t.slaResolutionMet ? "met" : "missed"
                      }${t.timeExceptionReason ? ` · time exception: ${t.timeExceptionReason}` : ""}`,
                      locale,
                    )}
                  />
                </Card>
              ) : currentStatus?.category === "resolved" ? (
                <Card className="overflow-hidden">
                  <CardHeader
                    title={tt("Cerrar ticket", "Close ticket", locale)}
                    description={tt(
                      "El cierre requiere resolución, categoría, tipo de confirmación y tiempo (o una excepción auditada).",
                      "Closure requires resolution, category, confirmation type and time (or an audited exception).",
                      locale,
                    )}
                  />
                  <div className="p-5">
                    <CloseForm
                      ticketId={t.id}
                      hasTime={timeTotal.total > 0}
                      billingPending={billingPending}
                      billingStatuses={closeBillingOptions}
                    />
                  </div>
                </Card>
              ) : (
                <Card className="overflow-hidden">
                  <CardHeader
                    title={tt("Resolver ticket", "Resolve ticket", locale)}
                    description={tt(
                      `Tiempo registrado hasta ahora: ${formatMinutes(timeTotal.total)}.`,
                      `Time logged so far: ${formatMinutes(timeTotal.total)}.`,
                      locale,
                    )}
                  />
                  <div className="p-5">
                    <ResolveForm
                      ticketId={t.id}
                      category={t.category}
                      subcategory={t.subcategory}
                      hasTime={timeTotal.total > 0}
                      billingPending={billingPending}
                      billingStatuses={closeBillingOptions}
                      categoryOptions={categoryNames}
                      suggestedResolution={timeRows[0]?.entry.result?.trim() || timeRows[0]?.entry.description || null}
                    />
                  </div>
                </Card>
              )}
            </div>
          ) : null}
        </div>

        {/* right panel */}
        <div className="space-y-6">
          <SlaPanel ticket={t} slaHealthMeta={slaHealthMeta} />
        </div>
      </div>
    </div>
  );
}
