import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, desc, eq, ilike, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { activities, companies, ticketStatuses, tickets, users, workItems } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { getOrgLocale } from "@/lib/get-org-locale";
import { getLabels } from "@/lib/labels";
import { t } from "@/lib/i18n";
import { ACTIVITY_STATUS_CATEGORY, type ActivityStatus } from "@/lib/activities";
import { TICKET_STATUS_CATEGORIES, listTicketPriorities, listTicketStatuses } from "@/lib/ticket-catalogs";
import {
  WORK_DEFAULT_QUICK,
  WORK_QUICK_FILTERS,
  buildDateRangeSql,
  buildFieldRegistry,
  buildFilterSql,
  buildWorkFields,
  dateRangeFilterSchema,
  filterGroupSchema,
  toPublicFields,
  workQuickFilterSql,
  type DateRangeFilter,
  type FilterGroup,
  type WorkQuickFilterKey,
} from "@/lib/filters";
import { PageHeader, buttonSecondaryClass, cx } from "@/components/ui";
import { WorkViewContent } from "./work-view-content";
import type { WorkRow } from "./work-views";

export const metadata: Metadata = { title: "Trabajo" };

const PAGE_SIZE = 50;
/** The board needs every card, so it is never paged (a capped page would hide lanes). */
const KANBAN_LIMIT = 500;

/**
 * **Trabajo** — Activities and Tickets in one list. Both are rows of the same
 * `work_items` table (docs/architecture/work-item-model.md), so this screen
 * adds no storage and no migration; it is a third reading of data that was
 * already unified, next to Hoy and Calendario.
 *
 * It does not replace `/activities` or `/helpdesk`: those keep their
 * type-exclusive columns (SLA, cobro, canal, tipo de actividad), their saved
 * views, and the 18 deep links that Indicadores, Hoy and Dashboard point at
 * them. This is the cross-type entry point, they are the specialist ones.
 *
 * Opens on "Pendientes" on purpose: 197 of 205 tickets are closed, so showing
 * everything by default would bury the ~16 live items under history.
 */
export default async function WorkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const locale = await getOrgLocale(user.organizationId);
  const userId = Number(user.id);

  const viewMode = params.view === "kanban" ? "kanban" : "table";
  const kind = params.kind === "ticket" || params.kind === "activity" ? params.kind : null;
  const quickKeys = WORK_QUICK_FILTERS.map((q) => q.key) as readonly string[];
  const quick = (quickKeys.includes(params.quick ?? "") ? params.quick : WORK_DEFAULT_QUICK) as WorkQuickFilterKey;
  const search = params.q ?? "";

  let filters: FilterGroup | null = null;
  if (params.filters) {
    const parsed = filterGroupSchema.safeParse(JSON.parse(params.filters));
    if (parsed.success) filters = parsed.data;
  }
  let dateRange: DateRangeFilter | null = null;
  if (params.dateRange) {
    const parsed = dateRangeFilterSchema.safeParse(JSON.parse(params.dateRange));
    if (parsed.success) dateRange = parsed.data;
  }

  const fieldRegistry = await buildFieldRegistry(buildWorkFields(locale), []);

  // Structural baseline, not a filter concern: only the two work-item types
  // this screen is about, and an activity that was converted into a ticket or
  // archived is not live work (its tombstone row stays joined, hence the
  // type-guarded predicate — a converted item's work_item is a ticket now).
  const conditions = [
    eq(workItems.organizationId, user.organizationId),
    or(eq(workItems.type, "ticket"), eq(workItems.type, "activity"))!,
    or(ne(workItems.type, "activity"), and(isNull(activities.convertedAt), isNull(activities.archivedAt)))!,
  ];
  if (kind) conditions.push(eq(workItems.type, kind));
  const quickSql = workQuickFilterSql(quick, userId);
  if (quickSql) conditions.push(quickSql);
  const filterSql = buildFilterSql(filters, fieldRegistry, "activities", workItems.id);
  if (filterSql) conditions.push(filterSql);
  const dateRangeSql = buildDateRangeSql(dateRange, fieldRegistry);
  if (dateRangeSql) conditions.push(dateRangeSql);
  if (search.trim()) {
    const term = `%${search.trim()}%`;
    conditions.push(
      or(
        ilike(workItems.title, term),
        ilike(tickets.folio, term),
        ilike(activities.folio, term),
        ilike(companies.name, term),
      )!,
    );
  }

  const isPaged = viewMode === "table";
  const limit = isPaged ? PAGE_SIZE : KANBAN_LIMIT;
  const page = isPaged ? Math.max(1, Number(params.page) || 1) : 1;
  const offset = isPaged ? (page - 1) * limit : 0;

  const baseQuery = () =>
    db
      .select({
        id: workItems.id,
        type: workItems.type,
        title: workItems.title,
        status: workItems.status,
        priority: workItems.priority,
        dueDate: workItems.dueDate,
        companyId: workItems.companyId,
        companyName: companies.name,
        assigneeId: workItems.assigneeId,
        assigneeName: users.name,
        ticketId: tickets.id,
        ticketFolio: tickets.folio,
        ticketStatusId: tickets.statusId,
        ticketPriorityId: tickets.priorityId,
        ticketStatusName: ticketStatuses.name,
        ticketStatusColor: ticketStatuses.color,
        ticketStatusCategory: ticketStatuses.category,
        activityId: activities.id,
        activityFolio: activities.folio,
      })
      .from(workItems)
      .leftJoin(tickets, eq(tickets.workItemId, workItems.id))
      .leftJoin(ticketStatuses, eq(tickets.statusId, ticketStatuses.id))
      .leftJoin(activities, eq(activities.workItemId, workItems.id))
      .leftJoin(companies, eq(workItems.companyId, companies.id))
      .leftJoin(users, eq(workItems.assigneeId, users.id));

  const [[{ totalCount }], rawRows, statusRows, priorityRows, orgUsers] = await Promise.all([
    db
      .select({ totalCount: sql<number>`count(*)::int` })
      .from(workItems)
      .leftJoin(tickets, eq(tickets.workItemId, workItems.id))
      .leftJoin(ticketStatuses, eq(tickets.statusId, ticketStatuses.id))
      .leftJoin(activities, eq(activities.workItemId, workItems.id))
      .leftJoin(companies, eq(workItems.companyId, companies.id))
      .where(and(...conditions)),
    baseQuery().where(and(...conditions)).orderBy(desc(workItems.updatedAt)).limit(limit).offset(offset),
    listTicketStatuses(user.organizationId, { includeInactive: true }),
    listTicketPriorities(user.organizationId, { includeInactive: true }),
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(and(eq(users.organizationId, user.organizationId), ne(users.role, "client")))
      .orderBy(asc(users.name)),
  ]);

  const { activityStatusMeta } = getLabels(locale);

  // One resolution point for the two vocabularies: a ticket's stage comes from
  // the org's catalog row, an activity's from the shared static map. The client
  // only ever sees the resolved label + category, so no catalog module has to
  // cross the server/client boundary.
  const rows: WorkRow[] = rawRows.map((r) => {
    const isTicket = r.type === "ticket";
    return {
      id: r.id,
      entityId: (isTicket ? r.ticketId : r.activityId) ?? r.id,
      type: isTicket ? "ticket" : "activity",
      folio: (isTicket ? r.ticketFolio : r.activityFolio) ?? "—",
      title: r.title,
      statusLabel: isTicket
        ? (r.ticketStatusName ?? r.status)
        : (activityStatusMeta[r.status]?.label ?? r.status),
      statusColor: isTicket ? r.ticketStatusColor : null,
      category: isTicket
        ? (r.ticketStatusCategory ?? "open")
        : (ACTIVITY_STATUS_CATEGORY[r.status as ActivityStatus] ?? "open"),
      priority: r.priority,
      companyId: r.companyId,
      companyName: r.companyName,
      assigneeId: r.assigneeId,
      assigneeName: r.assigneeName,
      dueDate: r.dueDate,
      statusId: isTicket ? r.ticketStatusId : null,
      priorityId: isTicket ? r.ticketPriorityId : null,
    };
  });

  const buildHref = (patch: Record<string, string | undefined>) => {
    const next: Record<string, string | undefined> = {
      view: viewMode === "table" ? undefined : viewMode,
      kind: params.kind,
      quick: params.quick,
      q: params.q,
      filters: params.filters,
      dateRange: params.dateRange,
      ...patch,
    };
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) qs.set(k, v);
    const s = qs.toString();
    return s ? `/work?${s}` : "/work";
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div>
      <PageHeader
        title={t("Trabajo", "Work", locale)}
        subtitle={t(
          "Tickets y actividades en una sola lista. El folio y el ícono distinguen cada uno; el color es estado y prioridad.",
          "Tickets and activities in one list. The folio and icon tell them apart; colour means status and priority.",
          locale,
        )}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {/* Type filter — same idiom as Calendario's `kind` select. */}
        <form method="get" className="flex flex-wrap items-center gap-2">
          {viewMode !== "table" ? <input type="hidden" name="view" value={viewMode} /> : null}
          {params.quick ? <input type="hidden" name="quick" value={params.quick} /> : null}
          {params.q ? <input type="hidden" name="q" value={params.q} /> : null}
          <div className="flex rounded-lg border border-edge p-0.5">
            {([
              { value: "", label: t("Todo el trabajo", "All work", locale) },
              { value: "ticket", label: t("Solo tickets", "Tickets only", locale) },
              { value: "activity", label: t("Solo actividades", "Activities only", locale) },
            ] as const).map((o) => (
              <Link
                key={o.value}
                href={buildHref({ kind: o.value || undefined, page: undefined })}
                className={cx(
                  "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                  (kind ?? "") === o.value ? "bg-primary-soft text-primary" : "text-muted hover:bg-subtle hover:text-fg",
                )}
              >
                {o.label}
              </Link>
            ))}
          </div>
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted tabular-nums">
            {totalCount} {t("elementos", "items", locale)}
          </span>
          <div className="flex rounded-lg border border-edge p-0.5">
            {([
              { value: "table", label: t("Tabla", "Table", locale) },
              { value: "kanban", label: t("Tablero", "Board", locale) },
            ] as const).map((o) => (
              <Link
                key={o.value}
                href={buildHref({ view: o.value === "table" ? undefined : o.value, page: undefined })}
                className={cx(
                  "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                  viewMode === o.value ? "bg-primary-soft text-primary" : "text-muted hover:bg-subtle hover:text-fg",
                )}
              >
                {o.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <WorkViewContent
        rows={rows}
        fields={toPublicFields(fieldRegistry)}
        quickFilters={WORK_QUICK_FILTERS}
        activeQuick={quick}
        activeFilters={filters}
        activeSearch={search}
        activeDateRange={dateRange}
        viewMode={viewMode}
        categories={[...TICKET_STATUS_CATEGORIES]}
        ticketStatuses={statusRows.map((s) => ({ id: s.id, name: s.name, category: s.category, isActive: s.isActive }))}
        ticketPriorities={priorityRows.map((p) => ({ id: p.id, name: p.name, isActive: p.isActive }))}
        users={orgUsers}
        filtered={quick !== WORK_DEFAULT_QUICK || kind !== null || search.trim() !== "" || filters !== null || dateRange !== null}
      />

      {isPaged && totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-end gap-2">
          <span className="text-xs text-muted tabular-nums">
            {page} / {totalPages}
          </span>
          {page > 1 ? (
            <Link href={buildHref({ page: String(page - 1) })} className={buttonSecondaryClass}>
              ←
            </Link>
          ) : null}
          {page < totalPages ? (
            <Link href={buildHref({ page: String(page + 1) })} className={buttonSecondaryClass}>
              →
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
