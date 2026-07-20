import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, desc, eq, ilike, or } from "drizzle-orm";
import { Plus } from "lucide-react";
import { db } from "@/db";
import { companies, projects, users } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { PageHeader, buttonClass } from "@/components/ui";
import { projectAggregates } from "@/lib/project-data";
import {
  buildFieldRegistry,
  buildFilterSql,
  filterGroupSchema,
  projectQuickFilterSql,
  toPublicFields,
  PROJECT_FIELDS,
  PROJECT_QUICK_FILTERS,
  type FilterGroup,
  type ProjectQuickFilterKey,
} from "@/lib/filters";
import { getLastViewId } from "@/lib/last-view";
import { defaultViewConfig, ensureInitialViews, getFavoriteIds, listViews } from "@/lib/views";
import { PROJECT_COLUMN_OPTIONS, PROJECT_KANBAN_GROUP_OPTIONS, type ProjectRow } from "./project-views";
import { ProjectsViewContent } from "./projects-view-content";

export const metadata: Metadata = { title: "Projects" };

const BASE_PATH = "/projects";

type Search = { view?: string; quick?: string; filters?: string; q?: string; status?: string };

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  const params = await searchParams;
  const userId = Number(user.id);

  await ensureInitialViews(user.organizationId, "projects", [
    { name: "Todos", viewType: "table" },
    { name: "Mis proyectos", viewType: "table", quick: "mine" },
    { name: "Activos", viewType: "table", quick: "active" },
    { name: "En riesgo", viewType: "table", quick: "at_risk" },
    { name: "Por estado", viewType: "kanban", kanbanGroupField: "status" },
  ]);
  const views = await listViews(user.organizationId, userId, "projects");

  const lastViewId = await getLastViewId("projects");
  const requestedViewId = Number(params.view);
  const activeView =
    views.find((v) => v.id === requestedViewId) ??
    (lastViewId ? views.find((v) => v.id === lastViewId) : undefined) ??
    views.find((v) => v.isDefault) ??
    views[0];

  const viewConfig = { ...defaultViewConfig(), ...(activeView.config as object) };
  const quick = (params.quick as ProjectQuickFilterKey | undefined) ?? (viewConfig.quick as ProjectQuickFilterKey | null) ?? null;
  const search = params.q ?? viewConfig.search ?? "";
  let filters: FilterGroup | null = viewConfig.filters ?? null;
  if (params.filters) {
    const parsed = filterGroupSchema.safeParse(JSON.parse(params.filters));
    if (parsed.success) filters = parsed.data;
  }

  const fieldRegistry = await buildFieldRegistry(PROJECT_FIELDS, []);
  const favoriteIds = await getFavoriteIds(user.organizationId, userId, "projects");

  const conditions = [eq(projects.organizationId, user.organizationId)];
  const filterSql = buildFilterSql(filters, fieldRegistry, "projects", projects.id);
  if (filterSql) conditions.push(filterSql);
  if (quick) {
    const qSql = projectQuickFilterSql(quick, userId);
    if (qSql) conditions.push(qSql);
  }
  if (search.trim()) {
    const term = `%${search.trim()}%`;
    conditions.push(or(ilike(projects.name, term), ilike(projects.folio, term))!);
  }
  // Direct status passthrough — bookmarkable dashboard/indicator drill-down
  // links that don't map to a quick filter or saved view.
  if (params.status && (projects.status.enumValues as readonly string[]).includes(params.status)) {
    conditions.push(eq(projects.status, params.status as (typeof projects.status.enumValues)[number]));
  }

  const agg = projectAggregates();

  // Kanban shows the whole board regardless of the view's saved pageSize (a
  // capped page would silently hide cards in later columns).
  const limit = activeView.viewType === "kanban" ? 500 : viewConfig.pageSize;

  const rawRows = await db
    .select({
      id: projects.id,
      folio: projects.folio,
      name: projects.name,
      status: projects.status,
      healthStatus: projects.healthStatus,
      priority: projects.priority,
      companyId: projects.companyId,
      companyName: companies.name,
      managerId: projects.projectManagerId,
      managerName: users.name,
      targetDate: projects.targetDate,
      total: agg.total,
      completed: agg.completed,
      overdue: agg.overdue,
      nextMilestone: agg.nextMilestone,
      loggedMinutes: agg.loggedMinutes,
    })
    .from(projects)
    .leftJoin(companies, eq(projects.companyId, companies.id))
    .leftJoin(users, eq(projects.projectManagerId, users.id))
    .where(and(...conditions))
    .orderBy(desc(projects.updatedAt))
    .limit(limit);

  const favoriteSet = new Set(favoriteIds);
  const rows: ProjectRow[] = rawRows.map((r) => {
    const percent = r.total === 0 ? 0 : Math.round((r.completed / r.total) * 100);
    return {
      id: r.id,
      folio: r.folio,
      name: r.name,
      status: r.status,
      healthStatus: r.healthStatus,
      priority: r.priority,
      companyId: r.companyId,
      companyName: r.companyName,
      managerId: r.managerId,
      managerName: r.managerName,
      targetDate: r.targetDate,
      percent,
      pending: r.total - r.completed,
      overdue: r.overdue,
      nextMilestone: r.nextMilestone,
      loggedMinutes: r.loggedMinutes,
      isFavorite: favoriteSet.has(r.id),
    };
  });

  const canCreate = ["superadmin", "administrator", "director", "project_manager"].includes(user.role);

  const orgUsers = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.organizationId, user.organizationId))
    .orderBy(asc(users.name));

  return (
    <div>
      <PageHeader
        title="Proyectos"
        subtitle="Proyecto → Listas → Actividades → Subactividades. Los tickets nunca viven aquí."
        action={
          canCreate ? (
            <Link href="/projects/new" className={buttonClass}>
              <Plus className="size-4" /> Nuevo proyecto
            </Link>
          ) : undefined
        }
      />

      <ProjectsViewContent
        views={views}
        activeViewId={activeView.id}
        currentUserId={userId}
        currentUserRole={user.role}
        orgUsers={orgUsers}
        basePath={BASE_PATH}
        rows={rows}
        fields={toPublicFields(fieldRegistry)}
        quickFilters={PROJECT_QUICK_FILTERS}
        activeQuick={quick}
        activeFilters={filters}
        activeSearch={search}
        columnOptions={PROJECT_COLUMN_OPTIONS}
        kanbanGroupOptions={PROJECT_KANBAN_GROUP_OPTIONS}
      />
    </div>
  );
}
