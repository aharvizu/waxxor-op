"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { fmtDate, fmtDateTime } from "@/lib/format";
import type { TicketStatusCategoryValue } from "@/lib/ticket-catalogs";
import { formatMinutes } from "@/lib/time-entries";
import { Badge, Card, EmptyState, THead, Table, Td, Th, cx } from "@/components/ui";
import { LifeBuoy, Plus } from "lucide-react";
import { compareValues, nextSortState, SortableTh, type SortState } from "@/components/views/sortable-th";
import { TicketRowActions } from "./ticket-row-actions";
import { TicketKanban } from "./ticket-kanban";

export type TicketRow = {
  id: number;
  folio: string;
  title: string;
  status: string;
  priority: string;
  statusId: number;
  priorityId: number;
  billingStatusId: number;
  category: string | null;
  slaName: string | null;
  resolutionTargetAt: Date | null;
  billingStatus: string;
  companyId: number | null;
  companyName: string | null;
  assigneeId: number | null;
  assigneeName: string | null;
  updatedAt: Date;
  createdAt: Date;
  minutes: number;
  customFields: Record<string, unknown>;
};

/** Trimmed, client-safe view of a ticket_statuses row — id/name/color drive
 * display everywhere; category/isActive drive the row-actions dropdown rule. */
export type TicketStatusOption = { id: number; name: string; color: string | null; category: TicketStatusCategoryValue; isActive: boolean };
export type TicketPriorityOption = { id: number; name: string; color: string | null; isActive: boolean };
export type TicketBillingOption = { id: number; name: string; color: string | null };

export function toCatalogMap<T extends { id: number }>(rows: T[]): Map<number, T> {
  return new Map(rows.map((r) => [r.id, r]));
}

/** Renders a catalog entry (status/priority/billing) as a hex-colored chip —
 * same pattern as settings/sla/sla-forms.tsx's DefinitionRow — since the
 * Badge component only supports 7 fixed tone names, not arbitrary org colors.
 * Falls back to a plain slate Badge with the legacy mirror value when the
 * catalog row can't be found (deleted/stale id). */
export function CatalogChip({ entry, fallback }: { entry: { name: string; color: string | null } | undefined; fallback: string }) {
  if (!entry) return <Badge tone="slate">{fallback}</Badge>;
  if (!entry.color) return <Badge tone="slate">{entry.name}</Badge>;
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ backgroundColor: `${entry.color}22`, color: entry.color }}
    >
      {entry.name}
    </span>
  );
}

export type ColumnDef = { key: string; label: string; render: (r: TicketRow) => React.ReactNode };

export function buildColumnRegistry(
  customFieldDefs: { key: string; name: string }[],
  statuses: Map<number, TicketStatusOption> = new Map(),
  priorities: Map<number, TicketPriorityOption> = new Map(),
  billingStatuses: Map<number, TicketBillingOption> = new Map(),
): Record<string, ColumnDef> {
  const registry: Record<string, ColumnDef> = {
    folio: { key: "folio", label: "Folio", render: (r) => <span className="font-mono text-xs text-faint">{r.folio}</span> },
    title: {
      key: "title",
      label: "Ticket",
      render: (r) => (
        <Link href={`/helpdesk/${r.id}`} className="font-medium text-fg transition-colors hover:text-primary">
          {r.title}
        </Link>
      ),
    },
    companyName: {
      key: "companyName",
      label: "Empresa",
      render: (r) =>
        r.companyName && r.companyId ? (
          <Link href={`/companies/${r.companyId}`} className="text-muted hover:text-primary hover:underline">
            {r.companyName}
          </Link>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    assigneeName: { key: "assigneeName", label: "Responsable", render: (r) => <span className="text-muted">{r.assigneeName ?? "Sin asignar"}</span> },
    status: {
      key: "status",
      label: "Estado",
      render: (r) => <CatalogChip entry={statuses.get(r.statusId)} fallback={r.status} />,
    },
    priority: {
      key: "priority",
      label: "Prioridad",
      render: (r) => <CatalogChip entry={priorities.get(r.priorityId)} fallback={r.priority} />,
    },
    category: { key: "category", label: "Categoría", render: (r) => <span className="text-muted">{r.category ?? "—"}</span> },
    slaName: { key: "slaName", label: "SLA", render: (r) => <span className="text-muted">{r.slaName ?? "—"}</span> },
    dueAt: {
      key: "dueAt",
      label: "Vence",
      render: (r) => {
        const overdue = r.resolutionTargetAt && r.resolutionTargetAt.getTime() < Date.now();
        return <span className={cx("tabular-nums", overdue ? "font-medium text-danger" : "text-muted")}>{r.resolutionTargetAt ? fmtDate(r.resolutionTargetAt) : "—"}</span>;
      },
    },
    minutes: { key: "minutes", label: "Tiempo", render: (r) => <span className="tabular-nums text-muted">{r.minutes > 0 ? formatMinutes(r.minutes) : "—"}</span> },
    billingStatus: {
      key: "billingStatus",
      label: "Cobro",
      render: (r) => <CatalogChip entry={billingStatuses.get(r.billingStatusId)} fallback={r.billingStatus} />,
    },
    updatedAt: { key: "updatedAt", label: "Actualizado", render: (r) => <span className="tabular-nums text-muted">{fmtDateTime(r.updatedAt)}</span> },
  };
  for (const f of customFieldDefs) {
    registry[`cf_${f.key}`] = {
      key: `cf_${f.key}`,
      label: f.name,
      render: (r) => {
        const v = r.customFields[f.key];
        return <span className="text-muted">{v === null || v === undefined || v === "" ? "—" : String(v)}</span>;
      },
    };
  }
  return registry;
}

export const DEFAULT_COLUMNS = ["folio", "title", "companyName", "assigneeName", "status", "priority", "category", "slaName", "dueAt", "minutes", "billingStatus", "updatedAt"];
export const TICKET_COLUMN_OPTIONS = DEFAULT_COLUMNS.map((key) => ({ key, label: buildColumnRegistry([])[key]?.label ?? key }));
export const TICKET_KANBAN_GROUP_OPTIONS = [
  { key: "status", label: "Estado" },
  { key: "priority", label: "Prioridad" },
];

/** Maps a column key to its sortable value — most columns mirror a TicketRow field directly, but `dueAt`/`cf_*` are aliases over resolutionTargetAt/customFields. */
function ticketSortValue(r: TicketRow, key: string): unknown {
  if (key === "dueAt") return r.resolutionTargetAt;
  if (key.startsWith("cf_")) return r.customFields[key.slice(3)];
  return r[key as keyof TicketRow];
}

function EmptyTickets({ createHref = "/helpdesk/new" }: { createHref?: string }) {
  return (
    <EmptyState icon={<LifeBuoy />} title="Sin tickets" action={<Link href={createHref} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white"><Plus className="size-4" /> Nuevo ticket</Link>}>
      Nada coincide con esta vista o filtros.
    </EmptyState>
  );
}

/* ------------------------------------------------------------------ table */

export function TableView({
  rows,
  columns,
  registry,
  users,
  statusOptions,
  priorityOptions,
  density,
}: {
  rows: TicketRow[];
  columns: string[];
  registry: Record<string, ColumnDef>;
  users: { id: number; name: string }[];
  statusOptions: TicketStatusOption[];
  priorityOptions: TicketPriorityOption[];
  density: "compact" | "comfortable" | "spacious";
}) {
  const [sort, setSort] = useState<SortState>(null);
  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const factor = sort.direction === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => factor * compareValues(ticketSortValue(a, sort.key), ticketSortValue(b, sort.key)));
  }, [rows, sort]);

  if (rows.length === 0) return <EmptyTickets />;
  const activeColumns = (columns.length > 0 ? columns : DEFAULT_COLUMNS).filter((c) => registry[c]);
  return (
    <Card className="overflow-visible">
      <Table density={density}>
        <THead>
          <tr>
            {activeColumns.map((c) => (
              <SortableTh key={c} label={registry[c].label} sortKey={c} sort={sort} onSort={(key) => setSort((prev) => nextSortState(prev, key))} />
            ))}
            <Th>Acciones</Th>
          </tr>
        </THead>
        <tbody className="divide-y divide-edge">
          {sortedRows.map((r) => (
            <tr key={r.id} className="group transition-colors hover:bg-subtle">
              {activeColumns.map((c) => <Td key={c}>{registry[c].render(r)}</Td>)}
              <Td>
                <TicketRowActions
                  ticketId={r.id}
                  statusId={r.statusId}
                  priorityId={r.priorityId}
                  assigneeId={r.assigneeId}
                  users={users}
                  statuses={statusOptions}
                  priorities={priorityOptions}
                />
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
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
            <span className="hidden w-28 shrink-0 truncate text-xs text-muted md:inline">{r.assigneeName ?? "Sin asignar"}</span>
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
          <div className="border-b border-edge bg-subtle px-4 py-2 text-xs font-semibold tracking-wide text-muted uppercase">Sin fecha de vencimiento</div>
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
              {r.resolutionTargetAt ? `vence ${fmtDate(r.resolutionTargetAt)}` : "sin vencimiento"}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
