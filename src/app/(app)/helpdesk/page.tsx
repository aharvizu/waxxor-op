import type { Metadata } from "next";
import { and, asc, desc, eq, ilike, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { companies, contacts, slaDefinitions, tickets, timeEntries, users, workItems } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/ui";
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
import { getCatalogNames } from "@/lib/settings-data";
import { listTicketBillingStatuses, listTicketPriorities, listTicketStatuses } from "@/lib/ticket-catalogs";
import { ensureInitialViews, listViews, savedViewConfigSchema } from "@/lib/views";
import { getOrgLocale } from "@/lib/get-org-locale";
import { t } from "@/lib/i18n";
import { NewTicketButton } from "./new/new-ticket-form";
import { buildTicketColumnOptions, buildTicketKanbanGroupOptions, type TicketRow } from "./ticket-columns";
import { TicketsViewContent } from "./tickets-view-content";

export const metadata: Metadata = { title: "Helpdesk" };

const BASE_PATH = "/helpdesk";

type Search = { view?: string; quick?: string; filters?: string; q?: string; status?: string; billing?: string };

export default async function HelpdeskPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  const locale = await getOrgLocale(user.organizationId);
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

  const [statusRows, priorityRows, billingRows] = await Promise.all([
    listTicketStatuses(user.organizationId, { includeInactive: true }),
    listTicketPriorities(user.organizationId, { includeInactive: true }),
    listTicketBillingStatuses(user.organizationId, { includeInactive: true }),
  ]);
  // ticket_status_style / ticket_priority_style (catalog-styles.ts) is now
  // obsolete for these two catalogs — dynamic tables carry the real
  // org-configured name + color directly, no cosmetic overlay needed.
  fieldRegistry.status = {
    ...fieldRegistry.status,
    column: tickets.statusId,
    options: statusRows.map((s) => ({ value: String(s.id), label: s.name })),
  };
  fieldRegistry.priority = {
    ...fieldRegistry.priority,
    column: tickets.priorityId,
    options: priorityRows.map((p) => ({ value: String(p.id), label: p.name })),
  };
  fieldRegistry.billingStatus = {
    ...fieldRegistry.billingStatus,
    column: tickets.billingStatusId,
    options: billingRows.map((b) => ({ value: String(b.id), label: b.name })),
  };

  const conditions = [eq(tickets.organizationId, user.organizationId)];
  const filterSql = buildFilterSql(filters, fieldRegistry, "tickets", tickets.id);
  if (filterSql) conditions.push(filterSql);
  if (quick) {
    const qSql = ticketQuickFilterSql(quick, userId);
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
      statusId: tickets.statusId,
      priorityId: tickets.priorityId,
      billingStatusId: tickets.billingStatusId,
      category: tickets.category,
      modality: tickets.modality,
      slaName: tickets.slaName,
      resolutionTargetAt: tickets.resolutionTargetAt,
      dueDate: workItems.dueDate,
      billingStatus: tickets.billingStatus,
      companyId: workItems.companyId,
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

  const rows: TicketRow[] = rawRows.map((r) => ({
    ...r,
    customFields: cfValuesByEntity.get(r.id) ?? {},
  }));

  const userRows = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.organizationId, user.organizationId))
    .orderBy(asc(users.name));

  const [companyRows, contactRows, assigneeRows, slaRows, categoryOptions] = await Promise.all([
    db
      .select({ id: companies.id, name: companies.name })
      .from(companies)
      .where(eq(companies.organizationId, user.organizationId))
      .orderBy(asc(companies.name)),
    db
      .select({ id: contacts.id, name: contacts.firstName, lastName: contacts.lastName, companyId: contacts.companyId })
      .from(contacts)
      .where(and(eq(contacts.organizationId, user.organizationId), eq(contacts.isActive, true)))
      .orderBy(asc(contacts.lastName)),
    // Excludes clients — assignee is an internal role, unlike `userRows` above (used for filters).
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(and(eq(users.organizationId, user.organizationId), ne(users.role, "client")))
      .orderBy(asc(users.name)),
    user.role === "superadmin"
      ? db
          .select({ id: slaDefinitions.id, name: slaDefinitions.name })
          .from(slaDefinitions)
          .where(eq(slaDefinitions.organizationId, user.organizationId))
          .orderBy(asc(slaDefinitions.name))
      : Promise.resolve([] as { id: number; name: string }[]),
    getCatalogNames(user.organizationId, "ticket_category"),
  ]);
  const contactOptions = contactRows.map((c) => ({ id: c.id, name: `${c.name} ${c.lastName}`, companyId: c.companyId }));
  const newTicketPriorities = priorityRows.map((p) => ({ id: p.id, name: p.name, isDefault: p.isDefault }));
  // Gives the "Empresa" filter condition a real picker (FilterBar renders any
  // field with options as a SearchableSelect) instead of a free-text input —
  // typing a name into a bare text box for an integer FK column crashed the
  // page (Postgres rejects e.g. companyId = 'Notaria 1').
  fieldRegistry.companyId = {
    ...fieldRegistry.companyId,
    options: companyRows.map((c) => ({ value: String(c.id), label: c.name })),
  };

  return (
    <div>
      <PageHeader
        title="Helpdesk"
        subtitle={t(
          "Tickets operativos: crear, asignar, trabajar, documentar, medir, resolver, confirmar, cerrar.",
          "Operational tickets: create, assign, work, document, measure, resolve, confirm, close.",
          locale,
        )}
        action={
          <NewTicketButton
            companies={companyRows}
            contacts={contactOptions}
            users={assigneeRows}
            slas={slaRows}
            priorities={newTicketPriorities}
            categoryOptions={categoryOptions}
            customFields={customFieldDefs}
          />
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
        statuses={statusRows}
        priorities={priorityRows}
        billingStatuses={billingRows}
        fields={toPublicFields(fieldRegistry)}
        quickFilters={TICKET_QUICK_FILTERS}
        activeQuick={quick}
        activeFilters={filters}
        activeSearch={search}
        columnOptions={buildTicketColumnOptions(locale)}
        kanbanGroupOptions={buildTicketKanbanGroupOptions(locale)}
      />
    </div>
  );
}
