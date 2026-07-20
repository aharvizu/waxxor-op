import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AlertTriangle, ArrowRight, Bell, X } from "lucide-react";
import { requireUser, type SessionUser } from "@/lib/session";
import { Badge, Card, CardHeader, EmptyState, Skeleton, buttonClass, buttonSecondaryClass, cx } from "@/components/ui";
import { fmtDate, fmtDateTime } from "@/lib/format";
import {
  activityStatusMeta,
  activityTypeMeta,
  ticketBillingMeta,
  ticketPriorityMeta,
  ticketStatusMeta,
} from "@/lib/labels";
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
import { getRecurrenceSummary, getUserRecurrenceSignals } from "@/lib/recurrence-data";
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
  ["all", "Todo"],
  ["today", "Hoy"],
  ["overdue", "Vencidos"],
  ["upcoming", "Próximos"],
  ["nodate", "Sin fecha"],
  ["unassigned", "Sin responsable"],
  ["tickets", "Tickets"],
  ["activities", "Actividades"],
  ["waiting", "Esperando"],
  ["pending_confirmation", "Confirmación"],
  ["sla_risk", "SLA en riesgo"],
  ["billable", "Cobrables"],
] as const;

const GROUPS = [
  ["none", "Sin agrupar"],
  ["priority", "Prioridad"],
  ["type", "Tipo"],
  ["assignee", "Responsable"],
  ["client", "Empresa"],
  ["status", "Estado"],
  ["date", "Fecha"],
] as const;

const KIND_LABEL: Record<string, string> = {
  ticket: "Ticket",
  activity: "Actividad",
  related_activity: "Act. relacionada",
};

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
          />
        </Suspense>

        <Suspense fallback={null}>
          <ContinueLearningCard user={user} />
        </Suspense>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Suspense fallback={<SectionSkeleton rows={3} />}>
            <RemindersSection user={user} now={now} />
          </Suspense>
          <Suspense fallback={<SectionSkeleton rows={3} />}>
            <MessagesSection user={user} msgFilter={params.msg ?? "unattended"} qs={qs} />
          </Suspense>
        </div>
      </div>

      {params.peek ? (
        <Suspense fallback={null}>
          <QuickView user={user} peek={params.peek} closeHref={qs({ peek: "" })} />
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

function SectionError({ title }: { title: string }) {
  return (
    <Card className="flex items-center gap-3 border-danger/25 p-5 text-sm text-danger">
      <AlertTriangle className="size-4 shrink-0" />
      No se pudo cargar la sección “{title}”. El resto de la pantalla sigue funcionando.
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
}: {
  user: SessionUser;
  scope: TodayScope;
  view: string;
  filter: string;
  group: string;
  date: string;
  now: Date;
  qs: (o: Partial<Record<string, string>>) => string;
}) {
  let items: TodayItem[];
  let unassigned: { tickets: number; activities: number };
  let timeToday: number;
  let userRows: { id: number; name: string }[];
  let recurrenceSummary: { scheduledToday: number; inError: number; generatedToday: number };
  try {
    [items, unassigned, timeToday, userRows, recurrenceSummary] = await Promise.all([
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
      getRecurrenceSummary(user.organizationId),
    ]);
  } catch {
    return <SectionError title="Resumen y Mi trabajo" />;
  }

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

  const indicators: [string, number, string][] = [
    ["Para hoy", counts.dueToday, qs({ filter: "today" })],
    ["Vencidos", counts.overdue, qs({ filter: "overdue" })],
    ["Tickets nuevos", counts.newTickets, "/helpdesk?view=new"],
    ["Sin asignar", counts.unassignedTickets + counts.unassignedActivities, qs({ filter: "unassigned" })],
    ["SLA en riesgo", counts.slaAtRisk, qs({ filter: "sla_risk" })],
    ["SLA vencidos", counts.slaBreached, "/helpdesk?view=overdue"],
    ["Por confirmar", counts.pendingConfirmation, qs({ filter: "pending_confirmation" })],
    ["Conversaciones", counts.unansweredConversations, "#messages"],
    ["Cobro por revisar", counts.billingReview, "/helpdesk?billing=pending_review"],
    ["Recurrencias hoy", recurrenceSummary.scheduledToday, "/recurring?view=today"],
    ["Recurrencias con error", recurrenceSummary.inError, "/recurring?view=errors"],
    ["Generado hoy (recurrente)", recurrenceSummary.generatedToday, "/recurring?view=all"],
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
            · {formatMinutes(timeToday)} registrados {date === new Date().toISOString().slice(0, 10) ? "hoy" : `el ${fmtDate(date)}`}
          </span>
        </p>
        <div className="flex flex-wrap gap-2">
          {indicators.map(([label, value, href]) => (
            <Link
              key={label}
              href={href}
              className={cx(
                "flex items-baseline gap-2 rounded-lg border border-edge bg-surface px-3 py-2 shadow-card transition-colors hover:border-primary/30 hover:bg-primary-soft/40",
                value === 0 && "opacity-60",
              )}
            >
              <span className="text-lg font-semibold tabular-nums">{value}</span>
              <span className="text-xs text-muted">{label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Atención inmediata */}
      {attention.length > 0 ? (
        <Card className="overflow-hidden border-danger/20">
          <CardHeader
            title="Atención inmediata"
            description="Lo que no puede esperar, en orden de urgencia."
            action={
              <Link href={qs({ filter: "overdue" })} className="text-sm font-medium text-primary hover:text-primary-hover">
                Ver todos <ArrowRight className="inline size-3.5" />
              </Link>
            }
          />
          <ul className="divide-y divide-edge">
            {attention.map(({ item, reason }) => (
              <li key={`${item.kind}-${item.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Badge tone="red">{reason.label}</Badge>
                  <ItemLink item={item} qs={qs} />
                  <span className="hidden text-xs text-faint sm:inline">{item.companyName ?? ""}</span>
                </div>
                <InlineActions item={item} users={userRows} qs={qs} />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* Enfoque del día */}
      {focus.length > 0 ? (
        <Card className="overflow-hidden">
          <CardHeader title="Enfoque del día" description="Tres movimientos con más impacto ahora mismo." />
          <ul className="divide-y divide-edge">
            {focus.map((f) => (
              <li key={f.title} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-fg">{f.title}</div>
                  <div className="text-xs text-muted">{f.impact}</div>
                </div>
                <Link href={f.href} className={cx(buttonSecondaryClass, "h-8 px-3 text-xs")}>
                  Ver <ArrowRight className="size-3.5" />
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
            title="Mi trabajo"
            description={`${ordered.length} elemento${ordered.length === 1 ? "" : "s"} en este filtro.`}
          />
          <div className="flex flex-wrap items-center gap-1.5 border-b border-edge px-5 py-3">
            {FILTERS.map(([key, label]) => (
              <Link
                key={key}
                href={qs({ filter: key })}
                aria-current={filter === key ? "page" : undefined}
                className={cx(
                  "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                  filter === key ? "bg-primary-soft text-primary" : "text-muted hover:bg-subtle hover:text-fg",
                )}
              >
                {label}
              </Link>
            ))}
            <span className="mx-1 h-4 w-px bg-edge" aria-hidden />
            {GROUPS.map(([key, label]) => (
              <Link
                key={key}
                href={qs({ group: key })}
                aria-current={group === key ? "page" : undefined}
                className={cx(
                  "rounded-md px-2 py-1 text-xs transition-colors",
                  group === key ? "bg-subtle font-medium text-fg" : "text-faint hover:text-muted",
                )}
              >
                {label}
              </Link>
            ))}
          </div>
          {ordered.length === 0 ? (
            <EmptyStateNoWork qs={qs} />
          ) : view === "table" ? (
            <CompactTable items={ordered} qs={qs} />
          ) : view === "agenda" ? (
            <AgendaView items={ordered} date={date} qs={qs} users={userRows} />
          ) : (
            <GroupedList items={ordered} group={group} users={userRows} qs={qs} now={now} />
          )}
        </Card>

        <div className="space-y-6">
          {/* Agenda del día */}
          <Card className="overflow-hidden">
            <CardHeader
              title="Agenda"
              description={fmtDate(date)}
              action={
                <span className="flex gap-1">
                  <Link href={qs({ date: shiftDate(date, -1) })} className={cx(buttonSecondaryClass, "h-7 px-2 text-xs")}>←</Link>
                  <Link href={qs({ date: shiftDate(date, 1) })} className={cx(buttonSecondaryClass, "h-7 px-2 text-xs")}>→</Link>
                </span>
              }
            />
            {agendaItems.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted">Sin elementos agendados.</p>
            ) : (
              <AgendaView items={agendaItems} date={date} qs={qs} users={userRows} compact />
            )}
          </Card>

          {/* Esperando */}
          {waiting.length > 0 ? (
            <Card className="overflow-hidden">
              <CardHeader title="Esperando" description="Cliente, terceros, confirmaciones y bloqueos." />
              <ul className="divide-y divide-edge">
                {waiting.slice(0, 8).map((i) => (
                  <li key={`${i.kind}-${i.id}`} className="space-y-1 px-5 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <ItemLink item={i} qs={qs} />
                      <Badge tone={statusMetaFor(i)?.tone ?? "amber"}>
                        {statusMetaFor(i)?.label ?? i.status}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted">
                      {i.companyName ? `${i.companyName} · ` : ""}
                      {i.assigneeName ?? "Sin responsable"} · esperando desde{" "}
                      {fmtDateTime(i.updatedAt)}
                      {i.dueDate ? ` · seguimiento ${fmtDate(i.dueDate)}` : " · sin seguimiento programado"}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                      {i.kind === "ticket" ? (
                        <Link href={`/helpdesk/${i.id}?tab=conversation#composer`} className={cx(buttonSecondaryClass, "h-7 px-2 text-xs")}>
                          Registrar seguimiento
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

function statusMetaFor(item: TodayItem) {
  return item.kind === "ticket"
    ? ticketStatusMeta[item.status]
    : activityStatusMeta[item.status];
}

function ItemLink({ item, qs }: { item: TodayItem; qs: (o: Record<string, string>) => string }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Badge tone={item.kind === "ticket" ? "blue" : item.kind === "related_activity" ? "violet" : "purple"}>
        {item.kind === "activity" && item.parentActivityId
          ? "Subactividad"
          : item.kind === "activity" && item.projectId
            ? "Act. de proyecto"
            : item.kind === "activity" && item.activityType === "meeting"
              ? "Reunión"
              : item.kind === "activity" && item.activityType === "reminder"
                ? "Recordatorio"
                : KIND_LABEL[item.kind]}
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
}: {
  item: TodayItem;
  users: { id: number; name: string }[];
  qs: (o: Record<string, string>) => string;
}) {
  if (item.kind === "ticket") {
    return (
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        <TicketRowActions
          ticketId={item.id}
          status={item.status}
          priority={item.priority}
          assigneeId={item.assigneeId}
          users={users}
        />
        {!item.firstResponseAt ? (
          <Link href={`/helpdesk/${item.id}?tab=conversation#composer`} className={cx(buttonSecondaryClass, "h-7 px-2 text-xs")}>
            Responder
          </Link>
        ) : null}
        <Link href={qs({ peek: `t:${item.id}` })} className={cx(buttonSecondaryClass, "h-7 px-2 text-xs")}>
          Quick View
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
        Quick View
      </Link>
    </div>
  );
}

function EmptyStateNoWork({ qs }: { qs: (o: Record<string, string>) => string }) {
  return (
    <div className="px-5 py-8">
      <EmptyState
        title="No tienes pendientes para hoy."
        action={
          <span className="flex flex-wrap gap-2">
            <Link href={qs({ filter: "upcoming" })} className={buttonSecondaryClass}>
              Ver próximos
            </Link>
            <Link href="/activities/new" className={buttonClass}>
              Crear actividad
            </Link>
            <Link href="/helpdesk?view=unassigned" className={buttonSecondaryClass}>
              Tickets sin asignar
            </Link>
          </span>
        }
      >
        Nada vencido, nada en riesgo, nada esperando por ti en este filtro.
      </EmptyState>
    </div>
  );
}

/* -------------------------------------------------------------- list views */

function RowMeta({ item, now }: { item: TodayItem; now: Date }) {
  const overdue = isOverdue(item, now);
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 text-xs text-muted">
      {item.companyName ? <span className="hidden lg:inline">{item.companyName}</span> : null}
      <span>{item.assigneeName ?? "Sin responsable"}</span>
      <Badge tone={statusMetaFor(item)?.tone ?? "slate"}>{statusMetaFor(item)?.label ?? item.status}</Badge>
      <Badge tone={ticketPriorityMeta[item.priority]?.tone ?? "slate"}>
        {ticketPriorityMeta[item.priority]?.label ?? item.priority}
      </Badge>
      {item.slaName ? <Badge tone={isSlaAtRisk(item, now) ? "amber" : "blue"}>SLA</Badge> : null}
      {item.unansweredInbound ? <Badge tone="amber">Msj</Badge> : null}
      <span className={cx("tabular-nums", overdue && "font-medium text-danger")}>
        {item.dueDate
          ? fmtDate(item.dueDate)
          : item.resolutionTargetAt
            ? fmtDateTime(item.resolutionTargetAt)
            : "Sin fecha"}
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
}: {
  items: TodayItem[];
  group: string;
  users: { id: number; name: string }[];
  qs: (o: Record<string, string>) => string;
  now: Date;
}) {
  const keyFor = (i: TodayItem): string => {
    switch (group) {
      case "priority":
        return ticketPriorityMeta[i.priority]?.label ?? i.priority;
      case "type":
        return KIND_LABEL[i.kind];
      case "assignee":
        return i.assigneeName ?? "Sin responsable";
      case "client":
        return i.companyName ?? "Sin cliente";
      case "status":
        return statusMetaFor(i)?.label ?? i.status;
      case "date":
        return i.dueDate ?? (i.resolutionTargetAt ? i.resolutionTargetAt.toISOString().slice(0, 10) : "Sin fecha");
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
                <ItemLink item={i} qs={qs} />
                <div className="flex flex-wrap items-center gap-2">
                  <RowMeta item={i} now={now} />
                  <InlineActions item={i} users={users} qs={qs} />
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
  compact = false,
}: {
  items: TodayItem[];
  date: string;
  qs: (o: Record<string, string>) => string;
  users: { id: number; name: string }[];
  compact?: boolean;
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
            <ItemLink item={i} qs={qs} />
            {!compact ? <InlineActions item={i} users={users} qs={qs} /> : null}
          </div>
        </div>
      ))}
      {allDay.length > 0 ? (
        <>
          <div className="bg-subtle/60 px-5 py-1.5 text-xs font-semibold tracking-wide text-faint uppercase">
            Durante el día
          </div>
          {allDay.map((i) => (
            <div key={`${i.kind}-${i.id}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5">
              <ItemLink item={i} qs={qs} />
              {!compact ? <InlineActions item={i} users={users} qs={qs} /> : null}
            </div>
          ))}
        </>
      ) : null}
      {timed.length === 0 && allDay.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted">Sin elementos para esta fecha.</p>
      ) : null}
    </div>
  );
}

function CompactTable({
  items,
  qs,
}: {
  items: TodayItem[];
  qs: (o: Record<string, string>) => string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-edge text-left text-[11px] font-semibold tracking-wider text-faint uppercase">
            {["Tipo", "Título", "Empresa", "Responsable", "Estado", "Prioridad", "Fecha", "SLA", "Tiempo", "Actualizado"].map((h) => (
              <th key={h} className="px-4 py-2.5">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-edge">
          {items.slice(0, 100).map((i) => (
            <tr key={`${i.kind}-${i.id}`} className="hover:bg-subtle">
              <td className="px-4 py-2 text-xs text-muted">{KIND_LABEL[i.kind]}</td>
              <td className="px-4 py-2">
                <Link href={qs({ peek: `${i.kind === "ticket" ? "t" : "a"}:${i.id}` })} className="font-medium text-fg hover:text-primary">
                  {i.folio ? `${i.folio} · ` : ""}{i.title}
                </Link>
              </td>
              <td className="px-4 py-2 text-muted">{i.companyName ?? "—"}</td>
              <td className="px-4 py-2 text-muted">{i.assigneeName ?? "—"}</td>
              <td className="px-4 py-2">
                <Badge tone={statusMetaFor(i)?.tone ?? "slate"}>{statusMetaFor(i)?.label ?? i.status}</Badge>
              </td>
              <td className="px-4 py-2 text-muted">{i.priority}</td>
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
async function ContinueLearningCard({ user }: { user: SessionUser }) {
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
        <span className="block text-xs font-semibold tracking-wide text-faint uppercase">Continuar aprendiendo</span>
        <span className="block truncate text-sm font-medium text-fg">{continueItem.title}</span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-primary" aria-hidden />
    </Link>
  );
}

/* ============================================================== REMINDERS */

async function RemindersSection({ user, now }: { user: SessionUser; now: Date }) {
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
    return <SectionError title="No olvides" />;
  }

  return (
      <Card className="overflow-hidden">
        <CardHeader
          title="No olvides"
          description="Reglas sobre datos reales — nada se inventa. Posponer o resolver queda auditado."
          action={<Bell className="size-4 text-faint" />}
        />
        {reminders.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">
            Nada pendiente de recordar. Los recordatorios reaparecen solos si una
            condición vuelve a presentarse.
          </p>
        ) : (
          <ul className="divide-y divide-edge">
            {reminders.map((r) => (
              <li key={`${r.ruleKey}-${r.entityType}-${r.entityId}`} className="flex flex-wrap items-start justify-between gap-2 px-5 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge tone={r.severity === "high" ? "red" : r.severity === "medium" ? "amber" : "slate"}>
                      {r.severity === "high" ? "Alta" : r.severity === "medium" ? "Media" : "Baja"}
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
}: {
  user: SessionUser;
  msgFilter: string;
  qs: (o: Record<string, string>) => string;
}) {
  let all: Awaited<ReturnType<typeof getRecentMessages>>;
  let mentions: Awaited<ReturnType<typeof getUserUnreadMentions>>;
  try {
    [all, mentions] = await Promise.all([
      getRecentMessages(user.organizationId),
      getUserUnreadMentions(user.organizationId, Number(user.id), 5),
    ]);
  } catch {
    return <SectionError title="Mensajes recientes" />;
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
          title="Mensajes recientes"
          description="Última interacción por conversación — la bandeja completa vive en Inbox."
          action={
            <span className="flex gap-1 text-xs">
              {[["unattended", "No atendidos"], ["mine", "Míos"], ["unassigned", "Sin asignar"], ["all", "Todos"]].map(([k, label]) => (
                <Link
                  key={k}
                  href={qs({ msg: k })}
                  className={cx(
                    "rounded-md px-2 py-1 transition-colors",
                    msgFilter === k ? "bg-primary-soft font-medium text-primary" : "text-muted hover:bg-subtle",
                  )}
                >
                  {label}
                </Link>
              ))}
            </span>
          }
        />
        {mentions.length > 0 ? (
          <div className="border-b border-edge bg-primary-soft/40 px-5 py-3">
            <p className="mb-1.5 text-xs font-semibold text-primary">
              Te mencionaron ({mentions.length})
            </p>
            <ul className="space-y-1">
              {mentions.map((m) => (
                <li key={m.mentionId} className="truncate text-xs text-muted">
                  <Link href={`/inbox?c=${m.conversationId}`} className="hover:text-primary">
                    <span className="font-medium text-fg">{m.authorName ?? "Alguien"}</span>
                    {m.companyName ? ` · ${m.companyName}` : ""}: {m.body.slice(0, 90)}
                  </Link>
                </li>
              ))}
            </ul>
            <Link href="/inbox?view=mentions" className="mt-1.5 inline-block text-xs text-primary hover:underline">
              Ver todas en Inbox →
            </Link>
          </div>
        ) : null}
        {rows.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">Sin conversaciones en este filtro.</p>
        ) : (
          <ul className="divide-y divide-edge">
            {rows.map((m) => (
              <li key={m.conversationId} className="space-y-1 px-5 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/helpdesk/${m.ticketId}?tab=conversation`} className="min-w-0 truncate text-sm font-medium text-fg hover:text-primary">
                    <span className="mr-1 font-mono text-xs text-faint">{m.folio}</span>
                    {m.companyName ?? "Sin cliente"}
                    {m.contact ? ` · ${m.contact}` : ""}
                  </Link>
                  <span className="flex items-center gap-2 text-xs text-faint">
                    <Badge tone={m.direction === "inbound" ? "amber" : "slate"}>
                      {m.direction === "inbound" ? "Recibido" : "Enviado"} · {m.channel}
                    </Badge>
                    {fmtDateTime(m.occurredAt)}
                  </span>
                </div>
                <p className="truncate text-xs text-muted">{m.body}</p>
                <div className="flex flex-wrap items-center gap-2 pt-0.5 text-xs text-faint">
                  <span>{m.assigneeName ?? "Sin responsable"}</span>
                  <Link href={`/helpdesk/${m.ticketId}?tab=conversation#composer`} className={cx(buttonSecondaryClass, "h-7 px-2 text-xs")}>
                    Registrar respuesta
                  </Link>
                  {m.conversationStatus !== "closed" && m.conversationStatus !== "archived" ? (
                    <AttendConversationButton conversationId={m.conversationId} />
                  ) : (
                    <Badge tone="green">Atendida</Badge>
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
}: {
  user: SessionUser;
  peek: string;
  closeHref: string;
}) {
  const match = /^(t|a):(\d+)$/.exec(peek);
  if (!match) return null;
  const kind = match[1] === "t" ? "ticket" : "activity";
  const id = Number(match[2]);

  let item: TodayItem | undefined;
  let userRows: { id: number; name: string }[];
  try {
    const items = await getTodayItems(user, "org");
    item = items.find(
      (i) => i.id === id && (kind === "ticket" ? i.kind === "ticket" : i.kind !== "ticket"),
    );
    userRows = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(and(eq(users.organizationId, user.organizationId), ne(users.role, "client")))
      .orderBy(asc(users.name));
  } catch {
    return null;
  }
  if (!item) return null;
  const detailHref = kind === "ticket" ? `/helpdesk/${item.id}` : `/activities/${item.id}`;

  return (
      <div className="fixed inset-0 z-50 flex justify-end bg-black/30" role="dialog" aria-label="Quick View">
        <Link href={closeHref} className="flex-1" aria-label="Cerrar" />
        <div className="h-full w-full max-w-md overflow-y-auto border-l border-edge bg-surface p-6 shadow-xl">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs text-faint">
                {KIND_LABEL[item.kind]}
                {item.folio ? ` · ${item.folio}` : ""}
              </div>
              <h2 className="text-lg font-semibold text-fg">{item.title}</h2>
            </div>
            <Link href={closeHref} aria-label="Cerrar" className="rounded-md p-1 text-faint hover:bg-subtle hover:text-fg">
              <X className="size-4" />
            </Link>
          </div>
          <dl className="space-y-2 text-sm">
            <QVRow label="Empresa" value={item.companyName ?? "—"} />
            <QVRow label="Responsable" value={item.assigneeName ?? "Sin responsable"} />
            <QVRow label="Estado" value={statusMetaFor(item)?.label ?? item.status} />
            <QVRow label="Prioridad" value={ticketPriorityMeta[item.priority]?.label ?? item.priority} />
            <QVRow
              label="Fecha"
              value={item.dueDate ? fmtDate(item.dueDate) : item.resolutionTargetAt ? fmtDateTime(item.resolutionTargetAt) : "Sin fecha"}
            />
            {item.slaName ? <QVRow label="SLA" value={item.slaName} /> : null}
            {item.kind === "ticket" && item.billingStatus ? (
              <QVRow label="Cobro" value={ticketBillingMeta[item.billingStatus]?.label ?? item.billingStatus} />
            ) : null}
            {item.activityType ? (
              <QVRow label="Tipo" value={activityTypeMeta[item.activityType]?.label ?? item.activityType} />
            ) : null}
            <QVRow label="Tiempo registrado" value={item.minutes > 0 ? formatMinutes(item.minutes) : "—"} />
          </dl>
          <div className="mt-5 space-y-3 border-t border-edge pt-4">
            <InlineActions item={item} users={userRows} qs={() => closeHref} />
            <div className="flex flex-wrap gap-2">
              <Link href={detailHref} className={buttonClass}>
                Abrir detalle completo
              </Link>
              {item.kind === "ticket" ? (
                <>
                  <Link href={`${detailHref}?tab=time`} className={buttonSecondaryClass}>
                    Registrar tiempo
                  </Link>
                  <Link href={`${detailHref}?tab=resolution`} className={buttonSecondaryClass}>
                    Resolver / Cerrar
                  </Link>
                </>
              ) : (
                <Link href={`/activities/${item.id}/convert`} className={buttonSecondaryClass}>
                  Convertir en ticket
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
