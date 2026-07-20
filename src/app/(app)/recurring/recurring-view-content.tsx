"use client";

import { FilterBar } from "@/components/views/filter-bar";
import { ViewSwitcher, canEditViewClient } from "@/components/views/view-switcher";
import { ViewToolbar } from "@/components/views/view-toolbar";
import { useViewConfig } from "@/components/views/use-view-config";
import type { PublicFieldDefinition, FilterGroup } from "@/lib/filters";
import type { SavedView } from "@/lib/views";
import type { Role } from "@/lib/roles";
import { KanbanView, ListView, TableView, type RecurrenceRow } from "./recurrence-views";

/**
 * Client-side owner of the Views Engine experience for Recurring. Mirrors
 * helpdesk/tickets-view-content.tsx and projects/projects-view-content.tsx —
 * plain, already-fetched data props only, no functions cross the
 * server/client boundary.
 */
export function RecurringViewContent({
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
  kanbanGroupOptions,
}: {
  views: SavedView[];
  activeViewId: number;
  currentUserId: number;
  currentUserRole: Role;
  orgUsers: { id: number; name: string }[];
  basePath: string;
  rows: RecurrenceRow[];
  fields: Record<string, PublicFieldDefinition>;
  quickFilters: { key: string; label: string }[];
  activeQuick: string | null;
  activeFilters: FilterGroup | null;
  activeSearch: string;
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
        module="recurring"
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
        columnOptions={[]}
        groupByOptions={view.viewType === "kanban" ? kanbanGroupOptions : []}
      />

      {view.viewType === "kanban" ? (
        <KanbanView rows={rows} />
      ) : view.viewType === "list" ? (
        <ListView rows={rows} basePath={basePath} />
      ) : (
        <TableView rows={rows} basePath={basePath} />
      )}
    </>
  );
}
