"use client";

import { FilterBar } from "@/components/views/filter-bar";
import { ViewSwitcher, canEditViewClient } from "@/components/views/view-switcher";
import { ViewToolbar } from "@/components/views/view-toolbar";
import { useViewConfig } from "@/components/views/use-view-config";
import type { PublicFieldDefinition, FilterGroup } from "@/lib/filters";
import type { SavedView } from "@/lib/views";
import type { Role } from "@/lib/roles";
import { CONTACT_COLUMN_OPTIONS, KanbanView, ListView, TableView, type ContactRow } from "./contact-views";

/**
 * Client-side owner of the Views Engine experience for Contactos. Mirrors
 * companies/companies-view-content.tsx.
 */
export function ContactsViewContent({
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
}: {
  views: SavedView[];
  activeViewId: number;
  currentUserId: number;
  currentUserRole: Role;
  orgUsers: { id: number; name: string }[];
  basePath: string;
  rows: ContactRow[];
  fields: Record<string, PublicFieldDefinition>;
  quickFilters: { key: string; label: string }[];
  activeQuick: string | null;
  activeFilters: FilterGroup | null;
  activeSearch: string;
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
        module="contacts"
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
        columnOptions={view.viewType === "table" ? CONTACT_COLUMN_OPTIONS : []}
      />

      {view.viewType === "table" ? (
        <TableView
          rows={rows}
          columnConfig={config.columns}
          onColumnConfigChange={(updater) => setConfig((prev) => ({ ...prev, columns: updater(prev.columns) }))}
          density={config.density}
        />
      ) : view.viewType === "kanban" ? (
        <KanbanView rows={rows} />
      ) : (
        <ListView rows={rows} />
      )}
    </>
  );
}
