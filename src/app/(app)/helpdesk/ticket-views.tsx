"use client";

import { useMemo } from "react";
import Link from "next/link";
import { fmtDate } from "@/lib/format";
import { Card, EmptyState } from "@/components/ui";
import { LifeBuoy, Plus } from "lucide-react";
import { DataTable, type DataTableColumn, type DataTableColumnConfig } from "@/components/views/data-table";
import { toCatalogMap } from "@/lib/catalog-map";
import { useLocale } from "@/components/locale-provider";
import { t } from "@/lib/i18n";
import { TicketRowActions } from "./ticket-row-actions";
import { TicketKanban } from "./ticket-kanban";
import {
  CatalogChip,
  DEFAULT_COLUMNS,
  type ColumnDef,
  type TicketPriorityOption,
  type TicketRow,
  type TicketStatusOption,
} from "./ticket-columns";

export { toCatalogMap };
// Re-exported for existing importers ("./ticket-views" is the historical
// entry point) — but a server component must import buildTicketColumnOptions/
// buildTicketKanbanGroupOptions/buildColumnRegistry from "./ticket-columns"
// directly, since re-exporting through this "use client" module still turns
// them into client references that can't be called outside client rendering.
export * from "./ticket-columns";

/** Maps a column key to its sortable value — most columns mirror a TicketRow field directly, but `dueAt`/`cf_*` are aliases over resolutionTargetAt/customFields. */
function ticketSortValue(r: TicketRow, key: string): unknown {
  if (key === "dueAt") return r.resolutionTargetAt;
  if (key === "scheduledFor") return r.dueDate;
  if (key.startsWith("cf_")) return r.customFields[key.slice(3)];
  return r[key as keyof TicketRow];
}

function EmptyTickets({ createHref = "/helpdesk/new" }: { createHref?: string }) {
  const locale = useLocale();
  return (
    <EmptyState
      icon={<LifeBuoy />}
      title={t("Sin tickets", "No tickets", locale)}
      action={
        <Link href={createHref} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white">
          <Plus className="size-4" /> {t("Nuevo ticket", "New ticket", locale)}
        </Link>
      }
    >
      {t("Nada coincide con esta vista o filtros.", "Nothing matches this view or filters.", locale)}
    </EmptyState>
  );
}

/* ------------------------------------------------------------------ table */

export function TableView({
  rows,
  registry,
  columnConfig,
  onColumnConfigChange,
  users,
  statusOptions,
  priorityOptions,
  density,
}: {
  rows: TicketRow[];
  registry: Record<string, ColumnDef>;
  columnConfig: DataTableColumnConfig[];
  onColumnConfigChange: (updater: (prev: DataTableColumnConfig[]) => DataTableColumnConfig[]) => void;
  users: { id: number; name: string }[];
  statusOptions: TicketStatusOption[];
  priorityOptions: TicketPriorityOption[];
  density: "compact" | "comfortable" | "spacious";
}) {
  const dataTableRegistry = useMemo(() => {
    const out: Record<string, DataTableColumn<TicketRow>> = {};
    for (const key of Object.keys(registry)) {
      out[key] = { label: registry[key].label, render: registry[key].render, sortValue: (r) => ticketSortValue(r, key), align: key === "minutes" ? "right" : undefined };
    }
    return out;
  }, [registry]);

  return (
    <DataTable
      rows={rows}
      registry={dataTableRegistry}
      defaultColumnKeys={DEFAULT_COLUMNS}
      columnConfig={columnConfig}
      onColumnConfigChange={onColumnConfigChange}
      density={density}
      enableRowSelection
      emptyState={<EmptyTickets />}
      rowActions={(r) => (
        <TicketRowActions
          ticketId={r.id}
          statusId={r.statusId}
          priorityId={r.priorityId}
          assigneeId={r.assigneeId}
          users={users}
          statuses={statusOptions}
          priorities={priorityOptions}
        />
      )}
    />
  );
}

/* ------------------------------------------------------------------- list */

export function ListView({
  rows,
  statuses,
  priorities,
}: {
  rows: TicketRow[];
  statuses: Map<number, TicketStatusOption>;
  priorities: Map<number, TicketPriorityOption>;
}) {
  const locale = useLocale();
  if (rows.length === 0) return <EmptyTickets />;
  return (
    <Card className="overflow-hidden">
      <ul className="divide-y divide-edge">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 text-sm">
            <CatalogChip entry={statuses.get(r.statusId)} fallback={r.status} />
            <Link href={`/helpdesk/${r.id}`} className="min-w-0 flex-1 truncate font-medium text-fg hover:text-primary">
              {r.folio} · {r.title}
            </Link>
            {r.companyName && r.companyId ? (
              <Link href={`/companies/${r.companyId}`} className="hidden shrink-0 text-xs text-muted hover:text-primary hover:underline sm:inline">
                {r.companyName}
              </Link>
            ) : (
              <span className="hidden shrink-0 text-xs text-muted sm:inline">—</span>
            )}
            <CatalogChip entry={priorities.get(r.priorityId)} fallback={r.priority} />
            <span className="hidden w-28 shrink-0 truncate text-xs text-muted md:inline">{r.assigneeName ?? t("Sin asignar", "Unassigned", locale)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ---------------------------------------------------------------- kanban */

export function KanbanView({
  rows,
  groupField,
  statuses,
  priorities,
}: {
  rows: TicketRow[];
  groupField: "status" | "priority";
  statuses: TicketStatusOption[];
  priorities: TicketPriorityOption[];
}) {
  if (rows.length === 0) return <EmptyTickets />;
  return <TicketKanban rows={rows} groupField={groupField} statuses={statuses} priorities={priorities} />;
}

/* --------------------------------------------------------------- calendar */
/* Fuera de alcance este sprint (Calendar/Timeline) — se conserva el render
 * para no romper vistas ya existentes creadas en el sprint piloto; la
 * creación de vistas nuevas de este tipo ya no se ofrece (view-switcher.tsx). */

export function CalendarView({ rows, statuses }: { rows: TicketRow[]; statuses: Map<number, TicketStatusOption> }) {
  const locale = useLocale();
  const dated = rows.filter((r) => r.resolutionTargetAt);
  const undated = rows.filter((r) => !r.resolutionTargetAt);
  if (rows.length === 0) return <EmptyTickets />;

  const byDay = new Map<string, TicketRow[]>();
  for (const r of dated) {
    const key = fmtDate(r.resolutionTargetAt!);
    byDay.set(key, [...(byDay.get(key) ?? []), r]);
  }
  const days = [...byDay.keys()].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

  return (
    <div className="space-y-4">
      {days.map((day) => (
        <Card key={day} className="overflow-hidden">
          <div className="border-b border-edge bg-subtle px-4 py-2 text-xs font-semibold tracking-wide text-muted uppercase">{day}</div>
          <ul className="divide-y divide-edge">
            {byDay.get(day)!.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                <CatalogChip entry={statuses.get(r.statusId)} fallback={r.status} />
                <Link href={`/helpdesk/${r.id}`} className="min-w-0 flex-1 truncate font-medium text-fg hover:text-primary">{r.folio} · {r.title}</Link>
                {r.companyName && r.companyId ? (
                  <Link href={`/companies/${r.companyId}`} className="hidden shrink-0 text-xs text-muted hover:text-primary hover:underline sm:inline">
                    {r.companyName}
                  </Link>
                ) : (
                  <span className="hidden shrink-0 text-xs text-muted sm:inline">—</span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      ))}
      {undated.length > 0 ? (
        <Card className="overflow-hidden">
          <div className="border-b border-edge bg-subtle px-4 py-2 text-xs font-semibold tracking-wide text-muted uppercase">{t("Sin fecha de vencimiento", "No due date", locale)}</div>
          <ul className="divide-y divide-edge">
            {undated.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <CatalogChip entry={statuses.get(r.statusId)} fallback={r.status} />
                <Link href={`/helpdesk/${r.id}`} className="min-w-0 flex-1 truncate font-medium text-fg hover:text-primary">{r.folio} · {r.title}</Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------- timeline */

export function TimelineView({ rows, statuses }: { rows: TicketRow[]; statuses: Map<number, TicketStatusOption> }) {
  const locale = useLocale();
  if (rows.length === 0) return <EmptyTickets />;
  const sorted = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return (
    <Card className="overflow-hidden">
      <ul className="divide-y divide-edge">
        {sorted.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
            <div className="w-24 shrink-0 text-xs text-faint tabular-nums">{fmtDate(r.createdAt)}</div>
            <div className="hidden h-full w-px shrink-0 self-stretch bg-edge sm:block" aria-hidden />
            <CatalogChip entry={statuses.get(r.statusId)} fallback={r.status} />
            <Link href={`/helpdesk/${r.id}`} className="min-w-0 flex-1 truncate font-medium text-fg hover:text-primary">{r.folio} · {r.title}</Link>
            <div className="hidden w-28 shrink-0 text-right text-xs text-muted sm:block">
              {r.resolutionTargetAt
                ? `${t("vence", "due", locale)} ${fmtDate(r.resolutionTargetAt)}`
                : t("sin vencimiento", "no due date", locale)}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
