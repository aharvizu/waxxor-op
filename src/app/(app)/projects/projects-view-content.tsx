"use client";

import { FilterBar } from "@/components/views/filter-bar";
import { ViewSwitcher, canEditViewClient } from "@/components/views/view-switcher";
import { ViewToolbar } from "@/components/views/view-toolbar";
import { useViewConfig } from "@/components/views/use-view-config";
import type { PublicFieldDefinition, FilterGroup } from "@/lib/filters";
import type { SavedView } from "@/lib/views";
import type { Role } from "@/lib/roles";
import type { ProjectGroupActivity } from "@/lib/project-data";
import { KanbanView, ListView, type ProjectRow } from "./project-views";
import { GroupedProjectsTable } from "./project-grouped-table";

/**
 * Client-side owner of the Views Engine experience for Projects. Mirrors
 * helpdesk/tickets-view-content.tsx — plain, already-fetched data props
 * only, no functions cross the server/client boundary.
 */
export function ProjectsViewContent({
  views,
  activeViewId,
  currentUserId,
  currentUserRole,
  orgUsers,
  basePath,
  rows,
  activities,
  fields,
  quickFilters,
  activeQuick,
  activeFilters,
  activeSearch,
  kanbanGroupOptions,
  page,
  totalCount,
}: {
  views: SavedView[];
  activeViewId: number;
  currentUserId: number;
  currentUserRole: Role;
  orgUsers: { id: number; name: string }[];
  basePath: string;
  rows: ProjectRow[];
  activities: ProjectGroupActivity[];
  fields: Record<string, PublicFieldDefinition>;
  quickFilters: { key: string; label: string }[];
  activeQuick: string | null;
  activeFilters: FilterGroup | null;
  activeSearch: string;
  kanbanGroupOptions: { key: string; label: string }[];
  page: number;
  totalCount: number;
}) {
  const view = views.find((v) => v.id === activeViewId) ?? views[0];
  const { config, setConfig, status, errorMessage, save, retry, discard, saveAsNewPersonal } = useViewConfig(view, basePath);
  const canEditDirectly = canEditViewClient(view, currentUserId, currentUserRole);

  async function saveFilters(nextFilters: FilterGroup | null) {
    setConfig((prev) => ({ ...prev, filters: nextFilters }));
  }

  return (
    <>
      <ViewSwitcher
        views={views}
        activeViewId={view.id}
        currentUserId={currentUserId}
        currentUserRole={currentUserRole}
        module="projects"
        basePath={basePath}
        orgUsers={orgUsers}
        pendingChanges={{ status, canEditDirectly, save, discard, saveAsNewPersonal }}
      />
      <FilterBar
        fields={fields}
        quickFilters={quickFilters}
        activeQuick={activeQuick}
        activeFilters={activeFilters}
        activeSearch={activeSearch}
        onSaveToView={saveFilters}
      />
      <ViewToolbar
        viewType={view.viewType}
        config={config}
        setConfig={setConfig}
        status={status}
        errorMessage={errorMessage}
        canEditDirectly={canEditDirectly}
        save={save}
        retry={retry}
        discard={discard}
        saveAsNewPersonal={saveAsNewPersonal}
        groupByOptions={view.viewType === "kanban" ? kanbanGroupOptions : []}
        page={page}
        totalCount={totalCount}
      />

      {view.viewType === "table" ? (
        <GroupedProjectsTable projects={rows} activities={activities} basePath={basePath} />
      ) : view.viewType === "kanban" ? (
        <KanbanView rows={rows} groupField={config.kanban.groupField === "healthStatus" ? "healthStatus" : "status"} />
      ) : (
        <ListView rows={rows} basePath={basePath} />
      )}
    </>
  );
}
