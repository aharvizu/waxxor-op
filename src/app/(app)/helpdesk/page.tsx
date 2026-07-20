import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { Plus } from "lucide-react";
import { db } from "@/db";
import { companies, itemFavorites, tickets, timeEntries, users, workItems } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { PageHeader, buttonClass } from "@/components/ui";
import { getStyledMeta } from "@/lib/catalog-styles";
import { getValuesForEntities, getFieldDefinitions } from "@/lib/custom-fields";
import { buildFieldRegistry, buildFilterSql, filterGroupSchema, quickFilterSql, TICKET_FIELDS, toPublicFields, type FilterGroup, type QuickFilterKey } from "@/lib/filters";
import { ticketPriorityMeta, ticketStatusMeta } from "@/lib/labels";
import { createView, defaultViewConfig, getDefaultView, listViews, type SavedView } from "@/lib/views";
import { FilterBar } from "./filter-bar";
import { ViewSwitcher } from "./view-switcher";
import { buildColumnRegistry, CalendarView, KanbanView, ListView, TableView, TimelineView, type TicketRow } from "./ticket-views";
import { updateTicketViewConfig } from "./views-actions";

export const metadata: Metadata = { title: "Helpdesk" };

type Search = { view?: string; quick?: string; filters?: string; q?: string };

export default async function HelpdeskPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  const params = await searchParams;
  const userId = Number(user.id);

  let views = await listViews(user.organizationId, userId, "tickets");
  if (views.length === 0) {
    // First visit: bootstrap one default Table view so the switcher/filter bar always has something to show.
    await createView(user.organizationId, userId, { module: "tickets", name: "Todos", viewType: "table", isDefault: true });
    views = await listViews(user.organizationId, userId, "tickets");
  }

  const requestedViewId = Number(params.view);
  const activeView: SavedView =
    views.find((v) => v.id === requestedViewId) ??
    (await getDefaultView(user.organizationId, userId, "tickets")) ??
    views[0];

  const viewConfig = { ...defaultViewConfig(), ...(activeView.config as object) };
  const quick = (params.quick as QuickFilterKey | undefined) ?? null;
  const search = params.q ?? viewConfig.search ?? "";
  let filters: FilterGroup | null = viewConfig.filters ?? null;
  if (params.filters) {
    const parsed = filterGroupSchema.safeParse(JSON.parse(params.filters));
    if (parsed.success) filters = parsed.data;
  }

  const customFieldDefs = await getFieldDefinitions(user.organizationId, "tickets", { activeOnly: true });
  const fieldRegistry = await buildFieldRegistry(TICKET_FIELDS, customFieldDefs);

  const favoriteRows = await db
    .select({ entityId: itemFavorites.entityId })
    .from(itemFavorites)
    .where(and(eq(itemFavorites.userId, userId), eq(itemFavorites.module, "tickets")));
  const favoriteIds = favoriteRows.map((r) => r.entityId);

  const conditions = [eq(tickets.organizationId, user.organizationId)];
  const filterSql = buildFilterSql(filters, fieldRegistry, "tickets", tickets.id);
  if (filterSql) conditions.push(filterSql);
  if (quick) {
    const qSql = quickFilterSql(quick, userId, favoriteIds);
    if (qSql) conditions.push(qSql);
  }
  if (search.trim()) {
    const term = `%${search.trim()}%`;
    conditions.push(or(ilike(workItems.title, term), ilike(tickets.folio, term))!);
  }

  const timeByItem = db.$with("time_by_item").as(
    db
      .select({
        workItemId: timeEntries.workItemId,
        minutes: sql<number>`coalesce(sum(${timeEntries.durationMinutes}), 0)::int`.as("minutes"),
      })
      .from(timeEntries)
      .where(sql`${timeEntries.voidedAt} is null`)
      .groupBy(timeEntries.workItemId),
  );

  const sortColumn = viewConfig.sortBy?.field === "priority" ? workItems.priority : workItems.updatedAt;
  const orderFn = viewConfig.sortBy?.direction === "asc" ? asc : desc;

  const rawRows = await db
    .with(timeByItem)
    .select({
      id: tickets.id,
      folio: tickets.folio,
      title: workItems.title,
      status: workItems.status,
      priority: workItems.priority,
      category: tickets.category,
      slaName: tickets.slaName,
      resolutionTargetAt: tickets.resolutionTargetAt,
      billingStatus: tickets.billingStatus,
      companyName: companies.name,
      assigneeId: workItems.assigneeId,
      assigneeName: users.name,
      updatedAt: workItems.updatedAt,
      createdAt: workItems.createdAt,
      minutes: sql<number>`coalesce(${timeByItem.minutes}, 0)::int`,
    })
    .from(tickets)
    .innerJoin(workItems, eq(tickets.workItemId, workItems.id))
    .leftJoin(companies, eq(workItems.companyId, companies.id))
    .leftJoin(users, eq(workItems.assigneeId, users.id))
    .leftJoin(timeByItem, eq(timeByItem.workItemId, workItems.id))
    .where(and(...conditions))
    .orderBy(orderFn(sortColumn))
    .limit(viewConfig.pageSize);

  const ticketIds = rawRows.map((r) => r.id);
  const cfValuesByEntity = await getValuesForEntities(user.organizationId, "tickets", ticketIds);
  const favoriteSet = new Set(favoriteIds);

  const rows: TicketRow[] = rawRows.map((r) => ({
    ...r,
    isFavorite: favoriteSet.has(r.id),
    customFields: cfValuesByEntity.get(r.id) ?? {},
  }));

  const [userRows, statusStyles, priorityStyles] = await Promise.all([
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(eq(users.organizationId, user.organizationId))
      .orderBy(asc(users.name)),
    getStyledMeta(user.organizationId, "ticket_status_style", ticketStatusMeta),
    getStyledMeta(user.organizationId, "ticket_priority_style", ticketPriorityMeta),
  ]);
  const columnRegistry = buildColumnRegistry(customFieldDefs.map((f) => ({ key: f.key, name: f.name })));

  async function saveFilters(nextFilters: FilterGroup | null) {
    "use server";
    const fd = new FormData();
    fd.set("id", String(activeView.id));
    fd.set("config", JSON.stringify({ ...viewConfig, filters: nextFilters }));
    await updateTicketViewConfig(null, fd);
  }

  return (
    <div>
      <PageHeader
        title="Helpdesk"
        subtitle="Tickets operativos: crear, asignar, trabajar, documentar, medir, resolver, confirmar, cerrar."
        action={
          <Link href="/helpdesk/new" className={buttonClass}>
            <Plus /> Nuevo ticket
          </Link>
        }
      />

      <ViewSwitcher views={views} activeViewId={activeView.id} currentUserId={userId} />
      <FilterBar fields={toPublicFields(fieldRegistry)} activeQuick={quick} activeFilters={filters} activeSearch={search} onSaveToView={saveFilters} />

      {activeView.viewType === "table" ? (
        <TableView
          rows={rows}
          columns={viewConfig.columns.filter((c) => c.visible).map((c) => c.key)}
          registry={columnRegistry}
          users={userRows}
        />
      ) : activeView.viewType === "list" ? (
        <ListView rows={rows} />
      ) : activeView.viewType === "kanban" ? (
        <KanbanView
          rows={rows}
          groupByField={viewConfig.groupBy === "priority" ? "priority" : "status"}
          groupStyles={viewConfig.groupBy === "priority" ? priorityStyles : statusStyles}
          groupValues={viewConfig.groupBy === "priority" ? (Object.keys(priorityStyles)) : (Object.keys(statusStyles))}
        />
      ) : activeView.viewType === "calendar" ? (
        <CalendarView rows={rows} />
      ) : (
        <TimelineView rows={rows} />
      )}
    </div>
  );
}
