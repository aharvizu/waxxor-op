import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, desc, eq, ilike, isNull } from "drizzle-orm";
import { Plus } from "lucide-react";
import { db } from "@/db";
import { activities, companies, users, workItems } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { PageHeader, buttonClass } from "@/components/ui";
import { ACTIVITY_STATUSES, type ActivityStatus } from "@/lib/activities";
import {
  ACTIVITY_FIELDS,
  ACTIVITY_QUICK_FILTERS,
  activityQuickFilterSql,
  buildFieldRegistry,
  buildFilterSql,
  filterGroupSchema,
  toPublicFields,
  type ActivityQuickFilterKey,
  type FilterGroup,
} from "@/lib/filters";
import { getLastViewId } from "@/lib/last-view";
import { defaultViewConfig, ensureInitialViews, getFavoriteIds, listViews } from "@/lib/views";
import { ACTIVITY_COLUMN_OPTIONS, ACTIVITY_KANBAN_GROUP_OPTIONS, type ActivityRow } from "./activity-views";
import { ActivitiesViewContent } from "./activities-view-content";

export const metadata: Metadata = { title: "Activities" };

const BASE_PATH = "/activities";

type Search = { view?: string; quick?: string; filters?: string; q?: string; status?: string };

export default async function ActivitiesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  const params = await searchParams;
  const userId = Number(user.id);

  await ensureInitialViews(user.organizationId, "activities", [
    { name: "Todos", viewType: "table" },
    { name: "Mis actividades", viewType: "table", quick: "mine" },
    { name: "Por estado", viewType: "kanban", kanbanGroupField: "status" },
  ]);
  const views = await listViews(user.organizationId, userId, "activities");

  const lastViewId = await getLastViewId("activities");
  const requestedViewId = Number(params.view);
  const activeView =
    views.find((v) => v.id === requestedViewId) ??
    (lastViewId ? views.find((v) => v.id === lastViewId) : undefined) ??
    views.find((v) => v.isDefault) ??
    views[0];

  const viewConfig = { ...defaultViewConfig(), ...(activeView.config as object) };
  const quick = (params.quick as ActivityQuickFilterKey | undefined) ?? (viewConfig.quick as ActivityQuickFilterKey | null) ?? null;
  const search = params.q ?? viewConfig.search ?? "";
  let filters: FilterGroup | null = viewConfig.filters ?? null;
  if (params.filters) {
    const parsed = filterGroupSchema.safeParse(JSON.parse(params.filters));
    if (parsed.success) filters = parsed.data;
  }

  const fieldRegistry = await buildFieldRegistry(ACTIVITY_FIELDS, []);
  const favoriteIds = await getFavoriteIds(user.organizationId, userId, "activities");

  // Structural baseline (not a view/filter concern): converted activities
  // live in Helpdesk now, and archived ones are hidden unless restored.
  const conditions = [
    eq(workItems.organizationId, user.organizationId),
    eq(workItems.type, "activity"),
    isNull(activities.convertedAt),
    isNull(activities.archivedAt),
  ];
  const filterSql = buildFilterSql(filters, fieldRegistry, "activities", activities.id);
  if (filterSql) conditions.push(filterSql);
  if (quick) {
    const qSql = activityQuickFilterSql(quick, userId);
    if (qSql) conditions.push(qSql);
  }
  if (search.trim()) {
    conditions.push(ilike(workItems.title, `%${search.trim()}%`));
  }
  // Direct status passthrough — bookmarkable dashboard/indicator drill-down
  // links that don't map to a quick filter or saved view.
  if (params.status && (ACTIVITY_STATUSES as readonly string[]).includes(params.status)) {
    conditions.push(eq(workItems.status, params.status as ActivityStatus));
  }

  // Kanban shows the whole board regardless of the view's saved pageSize (a
  // capped page would silently hide cards in later columns).
  const limit = activeView.viewType === "kanban" ? 500 : viewConfig.pageSize;

  const rawRows = await db
    .select({
      id: activities.id,
      title: workItems.title,
      status: workItems.status,
      priority: workItems.priority,
      activityType: activities.activityType,
      dueDate: workItems.dueDate,
      companyId: workItems.companyId,
      companyName: companies.name,
      assigneeId: workItems.assigneeId,
      assigneeName: users.name,
    })
    .from(activities)
    .innerJoin(workItems, eq(activities.workItemId, workItems.id))
    .leftJoin(companies, eq(workItems.companyId, companies.id))
    .leftJoin(users, eq(workItems.assigneeId, users.id))
    .where(and(...conditions))
    .orderBy(desc(workItems.updatedAt))
    .limit(limit);

  const favoriteSet = new Set(favoriteIds);
  const rows: ActivityRow[] = rawRows.map((r) => ({ ...r, isFavorite: favoriteSet.has(r.id) }));

  const orgUsers = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.organizationId, user.organizationId))
    .orderBy(asc(users.name));

  return (
    <div>
      <PageHeader
        title="Activities"
        subtitle="Standalone work — follow-ups, meetings, internal tasks — that isn't a ticket or a project."
        action={
          <Link href="/activities/new" className={buttonClass}>
            <Plus /> New activity
          </Link>
        }
      />

      <ActivitiesViewContent
        views={views}
        activeViewId={activeView.id}
        currentUserId={userId}
        currentUserRole={user.role}
        orgUsers={orgUsers}
        basePath={BASE_PATH}
        rows={rows}
        fields={toPublicFields(fieldRegistry)}
        quickFilters={ACTIVITY_QUICK_FILTERS}
        activeQuick={quick}
        activeFilters={filters}
        activeSearch={search}
        columnOptions={ACTIVITY_COLUMN_OPTIONS}
        kanbanGroupOptions={ACTIVITY_KANBAN_GROUP_OPTIONS}
      />
    </div>
  );
}
