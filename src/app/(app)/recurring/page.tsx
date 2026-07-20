import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, ilike, isNull, sql } from "drizzle-orm";
import { Plus } from "lucide-react";
import { db } from "@/db";
import { companies, projects, recurrenceDefinitions, users } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { PageHeader, buttonClass } from "@/components/ui";
import {
  RECURRENCE_FIELDS,
  RECURRENCE_QUICK_FILTERS,
  recurrenceQuickFilterSql,
  buildFieldRegistry,
  buildFilterSql,
  filterGroupSchema,
  toPublicFields,
  type FilterGroup,
  type RecurrenceQuickFilterKey,
} from "@/lib/filters";
import { getLastViewId } from "@/lib/last-view";
import { ensureInitialViews, getFavoriteIds, listViews, savedViewConfigSchema } from "@/lib/views";
import type { RecurrenceRow } from "./recurrence-views";
import { RecurringViewContent } from "./recurring-view-content";

export const metadata: Metadata = { title: "Recurring" };

const BASE_PATH = "/recurring";

const KANBAN_GROUP_OPTIONS = [{ key: "status", label: "Estado" }];

type Search = { view?: string; quick?: string; filters?: string; q?: string; status?: string };

export default async function RecurringPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  const params = await searchParams;
  const userId = Number(user.id);

  await ensureInitialViews(user.organizationId, "recurring", [
    { name: "Todas", viewType: "table" },
    { name: "Mis recurrencias", viewType: "table", quick: "mine" },
    { name: "Por estado", viewType: "kanban", kanbanGroupField: "status" },
  ]);
  const views = await listViews(user.organizationId, userId, "recurring");

  const lastViewId = await getLastViewId("recurring");
  const requestedViewId = Number(params.view);
  const activeView =
    views.find((v) => v.id === requestedViewId) ??
    (lastViewId ? views.find((v) => v.id === lastViewId) : undefined) ??
    views.find((v) => v.isDefault) ??
    views[0];

  const viewConfig = savedViewConfigSchema.parse(activeView.config);
  const quick = (params.quick as RecurrenceQuickFilterKey | undefined) ?? (viewConfig.quick as RecurrenceQuickFilterKey | null) ?? null;
  const search = params.q ?? viewConfig.search ?? "";
  let filters: FilterGroup | null = viewConfig.filters ?? null;
  if (params.filters) {
    const parsed = filterGroupSchema.safeParse(JSON.parse(params.filters));
    if (parsed.success) filters = parsed.data;
  }

  const fieldRegistry = await buildFieldRegistry(RECURRENCE_FIELDS, []);
  const favoriteIds = await getFavoriteIds(user.organizationId, userId, "recurring");

  // Structural baseline: archived definitions are hidden unless the "Por
  // estado" kanban is used (it shows every status, including archived).
  const conditions = [eq(recurrenceDefinitions.organizationId, user.organizationId)];
  if (activeView.viewType !== "kanban") {
    conditions.push(isNull(recurrenceDefinitions.archivedAt));
  }
  const filterSql = buildFilterSql(filters, fieldRegistry, "recurring", recurrenceDefinitions.id);
  if (filterSql) conditions.push(filterSql);
  if (quick) {
    const qSql = recurrenceQuickFilterSql(quick, userId);
    if (qSql) conditions.push(qSql);
  }
  if (search.trim()) {
    conditions.push(ilike(recurrenceDefinitions.name, `%${search.trim()}%`));
  }
  // Direct status passthrough — bookmarkable dashboard/indicator drill-down
  // links that don't map to a quick filter or saved view.
  if (params.status && (recurrenceDefinitions.status.enumValues as readonly string[]).includes(params.status)) {
    conditions.push(eq(recurrenceDefinitions.status, params.status as (typeof recurrenceDefinitions.status.enumValues)[number]));
  }

  const limit = activeView.viewType === "kanban" ? 500 : viewConfig.pageSize;

  const rawRows = await db
    .select({
      def: recurrenceDefinitions,
      companyName: companies.name,
      projectName: projects.name,
      assigneeName: users.name,
      lastResultStatus: sql<string | null>`(select e.status::text from recurrence_executions e
        where e.recurrence_definition_id = ${recurrenceDefinitions.id}
        order by e.created_at desc limit 1)`,
    })
    .from(recurrenceDefinitions)
    .leftJoin(companies, eq(recurrenceDefinitions.companyId, companies.id))
    .leftJoin(projects, eq(recurrenceDefinitions.projectId, projects.id))
    .leftJoin(users, eq(recurrenceDefinitions.assigneeId, users.id))
    .where(and(...conditions))
    .orderBy(recurrenceDefinitions.updatedAt)
    .limit(limit);

  const favoriteSet = new Set(favoriteIds);
  const rows: RecurrenceRow[] = rawRows.map((r) => ({
    ...r,
    isFavorite: favoriteSet.has(r.def.id),
  }));

  const orgUsers = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.organizationId, user.organizationId))
    .orderBy(asc(users.name));

  return (
    <div>
      <PageHeader
        title="Recurrentes"
        subtitle="Trabajo operativo que Watson crea, asigna y supervisa automáticamente."
        action={
          <Link href="/recurring/new" className={buttonClass}>
            <Plus className="size-4" /> Nueva recurrencia
          </Link>
        }
      />

      <RecurringViewContent
        views={views}
        activeViewId={activeView.id}
        currentUserId={userId}
        currentUserRole={user.role}
        orgUsers={orgUsers}
        basePath={BASE_PATH}
        rows={rows}
        fields={toPublicFields(fieldRegistry)}
        quickFilters={RECURRENCE_QUICK_FILTERS}
        activeQuick={quick}
        activeFilters={filters}
        activeSearch={search}
        kanbanGroupOptions={KANBAN_GROUP_OPTIONS}
      />
    </div>
  );
}
