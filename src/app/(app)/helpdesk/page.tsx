import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { Plus } from "lucide-react";
import { db } from "@/db";
import { companies, tickets, timeEntries, users, workItems } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { PageHeader, buttonClass } from "@/components/ui";
import { getStyledMeta } from "@/lib/catalog-styles";
import { getValuesForEntities, getFieldDefinitions } from "@/lib/custom-fields";
import {
  buildFieldRegistry,
  buildFilterSql,
  filterGroupSchema,
  ticketQuickFilterSql,
  toPublicFields,
  TICKET_FIELDS,
  TICKET_QUICK_FILTERS,
  type FilterGroup,
  type TicketQuickFilterKey,
} from "@/lib/filters";
import { getLastViewId } from "@/lib/last-view";
import { ticketPriorityMeta, ticketStatusMeta } from "@/lib/labels";
import { ensureInitialViews, getFavoriteIds, listViews, savedViewConfigSchema } from "@/lib/views";
import { TICKET_COLUMN_OPTIONS, TICKET_KANBAN_GROUP_OPTIONS, type TicketRow } from "./ticket-views";
import { TicketsViewContent } from "./tickets-view-content";

export const metadata: Metadata = { title: "Helpdesk" };

const BASE_PATH = "/helpdesk";

type Search = { view?: string; quick?: string; filters?: string; q?: string; status?: string; billing?: string };

export default async function HelpdeskPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  const params = await searchParams;
  const userId = Number(user.id);

  await ensureInitialViews(user.organizationId, "tickets", [
    { name: "Todos", viewType: "table" },
    { name: "Mis tickets", viewType: "table", quick: "mine" },
    { name: "Por estado", viewType: "kanban", kanbanGroupField: "status" },
  ]);
  const views = await listViews(user.organizationId, userId, "tickets");

  const lastViewId = await getLastViewId("tickets");
  const requestedViewId = Number(params.view);
  const activeView =
    views.find((v) => v.id === requestedViewId) ??
    (lastViewId ? views.find((v) => v.id === lastViewId) : undefined) ??
    views.find((v) => v.isDefault) ??
    views[0];

  const viewConfig = savedViewConfigSchema.parse(activeView.config);
  const quick = (params.quick as TicketQuickFilterKey | undefined) ?? (viewConfig.quick as TicketQuickFilterKey | null) ?? null;
  const search = params.q ?? viewConfig.search ?? "";
  let filters: FilterGroup | null = viewConfig.filters ?? null;
  if (params.filters) {
    const parsed = filterGroupSchema.safeParse(JSON.parse(params.filters));
    if (parsed.success) filters = parsed.data;
  }

  const customFieldDefs = await getFieldDefinitions(user.organizationId, "tickets", { activeOnly: true });
  const fieldRegistry = await buildFieldRegistry(TICKET_FIELDS, customFieldDefs);

  const favoriteIds = await getFavoriteIds(user.organizationId, userId, "tickets");

  const conditions = [eq(tickets.organizationId, user.organizationId)];
  const filterSql = buildFilterSql(filters, fieldRegistry, "tickets", tickets.id);
  if (filterSql) conditions.push(filterSql);
  if (quick) {
    const qSql = ticketQuickFilterSql(quick, userId, favoriteIds);
    if (qSql) conditions.push(qSql);
  }
  if (search.trim()) {
    const term = `%${search.trim()}%`;
    conditions.push(or(ilike(workItems.title, term), ilike(tickets.folio, term))!);
  }
  // Direct status/billing passthrough — bookmarkable dashboard/indicator
  // drill-down links (today/page.tsx, lib/indicators.ts) that don't map to
  // a quick filter or saved view.
  if (params.status && (workItems.status.enumValues as readonly string[]).includes(params.status)) {
    conditions.push(eq(workItems.status, params.status as (typeof workItems.status.enumValues)[number]));
  }
  if (params.billing && (tickets.billingStatus.enumValues as readonly string[]).includes(params.billing)) {
    conditions.push(eq(tickets.billingStatus, params.billing as (typeof tickets.billingStatus.enumValues)[number]));
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

  // Kanban shows the whole board regardless of the view's saved pageSize (a
  // capped page would silently hide cards in later columns).
  const limit = activeView.viewType === "kanban" ? 500 : viewConfig.pageSize;

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
    .limit(limit);

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

      <TicketsViewContent
        views={views}
        activeViewId={activeView.id}
        currentUserId={userId}
        currentUserRole={user.role}
        orgUsers={userRows}
        basePath={BASE_PATH}
        rows={rows}
        users={userRows}
        customFieldDefs={customFieldDefs.map((f) => ({ key: f.key, name: f.name }))}
        statusStyles={statusStyles}
        priorityStyles={priorityStyles}
        fields={toPublicFields(fieldRegistry)}
        quickFilters={TICKET_QUICK_FILTERS}
        activeQuick={quick}
        activeFilters={filters}
        activeSearch={search}
        columnOptions={TICKET_COLUMN_OPTIONS}
        kanbanGroupOptions={TICKET_KANBAN_GROUP_OPTIONS}
      />
    </div>
  );
}
