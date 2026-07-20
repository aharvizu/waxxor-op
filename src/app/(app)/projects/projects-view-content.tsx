"use client";

import { FilterBar } from "@/components/views/filter-bar";
import { ViewSwitcher, canEditViewClient } from "@/components/views/view-switcher";
import { ViewToolbar } from "@/components/views/view-toolbar";
import { useViewConfig } from "@/components/views/use-view-config";
import type { PublicFieldDefinition, FilterGroup } from "@/lib/filters";
import type { SavedView } from "@/lib/views";
import type { Role } from "@/lib/roles";
import { KanbanView, ListView, TableView, type ProjectRow } from "./project-views";

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
  fields,
  quickFilters,
  activeQuick,
  activeFilters,
  activeSearch,
  columnOptions,
  kanbanGroupOptions,
}: {
  views: SavedView[];
  activeViewId: number;
  currentUserId: number;
  currentUserRole: Role;
  orgUsers: { id: number; name: string }[];
  basePath: string;
  rows: ProjectRow[];
  fields: Record<string, PublicFieldDefinition>;
  quickFilters: { key: string; label: string }[];
  activeQuick: string | null;
  activeFilters: FilterGroup | null;
  activeSearch: string;
  columnOptions: { key: string; label: string }[];
  kanbanGroupOptions: { key: string; label: string }[];
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
        columnOptions={view.viewType === "table" ? columnOptions : []}
        groupByOptions={view.viewType === "kanban" ? kanbanGroupOptions : []}
      />

      {view.viewType === "table" ? (
        <TableView rows={rows} columns={config.columns.filter((c) => c.visible).map((c) => c.key)} basePath={basePath} />
      ) : view.viewType === "kanban" ? (
        <KanbanView rows={rows} groupField={config.kanban.groupField === "healthStatus" ? "healthStatus" : "status"} />
      ) : (
        <ListView rows={rows} basePath={basePath} />
      )}
    </>
  );
}
