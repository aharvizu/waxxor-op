"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { FilterBar } from "@/components/views/filter-bar";
import type { DataTableColumnConfig } from "@/components/views/data-table";
import type { DateRangeFilter, FilterGroup, PublicFieldDefinition } from "@/lib/filters";
import { TicketRowActions } from "../helpdesk/ticket-row-actions";
import { WorkKanban, type WorkKanbanStatusOption } from "./work-kanban";
import { DEFAULT_WORK_COLUMNS, WorkTable, peekToken, type WorkRow } from "./work-views";

/**
 * Client-side owner of the combined Work screen. Reuses the shared FilterBar,
 * DataTable and KanbanBoard — no new controls were built for this screen.
 *
 * It deliberately does **not** use the Views Engine's saved views: Trabajo is a
 * cross-type view in the same family as Hoy and Calendario, which both drive
 * off query params, and wiring saved views would have meant a `config_module`
 * migration plus seeded views before anyone has used the screen once. Filters,
 * search and the date range already live in the URL (FilterBar puts them
 * there), so a view is bookmarkable and shareable today; column choices are
 * session-local until someone asks for them to stick.
 */
export function WorkViewContent({
  rows,
  fields,
  quickFilters,
  activeQuick,
  activeFilters,
  activeSearch,
  activeDateRange,
  viewMode,
  categories,
  ticketStatuses,
  ticketPriorities,
  users,
  filtered,
}: {
  rows: WorkRow[];
  fields: Record<string, PublicFieldDefinition>;
  quickFilters: { key: string; label: string }[];
  activeQuick: string | null;
  activeFilters: FilterGroup | null;
  activeSearch: string;
  activeDateRange: DateRangeFilter | null;
  viewMode: "table" | "kanban";
  categories: string[];
  ticketStatuses: WorkKanbanStatusOption[];
  /** Full catalog rows (active + inactive) that TicketRowActions filters itself. */
  ticketPriorities: { id: number; name: string; isActive: boolean }[];
  users: { id: number; name: string }[];
  filtered: boolean;
}) {
  const [columnConfig, setColumnConfig] = useState<DataTableColumnConfig[]>(
    DEFAULT_WORK_COLUMNS.map((key) => ({ key, visible: true, width: null })),
  );
  const searchParams = useSearchParams();

  // Keep every other param (filters, quick, kind, page, view) so closing the
  // panel lands back on exactly the list the person was looking at.
  function peekHref(row: WorkRow) {
    const qs = new URLSearchParams(searchParams.toString());
    qs.set("peek", peekToken(row));
    return `/work?${qs.toString()}`;
  }

  return (
    <>
      <FilterBar
        fields={fields}
        quickFilters={quickFilters}
        activeQuick={activeQuick}
        activeFilters={activeFilters}
        activeSearch={activeSearch}
        enableDateRange
        activeDateRange={activeDateRange}
      />

      {viewMode === "kanban" ? (
        <WorkKanban rows={rows} categories={categories} ticketStatuses={ticketStatuses} peekHref={peekHref} />
      ) : (
        <WorkTable
          rows={rows}
          columnConfig={columnConfig}
          onColumnConfigChange={(updater) => setColumnConfig((prev) => updater(prev))}
          filtered={filtered}
          peekHref={peekHref}
          // Activities have no row-action dropdown anywhere in Watson yet, so
          // only tickets get one here — inventing one for activities belongs
          // in the Activities module, not in this view.
          rowActions={(r) =>
            r.type === "ticket" && r.statusId !== null && r.priorityId !== null ? (
              <TicketRowActions
                ticketId={r.entityId}
                statusId={r.statusId}
                priorityId={r.priorityId}
                assigneeId={r.assigneeId}
                users={users}
                statuses={ticketStatuses}
                priorities={ticketPriorities}
              />
            ) : null
          }
        />
      )}
    </>
  );
}
