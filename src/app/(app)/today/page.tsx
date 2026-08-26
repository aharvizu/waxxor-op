import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CalendarClock,
  CircleDollarSign,
  ClipboardCheck,
  MessagesSquare,
  ShieldAlert,
  Ticket as TicketIcon,
  Timer,
  UserX,
  X,
} from "lucide-react";
import { requireUser, type SessionUser } from "@/lib/session";
import { Badge, Card, CardHeader, EmptyState, Skeleton, StatCard, buttonClass, buttonSecondaryClass, cx, type BadgeTone } from "@/components/ui";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { getLabels } from "@/lib/labels";
import { getOrgLocale } from "@/lib/get-org-locale";
import { t, type Locale } from "@/lib/i18n";
import { listTicketBillingStatuses, listTicketPriorities, listTicketStatuses } from "@/lib/ticket-catalogs";
import { toCatalogMap } from "@/lib/catalog-map";
import {
  CatalogChip,
  type TicketBillingOption,
  type TicketPriorityOption,
  type TicketStatusOption,
} from "@/app/(app)/helpdesk/ticket-views";
import { formatMinutes } from "@/lib/time-entries";
import {
  WAITING_STATUSES,
  buildAttention,
  buildFocus,
  evaluateReminders,
  applyMarks,
  greetingFor,
  isDueToday,
  isOverdue,
  isSlaAtRisk,
  smartOrder,
  summaryText,
  type TodayItem,
} from "@/lib/today-rules";
import { getOrgRenewals } from "@/lib/company360-data";
import { getUserProjectSignals } from "@/lib/project-data";
import { getUserRecurrenceSignals } from "@/lib/recurrence-data";
import { getUserReportSignals } from "@/lib/indicator-data";
import {
  defaultScopeFor,
  getClientsLastTouch,
  getRecentMessages,
  getReminderMarks,
  getTimeLoggedOn,
  getTodayItems,
  getTodayPreferences,
  getUnassignedCounts,
  type TodayScope,
} from "@/lib/today-data";
import { getUserUnreadMentions } from "@/lib/inbox-data";
import { getContinueLearning } from "@/lib/help-data";
import { TicketRowActions } from "@/app/(app)/helpdesk/ticket-row-actions";
import { db } from "@/db";
import { and, asc, eq, ne } from "drizzle-orm";
import { users } from "@/db/schema";
import {
  AttendConversationButton,
  CompleteActivityButton,
  ReminderMarkButtons,
  ReopenActivityButton,
  RescheduleControl,
  TodayControls,
} from "./today-client";

export const metadata: Metadata = { title: "Hoy" };

const FILTERS = [
  ["all", "Todo", "All"],
  ["today", "Hoy", "Today"],
  ["overdue", "Vencidos", "Overdue"],
  ["upcoming", "Próximos", "Upcoming"],
  ["nodate", "Sin fecha", "No date"],
  ["unassigned", "Sin responsable", "Unassigned"],
  ["tickets", "Tickets", "Tickets"],
  ["activities", "Actividades", "Activities"],
  ["waiting", "Esperando", "Waiting"],
  ["pending_confirmation", "Confirmación", "Confirmation"],
  ["sla_risk", "SLA en riesgo", "SLA at risk"],
  ["billable", "Cobrables", "Billable"],
] as const;

const GROUPS = [
  ["none", "Sin agrupar", "Ungrouped"],
  ["priority", "Prioridad", "Priority"],
  ["type", "Tipo", "Type"],
  ["assignee", "Responsable", "Assignee"],
  ["client", "Empresa", "Client"],
  ["status", "Estado", "Status"],
  ["date", "Fecha", "Date"],
] as const;

function kindLabel(kind: string, locale: Locale): string {
  switch (kind) {
    case "ticket":
      return t("Ticket", "Ticket", locale);
    case "activity":
      return t("Actividad", "Activity", locale);
    case "related_activity":
      return t("Act. relacionada", "Related act.", locale);
    default:
      return kind;
  }
}

type Search = {
  scope?: string;
  view?: string;
  filter?: string;
  group?: string;
  date?: string;
  peek?: string;
  msg?: string;
};

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const user = await requireUser();
  const locale = await getOrgLocale(user.organizationId);
  const { activityStatusMeta, activityTypeMeta, ticketPriorityMeta } = getLabels(locale);
  const params = await searchParams;
  const prefs = await getTodayPreferences(Number(user.id));

  const scope: TodayScope = ["mine", "team", "org"].includes(params.scope ?? "")
    ? (params.scope as TodayScope)
    : (prefs.scope ?? defaultScopeFor(user.role));
  const view = ["list", "agenda", "table"].includes(params.view ?? "")
    ? params.view!
    : (prefs.view ?? "list");
  const filter = FILTERS.some(([k]) => k === params.filter)
    ? params.filter!
    : (prefs.filter ?? "all");
  const group = GROUPS.some(([k]) => k === params.group)
    ? params.group!
    : (prefs.group ?? "none");
  const today = new Date().toISOString().slice(0, 10);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? "") ? params.date! : today;

  const now = new Date();
  const hourLocal = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Mexico_City",
      hour: "numeric",
      hourCycle: "h23",
    }).format(now),
  );

  const qs = (over: Partial<Record<string, string>>) => {
    const p = new URLSearchParams({ scope, view, filter, group, date, ...over });
    return `/today?${p.toString()}`;
  };

  return (
    <div>
      {/* -------------------------------------------------------- header */}
      <div className="mb-6 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-fg">
              {greetingFor(hourLocal)}, {user.name?.split(" ")[0] ?? "!"}.
            </h1>
            <p className="mt-1 text-sm text-muted tabular-nums">
              {new Intl.DateTimeFormat("es-MX", {
                weekday: "long",
                day: "numeric",
                month: "long",
                timeZone: "America/Mexico_City",
              }).format(now)}
            </p>
          </div>
          <TodayControls
            scope={scope}
            view={view}
            filter={filter}
            group={group}
            date={date}
            canChooseScope
          />
        </div>
      </div>

      <div className="space-y-6">
        <Suspense fallback={<SectionSkeleton rows={6} />}>
          <CoreSections
            user={user}
            scope={scope}
            view={view}
            filter={filter}
            group={group}
            date={date}
            now={now}
            qs={qs}
            activityStatusMeta={activityStatusMeta}
            ticketPriorityMeta={ticketPriorityMeta}
            locale={locale}
          />
        </Suspense>

        <Suspense fallback={null}>
          <ContinueLearningCard user={user} locale={locale} />
        </Suspense>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Suspense fallback={<SectionSkeleton rows={3} />}>
            <RemindersSection user={user} now={now} locale={locale} />
          </Suspense>
          <Suspense fallback={<SectionSkeleton rows={3} />}>
            <MessagesSection user={user} msgFilter={params.msg ?? "unattended"} qs={qs} locale={locale} />
          </Suspense>
        </div>
      </div>

      {params.peek ? (
        <Suspense fallback={null}>
          <QuickView
            user={user}
            peek={params.peek}
            closeHref={qs({ peek: "" })}
            activityStatusMeta={activityStatusMeta}
            ticketPriorityMeta={ticketPriorityMeta}
            activityTypeMeta={activityTypeMeta}
            locale={locale}
          />
        </Suspense>
      ) : null}
    </div>
  );
}

function SectionSkeleton({ rows }: { rows: number }) {
  return (
    <Card className="p-5">
      <Skeleton className="mb-4 h-5 w-48" />
      <div className="space-y-2.5">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    </Card>
  );
}

function SectionError({ title, locale }: { title: string; locale: Locale }) {
  return (
    <Card className="flex items-center gap-3 border-danger/25 p-5 text-sm text-danger">
      <AlertTriangle className="size-4 shrink-0" />
      {locale === "en" ? (
        <>Could not load the “{title}” section. The rest of the screen still works.</>
      ) : (
        <>No se pudo cargar la sección “{title}”. El resto de la pantalla sigue funcionando.</>
      )}
    </Card>
  );
}

/* ================================================================== CORE */

async function CoreSections({
  user,
  scope,
  view,
  filter,
  group,
  date,
  now,
  qs,
  activityStatusMeta,
  ticketPriorityMeta,
  locale,
}: {
  user: SessionUser;
  scope: TodayScope;
  view: string;
  filter: string;
  group: string;
  date: string;
  now: Date;
  qs: (o: Partial<Record<string, string>>) => string;
  activityStatusMeta: ReturnType<typeof getLabels>["activityStatusMeta"];
  ticketPriorityMeta: ReturnType<typeof getLabels>["ticketPriorityMeta"];
  locale: Locale;
}) {
  let items: TodayItem[];
  let unassigned: { tickets: number; activities: number };
  let timeToday: number;
  let userRows: { id: number; name: string }[];
  let statusRows: TicketStatusOption[];
  let priorityRows: TicketPriorityOption[];
  try {
    [items, unassigned, timeToday, userRows, statusRows, priorityRows] = await Promise.all([
      getTodayItems(user, scope),
      getUnassignedCounts(user.organizationId),
      getTimeLoggedOn(user, scope, date),
      db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(
          and(eq(users.organizationId, user.organizationId), ne(users.role, "client")),
        )
        .orderBy(asc(users.name)),
      listTicketStatuses(user.organizationId, { includeInactive: true }),
      listTicketPriorities(user.organizationId, { includeInactive: true }),
    ]);
  } catch {
    return <SectionError title={t("Resumen y Mi trabajo", "Summary and My work", locale)} locale={locale} />;
  }
  const statusMap = toCatalogMap(statusRows);
  const priorityMap = toCatalogMap(priorityRows);

  const active = items.filter(
    (i) => !["closed", "cancelled", "completed", "archived"].includes(i.status),
  );
  const counts = {
    pending: active.length,
    dueToday: active.filter((i) => isDueToday(i, now)).length,
    overdue: active.filter((i) => isOverdue(i, now)).length,
    newTickets: items.filter((i) => i.kind === "ticket" && i.status === "new").length,
    unassignedTickets: unassigned.tickets,
    unassignedActivities: unassigned.activities,
    slaAtRisk: active.filter((i) => isSlaAtRisk(i, now)).length,
    slaBreached: active.filter(
      (i) =>
        i.kind === "ticket" &&
        i.resolutionTargetAt !== null &&
        !i.slaPausedAt &&
        i.resolutionTargetAt.getTime() < now.getTime(),
    ).length,
    pendingConfirmation: items.filter((i) => i.status === "pending_confirmation").length,
    unansweredConversations: items.filter((i) => i.unansweredInbound).length,
    billingReview: items.filter(
      (i) => i.kind === "ticket" && i.billingStatus === "pending_review",
    ).length,
  };

  const attention = buildAttention(active, now);
  const focus = buildFocus({
    dueToday: counts.dueToday,
    overdue: counts.overdue,
    pendingConfirmation: counts.pendingConfirmation,
    unassignedActivities: counts.unassignedActivities,
    unassignedTickets: counts.unassignedTickets,
    billingReview: counts.billingReview,
    unansweredConversations: counts.unansweredConversations,
    slaAtRisk: counts.slaAtRisk,
  });

  // -------- filter for Mi trabajo
  const filtered = items.filter((i) => {
    const isActiveItem = active.includes(i);
    switch (filter) {
      case "today":
        return isActiveItem && isDueToday(i, now);
      case "overdue":
        return isOverdue(i, now);
      case "upcoming":
        return (
          isActiveItem &&
          ((i.dueDate && i.dueDate > date) ||
            (i.resolutionTargetAt && i.resolutionTargetAt.getTime() > now.getTime()))
        );
      case "nodate":
        return isActiveItem && !i.dueDate && !i.resolutionTargetAt;
      case "unassigned":
        return isActiveItem && i.assigneeId === null;
      case "tickets":
        return i.kind === "ticket" && isActiveItem;
      case "activities":
        return i.kind !== "ticket" && isActiveItem;
      case "waiting":
        return (WAITING_STATUSES as readonly string[]).includes(i.status);
      case "pending_confirmation":
        return i.status === "pending_confirmation";
      case "sla_risk":
        return isSlaAtRisk(i, now);
      case "billable":
        return (
          i.kind === "ticket" &&
          (i.billingStatus === "billable" || i.billingStatus === "contract_overage")
        );
      default:
        return isActiveItem;
    }
  });
  const ordered = smartOrder(filtered, now);

  const waiting = items.filter((i) =>
    (WAITING_STATUSES as readonly string[]).includes(i.status),
  );
  const agendaItems = items.filter((i) => {
    if (i.dueDate === date) return true;
    return (
      i.resolutionTargetAt &&
      i.resolutionTargetAt.toISOString().slice(0, 10) === date
    );
  });

  // Most urgent first — the point is to read what matters most without scanning the whole row.
  const indicators: [string, number, string, typeof AlertTriangle][] = [
    [t("Vencidos", "Overdue", locale), counts.overdue, qs({ filter: "overdue" }), AlertTriangle],
    [t("SLA vencidos", "SLA breached", locale), counts.slaBreached, "/helpdesk?quick=overdue", ShieldAlert],
    [t("SLA en riesgo", "SLA at risk", locale), counts.slaAtRisk, qs({ filter: "sla_risk" }), Timer],
    [t("Sin asignar", "Unassigned", locale), counts.unassignedTickets + counts.unassignedActivities, qs({ filter: "unassigned" }), UserX],
    [t("Para hoy", "Due today", locale), counts.dueToday, qs({ filter: "today" }), CalendarClock],
    [t("Tickets nuevos", "New tickets", locale), counts.newTickets, "/helpdesk?status=new", TicketIcon],
    [t("Por confirmar", "Pending confirmation", locale), counts.pendingConfirmation, qs({ filter: "pending_confirmation" }), ClipboardCheck],
    [t("Conversaciones", "Conversations", locale), counts.unansweredConversations, "#messages", MessagesSquare],
    [t("Cobro por revisar", "Billing to review", locale), counts.billingReview, "/helpdesk?billing=pending_review", CircleDollarSign],
  ];

  return (
    <>
      {/* summary line + indicators */}
      <div className="space-y-4">
        <p className="text-sm text-muted">
          {summaryText({
            pending: counts.pending,
            overdue: counts.overdue,
            slaAtRisk: counts.slaAtRisk,
          })}{" "}
          <span className="text-faint tabular-nums">
            ·{" "}
            {t(
              `${formatMinutes(timeToday)} registrados ${date === new Date().toISOString().slice(0, 10) ? "hoy" : `el ${fmtDate(date)}`}`,
              `${formatMinutes(timeToday)} logged ${date === new Date().toISOString().slice(0, 10) ? "today" : `on ${fmtDate(date)}`}`,
              locale,
            )}
          </span>
        </p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
          {indicators.map(([label, value, href, Icon]) => (
            <Link
              key={label}
              href={href}
              className={cx("rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60", value === 0 && "opacity-60")}
            >
              <StatCard icon={<Icon />} label={label} value={String(value)} />
            </Link>
          ))}
        </div>
      </div>

      {/* Atención inmediata */}
      {attention.length > 0 ? (
        <Card className="overflow-hidden border-danger/20">
          <CardHeader
            title={t("Atención inmediata", "Immediate attention", locale)}
            description={t("Lo que no puede esperar, en orden de urgencia.", "What cannot wait, in order of urgency.", locale)}
            action={
              <Link href={qs({ filter: "overdue" })} className="text-sm font-medium text-primary hover:text-primary-hover">
                {t("Ver todos", "View all", locale)} <ArrowRight className="inline size-3.5" />
              </Link>
            }
          />
          <ul className="divide-y divide-edge">
            {attention.map(({ item, reason }) => (
              <li key={`${item.kind}-${item.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Badge tone="red">{reason.label}</Badge>
                  <ItemLink item={item} qs={qs} locale={locale} />
                  <span className="hidden text-xs text-faint sm:inline">{item.companyName ?? ""}</span>
                </div>
                <InlineActions item={item} users={userRows} qs={qs} statuses={statusRows} priorities={priorityRows} locale={locale} />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* Enfoque del día */}
      {focus.length > 0 ? (
        <Card className="overflow-hidden">
          <CardHeader
            title={t("Enfoque del día", "Today's focus", locale)}
            description={t("Tres movimientos con más impacto ahora mismo.", "Three moves with the most impact right now.", locale)}
          />
          <ul className="divide-y divide-edge">
            {focus.map((f) => (
              <li key={f.title} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-fg">{f.title}</div>
                  <div className="text-xs text-muted">{f.impact}</div>
                </div>
                <Link href={f.href} className={cx(buttonSecondaryClass, "h-8 px-3 text-xs")}>
                  {t("Ver", "View", locale)} <ArrowRight className="size-3.5" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* Mi trabajo + Agenda lateral */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="overflow-hidden xl:col-span-2">
          <CardHeader
            title={t("Mi trabajo", "My work", locale)}
            description={t(
              `${ordered.length} elemento${ordered.length === 1 ? "" : "s"} en este filtro.`,
              `${ordered.length} item${ordered.length === 1 ? "" : "s"} in this filter.`,
              locale,
            )}
          />
          <div className="flex flex-wrap items-center gap-1.5 border-b border-edge px-5 py-3">
            {FILTERS.map(([key, esLabel, enLabel]) => (
              <Link
                key={key}
                href={qs({ filter: key })}
                aria-current={filter === key ? "page" : undefined}
                className={cx(
                  "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                  filter === key ? "bg-primary-soft text-primary" : "text-muted hover:bg-subtle hover:text-fg",
                )}
              >
                {t(esLabel, enLabel, locale)}
              </Link>
            ))}
            <span className="mx-1 h-4 w-px bg-edge" aria-hidden />
            {GROUPS.map(([key, esLabel, enLabel]) => (
              <Link
                key={key}
                href={qs({ group: key })}
                aria-current={group === key ? "page" : undefined}
                className={cx(
                  "rounded-md px-2 py-1 text-xs transition-colors",
                  group === key ? "bg-subtle font-medium text-fg" : "text-faint hover:text-muted",
                )}
              >
                {t(esLabel, enLabel, locale)}
              </Link>
            ))}
          </div>
          {ordered.length === 0 ? (
            <EmptyStateNoWork qs={qs} locale={locale} />
          ) : view === "table" ? (
            <CompactTable
              items={ordered}
              qs={qs}
              statuses={statusMap}
              priorities={priorityMap}
              activityStatusMeta={activityStatusMeta}
              ticketPriorityMeta={ticketPriorityMeta}
              locale={locale}
            />
          ) : view === "agenda" ? (
            <AgendaView items={ordered} date={date} qs={qs} users={userRows} statuses={statusRows} priorities={priorityRows} locale={locale} />
          ) : (
            <GroupedList
              items={ordered}
              group={group}
              users={userRows}
              qs={qs}
              now={now}
              statuses={statusRows}
              priorities={priorityRows}
              activityStatusMeta={activityStatusMeta}
              ticketPriorityMeta={ticketPriorityMeta}
              locale={locale}
            />
          )}
        </Card>

        <div className="space-y-6">
          {/* Agenda del día */}
          <Card className="overflow-hidden">
            <CardHeader
              title={t("Agenda", "Agenda", locale)}
              description={fmtDate(date)}
              action={
                <span className="flex gap-1">
                  <Link href={qs({ date: shiftDate(date, -1) })} className={cx(buttonSecondaryClass, "h-7 px-2 text-xs")}>←</Link>
                  <Link href={qs({ date: shiftDate(date, 1) })} className={cx(buttonSecondaryClass, "h-7 px-2 text-xs")}>→</Link>
                </span>
              }
            />
            {agendaItems.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted">{t("Sin elementos agendados.", "No scheduled items.", locale)}</p>
            ) : (
              <AgendaView items={agendaItems} date={date} qs={qs} users={userRows} statuses={statusRows} priorities={priorityRows} compact locale={locale} />
            )}
          </Card>

          {/* Esperando */}
          {waiting.length > 0 ? (
            <Card className="overflow-hidden">
              <CardHeader
                title={t("Esperando", "Waiting", locale)}
                description={t(
                  "Cliente, terceros, confirmaciones y bloqueos.",
                  "Client, third parties, confirmations and blockers.",
                  locale,
                )}
              />
              <ul className="divide-y divide-edge">
                {waiting.slice(0, 8).map((i) => (
                  <li key={`${i.kind}-${i.id}`} className="space-y-1 px-5 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <ItemLink item={i} qs={qs} locale={locale} />
                      <StatusBadge item={i} statuses={statusMap} fallbackTone="amber" activityStatusMeta={activityStatusMeta} />
                    </div>
                    <div className="text-xs text-muted">
                      {i.companyName ? `${i.companyName} · ` : ""}
                      {i.assigneeName ?? t("Sin responsable", "Unassigned", locale)} ·{" "}
                      {t("esperando desde", "waiting since", locale)} {fmtDateTime(i.updatedAt)}
                      {i.dueDate
                        ? ` · ${t("seguimiento", "follow-up", locale)} ${fmtDate(i.dueDate)}`
                        : ` · ${t("sin seguimiento programado", "no follow-up scheduled", locale)}`}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                      {i.kind === "ticket" ? (
                        <Link href={`/helpdesk/${i.id}?tab=conversation#composer`} className={cx(buttonSecondaryClass, "h-7 px-2 text-xs")}>
                          {t("Registrar seguimiento", "Log follow-up", locale)}
                        </Link>
                      ) : null}
                      <RescheduleControl kind={i.kind === "ticket" ? "ticket" : "activity"} id={i.id} dueDate={i.dueDate} />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Ticket status/priority now come from the org's dynamic catalogs (real
 * name + color, incl. custom values) — looked up by statusId/priorityId.
 * Activities still run entirely on the legacy workItems enum (out of scope
 * this sprint), so they keep the static activityStatusMeta/ticketPriorityMeta
 * lookup (same priority enum is shared between tickets and activities). */
function StatusBadge({
  item,
  statuses,
  fallbackTone = "slate",
  activityStatusMeta,
}: {
  item: TodayItem;
  statuses: Map<number, TicketStatusOption>;
  fallbackTone?: BadgeTone;
  activityStatusMeta: ReturnType<typeof getLabels>["activityStatusMeta"];
}) {
  if (item.kind === "ticket" && item.statusId !== null) {
    return <CatalogChip entry={statuses.get(item.statusId)} fallback={item.status} />;
  }
  const meta = activityStatusMeta[item.status];
  return <Badge tone={meta?.tone ?? fallbackTone}>{meta?.label ?? item.status}</Badge>;
}

function PriorityBadge({
  item,
  priorities,
  ticketPriorityMeta,
}: {
  item: TodayItem;
  priorities: Map<number, TicketPriorityOption>;
  ticketPriorityMeta: ReturnType<typeof getLabels>["ticketPriorityMeta"];
}) {
  if (item.kind === "ticket" && item.priorityId !== null) {
    return <CatalogChip entry={priorities.get(item.priorityId)} fallback={item.priority} />;
  }
  const meta = ticketPriorityMeta[item.priority];
  return <Badge tone={meta?.tone ?? "slate"}>{meta?.label ?? item.priority}</Badge>;
}

function statusLabelFor(
  item: TodayItem,
  statuses: Map<number, TicketStatusOption>,
  activityStatusMeta: ReturnType<typeof getLabels>["activityStatusMeta"],
): string {
  if (item.kind === "ticket" && item.statusId !== null) {
    return statuses.get(item.statusId)?.name ?? item.status;
  }
  return activityStatusMeta[item.status]?.label ?? item.status;
}

function priorityLabelFor(
  item: TodayItem,
  priorities: Map<number, TicketPriorityOption>,
  ticketPriorityMeta: ReturnType<typeof getLabels>["ticketPriorityMeta"],
): string {
  if (item.kind === "ticket" && item.priorityId !== null) {
    return priorities.get(item.priorityId)?.name ?? item.priority;
  }
  return ticketPriorityMeta[item.priority]?.label ?? item.priority;
}

function ItemLink({ item, qs, locale }: { item: TodayItem; qs: (o: Record<string, string>) => string; locale: Locale }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Badge tone={item.kind === "ticket" ? "blue" : item.kind === "related_activity" ? "violet" : "purple"}>
        {item.kind === "activity" && item.parentActivityId
          ? t("Subactividad", "Sub-activity", locale)
          : item.kind === "activity" && item.projectId
            ? t("Act. de proyecto", "Project act.", locale)
            : item.kind === "activity" && item.activityType === "meeting"
              ? t("Reunión", "Meeting", locale)
              : item.kind === "activity" && item.activityType === "reminder"
                ? t("Recordatorio", "Reminder", locale)
                : kindLabel(item.kind, locale)}
      </Badge>
      <Link
        href={qs({ peek: `${item.kind === "ticket" ? "t" : "a"}:${item.id}` })}
        className="truncate text-sm font-medium text-fg hover:text-primary"
      >
        {item.folio ? <span className="mr-1 font-mono text-xs text-faint">{item.folio}</span> : null}
        {item.title}
      </Link>
    </span>
  );
}

function InlineActions({
  item,
  users,
  qs,
  statuses,
  priorities,
  locale,
}: {
  item: TodayItem;
  users: { id: number; name: string }[];
  qs: (o: Record<string, string>) => string;
  statuses: TicketStatusOption[];
  priorities: TicketPriorityOption[];
  locale: Locale;
}) {
  if (item.kind === "ticket") {
    if (item.statusId === null || item.priorityId === null) return null; // defensive; today-data.ts always sets these for tickets
    return (
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        <TicketRowActions
          ticketId={item.id}
          statusId={item.statusId}
          priorityId={item.priorityId}
          assigneeId={item.assigneeId}
          users={users}
          statuses={statuses}
          priorities={priorities}
        />
        {!item.firstResponseAt ? (
          <Link href={`/helpdesk/${item.id}?tab=conversation#composer`} className={cx(buttonSecondaryClass, "h-7 px-2 text-xs")}>
            {t("Responder", "Reply", locale)}
          </Link>
        ) : null}
        <Link href={qs({ peek: `t:${item.id}` })} className={cx(buttonSecondaryClass, "h-7 px-2 text-xs")}>
          {t("Vista rápida", "Quick View", locale)}
        </Link>
      </div>
    );
  }
  const done = item.status === "completed";
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
      {done ? (
        <ReopenActivityButton activityId={item.id} />
      ) : (
        <CompleteActivityButton activityId={item.id} />
      )}
      <RescheduleControl kind="activity" id={item.id} dueDate={item.dueDate} />
      <Link href={qs({ peek: `a:${item.id}` })} className={cx(buttonSecondaryClass, "h-7 px-2 text-xs")}>
        {t("Vista rápida", "Quick View", locale)}
      </Link>
    </div>
  );
}

function EmptyStateNoWork({ qs, locale }: { qs: (o: Record<string, string>) => string; locale: Locale }) {
  return (
    <div className="px-5 py-8">
      <EmptyState
        title={t("No tienes pendientes para hoy.", "You have nothing pending for today.", locale)}
        action={
          <span className="flex flex-wrap gap-2">
            <Link href={qs({ filter: "upcoming" })} className={buttonSecondaryClass}>
              {t("Ver próximos", "View upcoming", locale)}
            </Link>
            <Link href="/activities/new" className={buttonClass}>
              {t("Crear actividad", "Create activity", locale)}
            </Link>
            <Link href="/helpdesk?quick=unassigned" className={buttonSecondaryClass}>
              {t("Tickets sin asignar", "Unassigned tickets", locale)}
            </Link>
          </span>
        }
      >
        {t(
          "Nada vencido, nada en riesgo, nada esperando por ti en este filtro.",
          "Nothing overdue, nothing at risk, nothing waiting on you in this filter.",
          locale,
        )}
      </EmptyState>
    </div>
  );
}

/* -------------------------------------------------------------- list views */

function RowMeta({
  item,
  now,
  statuses,
  priorities,
  activityStatusMeta,
  ticketPriorityMeta,
  locale,
}: {
  item: TodayItem;
  now: Date;
  statuses: Map<number, TicketStatusOption>;
  priorities: Map<number, TicketPriorityOption>;
  activityStatusMeta: ReturnType<typeof getLabels>["activityStatusMeta"];
  ticketPriorityMeta: ReturnType<typeof getLabels>["ticketPriorityMeta"];
  locale: Locale;
}) {
  const overdue = isOverdue(item, now);
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 text-xs text-muted">
      {item.companyName ? <span className="hidden lg:inline">{item.companyName}</span> : null}
      <span>{item.assigneeName ?? t("Sin responsable", "Unassigned", locale)}</span>
      <StatusBadge item={item} statuses={statuses} activityStatusMeta={activityStatusMeta} />
      <PriorityBadge item={item} priorities={priorities} ticketPriorityMeta={ticketPriorityMeta} />
      {item.slaName ? <Badge tone={isSlaAtRisk(item, now) ? "amber" : "blue"}>SLA</Badge> : null}
      {item.unansweredInbound ? <Badge tone="amber">{t("Msj", "Msg", locale)}</Badge> : null}
      <span className={cx("tabular-nums", overdue && "font-medium text-danger")}>
        {item.dueDate
          ? fmtDate(item.dueDate)
          : item.resolutionTargetAt
            ? fmtDateTime(item.resolutionTargetAt)
            : t("Sin fecha", "No date", locale)}
      </span>
      {item.minutes > 0 ? <span className="tabular-nums">{formatMinutes(item.minutes)}</span> : null}
    </div>
  );
}

function GroupedList({
  items,
  group,
  users,
  qs,
  now,
  statuses,
  priorities,
  activityStatusMeta,
  ticketPriorityMeta,
  locale,
}: {
  items: TodayItem[];
  group: string;
  users: { id: number; name: string }[];
  qs: (o: Record<string, string>) => string;
  now: Date;
  statuses: TicketStatusOption[];
  priorities: TicketPriorityOption[];
  activityStatusMeta: ReturnType<typeof getLabels>["activityStatusMeta"];
  ticketPriorityMeta: ReturnType<typeof getLabels>["ticketPriorityMeta"];
  locale: Locale;
}) {
  const statusMap = toCatalogMap(statuses);
  const priorityMap = toCatalogMap(priorities);
  const keyFor = (i: TodayItem): string => {
    switch (group) {
      case "priority":
        return priorityLabelFor(i, priorityMap, ticketPriorityMeta);
      case "type":
        return kindLabel(i.kind, locale);
      case "assignee":
        return i.assigneeName ?? t("Sin responsable", "Unassigned", locale);
      case "client":
        return i.companyName ?? t("Sin cliente", "No client", locale);
      case "status":
        return statusLabelFor(i, statusMap, activityStatusMeta);
      case "date":
        return i.dueDate ?? (i.resolutionTargetAt ? i.resolutionTargetAt.toISOString().slice(0, 10) : t("Sin fecha", "No date", locale));
      default:
        return "";
    }
  };
  const groups = new Map<string, TodayItem[]>();
  for (const i of items) {
    const k = keyFor(i);
    groups.set(k, [...(groups.get(k) ?? []), i]);
  }
  return (
    <div>
      {[...groups.entries()].map(([label, groupItems]) => (
        <div key={label || "all"}>
          {label ? (
            <div className="border-b border-edge bg-subtle/60 px-5 py-1.5 text-xs font-semibold tracking-wide text-faint uppercase">
              {label} · {groupItems.length}
            </div>
          ) : null}
          <ul className="divide-y divide-edge">
            {groupItems.slice(0, 50).map((i) => (
              <li key={`${i.kind}-${i.id}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5">
                <ItemLink item={i} qs={qs} locale={locale} />
                <div className="flex flex-wrap items-center gap-2">
                  <RowMeta
                    item={i}
                    now={now}
                    statuses={statusMap}
                    priorities={priorityMap}
                    activityStatusMeta={activityStatusMeta}
                    ticketPriorityMeta={ticketPriorityMeta}
                    locale={locale}
                  />
                  <InlineActions item={i} users={users} qs={qs} statuses={statuses} priorities={priorities} locale={locale} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function AgendaView({
  items,
  date,
  qs,
  users,
  statuses,
  priorities,
  compact = false,
  locale,
}: {
  items: TodayItem[];
  date: string;
  qs: (o: Record<string, string>) => string;
  users: { id: number; name: string }[];
  statuses: TicketStatusOption[];
  priorities: TicketPriorityOption[];
  compact?: boolean;
  locale: Locale;
}) {
  const timed = items
    .filter((i) => i.resolutionTargetAt && i.resolutionTargetAt.toISOString().slice(0, 10) === date)
    .sort((a, b) => a.resolutionTargetAt!.getTime() - b.resolutionTargetAt!.getTime());
  const allDay = items.filter((i) => !timed.includes(i));
  return (
    <div className="divide-y divide-edge">
      {timed.map((i) => (
        <div key={`${i.kind}-${i.id}`} className="flex items-center gap-3 px-5 py-2.5">
          <span className="w-12 shrink-0 text-xs font-semibold text-muted tabular-nums">
            {new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "America/Mexico_City" }).format(i.resolutionTargetAt!)}
          </span>
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2">
            <ItemLink item={i} qs={qs} locale={locale} />
            {!compact ? <InlineActions item={i} users={users} qs={qs} statuses={statuses} priorities={priorities} locale={locale} /> : null}
          </div>
        </div>
      ))}
      {allDay.length > 0 ? (
        <>
          <div className="bg-subtle/60 px-5 py-1.5 text-xs font-semibold tracking-wide text-faint uppercase">
            {t("Durante el día", "During the day", locale)}
          </div>
          {allDay.map((i) => (
            <div key={`${i.kind}-${i.id}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5">
              <ItemLink item={i} qs={qs} locale={locale} />
              {!compact ? <InlineActions item={i} users={users} qs={qs} statuses={statuses} priorities={priorities} locale={locale} /> : null}
            </div>
          ))}
        </>
      ) : null}
      {timed.length === 0 && allDay.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted">{t("Sin elementos para esta fecha.", "No items for this date.", locale)}</p>
      ) : null}
    </div>
  );
}

function CompactTable({
  items,
  qs,
  statuses,
  priorities,
  activityStatusMeta,
  ticketPriorityMeta,
  locale,
}: {
  items: TodayItem[];
  qs: (o: Record<string, string>) => string;
  statuses: Map<number, TicketStatusOption>;
  priorities: Map<number, TicketPriorityOption>;
  activityStatusMeta: ReturnType<typeof getLabels>["activityStatusMeta"];
  ticketPriorityMeta: ReturnType<typeof getLabels>["ticketPriorityMeta"];
  locale: Locale;
}) {
  const headers: [string, string][] = [
    ["Tipo", "Type"],
    ["Título", "Title"],
    ["Empresa", "Client"],
    ["Responsable", "Assignee"],
    ["Estado", "Status"],
    ["Prioridad", "Priority"],
    ["Fecha", "Date"],
    ["SLA", "SLA"],
    ["Tiempo", "Time"],
    ["Actualizado", "Updated"],
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-edge text-left text-[11px] font-semibold tracking-wider text-faint uppercase">
            {headers.map(([es, en]) => (
              <th key={es} className="px-4 py-2.5">{t(es, en, locale)}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-edge">
          {items.slice(0, 100).map((i) => (
            <tr key={`${i.kind}-${i.id}`} className="hover:bg-subtle">
              <td className="px-4 py-2 text-xs text-muted">{kindLabel(i.kind, locale)}</td>
              <td className="px-4 py-2">
                <Link href={qs({ peek: `${i.kind === "ticket" ? "t" : "a"}:${i.id}` })} className="font-medium text-fg hover:text-primary">
                  {i.folio ? `${i.folio} · ` : ""}{i.title}
                </Link>
              </td>
              <td className="px-4 py-2 text-muted">{i.companyName ?? "—"}</td>
              <td className="px-4 py-2 text-muted">{i.assigneeName ?? "—"}</td>
              <td className="px-4 py-2">
                <StatusBadge item={i} statuses={statuses} activityStatusMeta={activityStatusMeta} />
              </td>
              <td className="px-4 py-2 text-muted">
                <PriorityBadge item={i} priorities={priorities} ticketPriorityMeta={ticketPriorityMeta} />
              </td>
              <td className="px-4 py-2 text-muted tabular-nums">
                {i.dueDate ? fmtDate(i.dueDate) : i.resolutionTargetAt ? fmtDate(i.resolutionTargetAt) : "—"}
              </td>
              <td className="px-4 py-2 text-muted">{i.slaName ?? "—"}</td>
              <td className="px-4 py-2 text-muted tabular-nums">{i.minutes > 0 ? formatMinutes(i.minutes) : "—"}</td>
              <td className="px-4 py-2 text-muted tabular-nums">{fmtDateTime(i.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ======================================================== CONTINUE LEARNING */

/** Unobtrusive: renders nothing when there is no in-progress tutorial. */
async function ContinueLearningCard({ user, locale }: { user: SessionUser; locale: Locale }) {
  let continueItem: Awaited<ReturnType<typeof getContinueLearning>>;
  try {
    continueItem = await getContinueLearning(Number(user.id));
  } catch {
    return null;
  }
  if (!continueItem) return null;

  return (
    <Link
      href={`/help/${continueItem.slug}`}
      className="flex items-center justify-between gap-3 rounded-xl border border-edge bg-surface px-5 py-3.5 shadow-card transition-shadow hover:shadow-card-hover"
    >
      <span className="min-w-0">
        <span className="block text-xs font-semibold tracking-wide text-faint uppercase">
          {t("Continuar aprendiendo", "Continue learning", locale)}
        </span>
        <span className="block truncate text-sm font-medium text-fg">{continueItem.title}</span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-primary" aria-hidden />
    </Link>
  );
}

/* ============================================================== REMINDERS */

async function RemindersSection({ user, now, locale }: { user: SessionUser; now: Date; locale: Locale }) {
  let reminders: ReturnType<typeof applyMarks>;
  try {
    const [items, clientsTouch, marks, renewals, projectSignals, recurrenceSignals, reportSignals] = await Promise.all([
      getTodayItems(user, "org"),
      getClientsLastTouch(user.organizationId),
      getReminderMarks(user.organizationId),
      getOrgRenewals(user.organizationId, 30),
      getUserProjectSignals(user.organizationId, Number(user.id)),
      getUserRecurrenceSignals(user.organizationId, Number(user.id)),
      getUserReportSignals(user.organizationId, Number(user.id)),
    ]);
    reminders = applyMarks(
      evaluateReminders(items, clientsTouch, now, renewals, projectSignals, recurrenceSignals, reportSignals),
      marks,
      now,
    ).slice(0, 10);
  } catch {
    return <SectionError title={t("No olvides", "Don't forget", locale)} locale={locale} />;
  }

  return (
      <Card className="overflow-hidden">
        <CardHeader
          title={t("No olvides", "Don't forget", locale)}
          description={t(
            "Reglas sobre datos reales — nada se inventa. Posponer o resolver queda auditado.",
            "Rules over real data — nothing is invented. Snoozing or resolving is audited.",
            locale,
          )}
          action={<Bell className="size-4 text-faint" />}
        />
        {reminders.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">
            {t(
              "Nada pendiente de recordar. Los recordatorios reaparecen solos si una condición vuelve a presentarse.",
              "Nothing pending to remember. Reminders reappear on their own if a condition happens again.",
              locale,
            )}
          </p>
        ) : (
          <ul className="divide-y divide-edge">
            {reminders.map((r) => (
              <li key={`${r.ruleKey}-${r.entityType}-${r.entityId}`} className="flex flex-wrap items-start justify-between gap-2 px-5 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge tone={r.severity === "high" ? "red" : r.severity === "medium" ? "amber" : "slate"}>
                      {r.severity === "high"
                        ? t("Alta", "High", locale)
                        : r.severity === "medium"
                          ? t("Media", "Medium", locale)
                          : t("Baja", "Low", locale)}
                    </Badge>
                    <Link href={r.href} className="text-sm font-medium text-fg hover:text-primary">
                      {r.title}
                    </Link>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">{r.detail}</p>
                  <p className="text-xs text-faint">→ {r.recommendedAction}</p>
                </div>
                <ReminderMarkButtons
                  ruleKey={r.ruleKey}
                  entityType={r.entityType}
                  entityId={r.entityId}
                  canDismiss={r.canDismiss}
                  canResolve={r.canResolve}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>
  );
}

/* =============================================================== MESSAGES */

async function MessagesSection({
  user,
  msgFilter,
  qs,
  locale,
}: {
  user: SessionUser;
  msgFilter: string;
  qs: (o: Record<string, string>) => string;
  locale: Locale;
}) {
  let all: Awaited<ReturnType<typeof getRecentMessages>>;
  let mentions: Awaited<ReturnType<typeof getUserUnreadMentions>>;
  try {
    [all, mentions] = await Promise.all([
      getRecentMessages(user.organizationId),
      getUserUnreadMentions(user.organizationId, Number(user.id), 5),
    ]);
  } catch {
    return <SectionError title={t("Mensajes recientes", "Recent messages", locale)} locale={locale} />;
  }
  const mineName = user.name;
  const rows = all.filter((m) => {
      switch (msgFilter) {
        case "mine":
          return m.assigneeName === mineName;
        case "unassigned":
          return m.assigneeName === null;
        case "all":
          return true;
        default: // unattended
          return m.direction === "inbound" && m.conversationStatus !== "closed" && m.conversationStatus !== "archived";
      }
  });

  return (
      <div id="messages">
      <Card className="overflow-hidden">
        <CardHeader
          title={t("Mensajes recientes", "Recent messages", locale)}
          description={t(
            "Última interacción por conversación — la bandeja completa vive en Inbox.",
            "Latest interaction per conversation — the full inbox lives in Inbox.",
            locale,
          )}
          action={
            <span className="flex gap-1 text-xs">
              {(
                [
                  ["unattended", "No atendidos", "Unattended"],
                  ["mine", "Míos", "Mine"],
                  ["unassigned", "Sin asignar", "Unassigned"],
                  ["all", "Todos", "All"],
                ] as const
              ).map(([k, esLabel, enLabel]) => (
                <Link
                  key={k}
                  href={qs({ msg: k })}
                  className={cx(
                    "rounded-md px-2 py-1 transition-colors",
                    msgFilter === k ? "bg-primary-soft font-medium text-primary" : "text-muted hover:bg-subtle",
                  )}
                >
                  {t(esLabel, enLabel, locale)}
                </Link>
              ))}
            </span>
          }
        />
        {mentions.length > 0 ? (
          <div className="border-b border-edge bg-primary-soft/40 px-5 py-3">
            <p className="mb-1.5 text-xs font-semibold text-primary">
              {t("Te mencionaron", "You were mentioned", locale)} ({mentions.length})
            </p>
            <ul className="space-y-1">
              {mentions.map((m) => (
                <li key={m.mentionId} className="truncate text-xs text-muted">
                  <Link href={`/inbox?c=${m.conversationId}`} className="hover:text-primary">
                    <span className="font-medium text-fg">{m.authorName ?? t("Alguien", "Someone", locale)}</span>
                    {m.companyName ? ` · ${m.companyName}` : ""}: {m.body.slice(0, 90)}
                  </Link>
                </li>
              ))}
            </ul>
            <Link href="/inbox?view=mentions" className="mt-1.5 inline-block text-xs text-primary hover:underline">
              {t("Ver todas en Inbox", "View all in Inbox", locale)} →
            </Link>
          </div>
        ) : null}
        {rows.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">{t("Sin conversaciones en este filtro.", "No conversations in this filter.", locale)}</p>
        ) : (
          <ul className="divide-y divide-edge">
            {rows.map((m) => (
              <li key={m.conversationId} className="space-y-1 px-5 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/helpdesk/${m.ticketId}?tab=conversation`} className="min-w-0 truncate text-sm font-medium text-fg hover:text-primary">
                    <span className="mr-1 font-mono text-xs text-faint">{m.folio}</span>
                    {m.companyName ?? t("Sin cliente", "No client", locale)}
                    {m.contact ? ` · ${m.contact}` : ""}
                  </Link>
                  <span className="flex items-center gap-2 text-xs text-faint">
                    <Badge tone={m.direction === "inbound" ? "amber" : "slate"}>
                      {m.direction === "inbound" ? t("Recibido", "Received", locale) : t("Enviado", "Sent", locale)} · {m.channel}
                    </Badge>
                    {fmtDateTime(m.occurredAt)}
                  </span>
                </div>
                <p className="truncate text-xs text-muted">{m.body}</p>
                <div className="flex flex-wrap items-center gap-2 pt-0.5 text-xs text-faint">
                  <span>{m.assigneeName ?? t("Sin responsable", "Unassigned", locale)}</span>
                  <Link href={`/helpdesk/${m.ticketId}?tab=conversation#composer`} className={cx(buttonSecondaryClass, "h-7 px-2 text-xs")}>
                    {t("Registrar respuesta", "Log reply", locale)}
                  </Link>
                  {m.conversationStatus !== "closed" && m.conversationStatus !== "archived" ? (
                    <AttendConversationButton conversationId={m.conversationId} />
                  ) : (
                    <Badge tone="green">{t("Atendida", "Attended", locale)}</Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      </div>
  );
}

/* ============================================================== QUICK VIEW */

async function QuickView({
  user,
  peek,
  closeHref,
  activityStatusMeta,
  ticketPriorityMeta,
  activityTypeMeta,
  locale,
}: {
  user: SessionUser;
  peek: string;
  closeHref: string;
  activityStatusMeta: ReturnType<typeof getLabels>["activityStatusMeta"];
  ticketPriorityMeta: ReturnType<typeof getLabels>["ticketPriorityMeta"];
  activityTypeMeta: ReturnType<typeof getLabels>["activityTypeMeta"];
  locale: Locale;
}) {
  const match = /^(t|a):(\d+)$/.exec(peek);
  if (!match) return null;
  const kind = match[1] === "t" ? "ticket" : "activity";
  const id = Number(match[2]);

  let item: TodayItem | undefined;
  let userRows: { id: number; name: string }[];
  let statusRows: TicketStatusOption[];
  let priorityRows: TicketPriorityOption[];
  let billingRows: TicketBillingOption[];
  try {
    const items = await getTodayItems(user, "org");
    item = items.find(
      (i) => i.id === id && (kind === "ticket" ? i.kind === "ticket" : i.kind !== "ticket"),
    );
    [userRows, statusRows, priorityRows, billingRows] = await Promise.all([
      db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(and(eq(users.organizationId, user.organizationId), ne(users.role, "client")))
        .orderBy(asc(users.name)),
      listTicketStatuses(user.organizationId, { includeInactive: true }),
      listTicketPriorities(user.organizationId, { includeInactive: true }),
      listTicketBillingStatuses(user.organizationId, { includeInactive: true }),
    ]);
  } catch {
    return null;
  }
  if (!item) return null;
  const detailHref = kind === "ticket" ? `/helpdesk/${item.id}` : `/activities/${item.id}`;
  const statusMap = toCatalogMap(statusRows);
  const priorityMap = toCatalogMap(priorityRows);
  const billingMap = toCatalogMap(billingRows);

  return (
      <div className="fixed inset-0 z-50 flex justify-end bg-black/30" role="dialog" aria-label={t("Vista rápida", "Quick View", locale)}>
        <Link href={closeHref} className="flex-1" aria-label={t("Cerrar", "Close", locale)} />
        <div className="h-full w-full max-w-md overflow-y-auto border-l border-edge bg-surface p-6 shadow-xl">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs text-faint">
                {kindLabel(item.kind, locale)}
                {item.folio ? ` · ${item.folio}` : ""}
              </div>
              <h2 className="text-lg font-semibold text-fg">{item.title}</h2>
            </div>
            <Link href={closeHref} aria-label={t("Cerrar", "Close", locale)} className="rounded-md p-1 text-faint hover:bg-subtle hover:text-fg">
              <X className="size-4" />
            </Link>
          </div>
          <dl className="space-y-2 text-sm">
            <QVRow label={t("Empresa", "Client", locale)} value={item.companyName ?? "—"} />
            <QVRow label={t("Responsable", "Assignee", locale)} value={item.assigneeName ?? t("Sin responsable", "Unassigned", locale)} />
            <QVRow label={t("Estado", "Status", locale)} value={statusLabelFor(item, statusMap, activityStatusMeta)} />
            <QVRow label={t("Prioridad", "Priority", locale)} value={priorityLabelFor(item, priorityMap, ticketPriorityMeta)} />
            <QVRow
              label={t("Fecha", "Date", locale)}
              value={item.dueDate ? fmtDate(item.dueDate) : item.resolutionTargetAt ? fmtDateTime(item.resolutionTargetAt) : t("Sin fecha", "No date", locale)}
            />
            {item.slaName ? <QVRow label="SLA" value={item.slaName} /> : null}
            {item.kind === "ticket" && item.billingStatusId !== null ? (
              <QVRow label={t("Cobro", "Billing", locale)} value={billingMap.get(item.billingStatusId)?.name ?? item.billingStatus ?? "—"} />
            ) : null}
            {item.activityType ? (
              <QVRow label={t("Tipo", "Type", locale)} value={activityTypeMeta[item.activityType]?.label ?? item.activityType} />
            ) : null}
            <QVRow label={t("Tiempo registrado", "Time logged", locale)} value={item.minutes > 0 ? formatMinutes(item.minutes) : "—"} />
          </dl>
          <div className="mt-5 space-y-3 border-t border-edge pt-4">
            <InlineActions item={item} users={userRows} qs={() => closeHref} statuses={statusRows} priorities={priorityRows} locale={locale} />
            <div className="flex flex-wrap gap-2">
              <Link href={detailHref} className={buttonClass}>
                {t("Abrir detalle completo", "Open full detail", locale)}
              </Link>
              {item.kind === "ticket" ? (
                <>
                  <Link href={`${detailHref}?tab=time`} className={buttonSecondaryClass}>
                    {t("Registrar tiempo", "Log time", locale)}
                  </Link>
                  <Link href={`${detailHref}?tab=resolution`} className={buttonSecondaryClass}>
                    {t("Resolver / Cerrar", "Resolve / Close", locale)}
                  </Link>
                </>
              ) : (
                <Link href={`/activities/${item.id}/convert`} className={buttonSecondaryClass}>
                  {t("Convertir en ticket", "Convert to ticket", locale)}
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
  );
}

function QVRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-faint">{label}</dt>
      <dd className="text-right text-sm text-fg">{value}</dd>
    </div>
  );
}
