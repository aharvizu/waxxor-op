"use client";

import { FilterBar } from "@/components/views/filter-bar";
import { ViewSwitcher, canEditViewClient } from "@/components/views/view-switcher";
import { ViewToolbar } from "@/components/views/view-toolbar";
import { useViewConfig } from "@/components/views/use-view-config";
import type { PublicFieldDefinition, FilterGroup } from "@/lib/filters";
import type { SavedView } from "@/lib/views";
import type { Role } from "@/lib/roles";
import { buildColumnRegistry, CalendarView, KanbanView, ListView, TableView, TimelineView, type TicketRow } from "./ticket-views";
import type { StyledMeta } from "@/lib/catalog-styles";

/**
 * Client-side owner of the Views Engine experience for Tickets: renders the
 * shared ViewSwitcher + FilterBar + ViewToolbar (the save-state machine
 * lives in useViewConfig, see components/views/use-view-config.ts) and then
 * the right presentation for the active view's type. Plain, already-fetched
 * data props only — no functions cross the server/client boundary.
 */
export function TicketsViewContent({
  views,
  activeViewId,
  currentUserId,
  currentUserRole,
  orgUsers,
  basePath,
  rows,
  users,
  customFieldDefs,
  statusStyles,
  priorityStyles,
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
  rows: TicketRow[];
  users: { id: number; name: string }[];
  customFieldDefs: { key: string; name: string }[];
  statusStyles: Record<string, StyledMeta>;
  priorityStyles: Record<string, StyledMeta>;
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
  const registry = buildColumnRegistry(customFieldDefs);

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
        module="tickets"
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
        <TableView rows={rows} columns={config.columns.filter((c) => c.visible).map((c) => c.key)} registry={registry} users={users} basePath={basePath} />
      ) : view.viewType === "list" ? (
        <ListView rows={rows} basePath={basePath} />
      ) : view.viewType === "kanban" ? (
        <KanbanView
          rows={rows}
          groupField={config.kanban.groupField === "priority" ? "priority" : "status"}
          statusStyles={statusStyles}
          priorityStyles={priorityStyles}
        />
      ) : view.viewType === "calendar" ? (
        <CalendarView rows={rows} />
      ) : (
        <TimelineView rows={rows} />
      )}
    </>
  );
}
