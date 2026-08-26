"use client";

import { useMemo } from "react";
import Link from "next/link";
import { fmtDate, fmtDateTime } from "@/lib/format";
import type { TicketStatusCategoryValue } from "@/lib/ticket-catalogs";
import { formatMinutes } from "@/lib/time-entries";
import { Badge, Card, EmptyState, cx } from "@/components/ui";
import { LifeBuoy, Plus } from "lucide-react";
import { DataTable, type DataTableColumn, type DataTableColumnConfig } from "@/components/views/data-table";
import { toCatalogMap } from "@/lib/catalog-map";
import { useLocale } from "@/components/locale-provider";
import { DEFAULT_LOCALE, t, type Locale } from "@/lib/i18n";
import { TicketRowActions } from "./ticket-row-actions";
import { TicketKanban } from "./ticket-kanban";

export { toCatalogMap };

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
  /** "Fecha agendada" — independent of the SLA target, workItems.dueDate. */
  dueDate: string | null;
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
  locale: Locale = DEFAULT_LOCALE,
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
      label: t("Empresa", "Company", locale),
      render: (r) =>
        r.companyName && r.companyId ? (
          <Link href={`/companies/${r.companyId}`} className="text-muted hover:text-primary hover:underline">
            {r.companyName}
          </Link>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    assigneeName: {
      key: "assigneeName",
      label: t("Responsable", "Assignee", locale),
      render: (r) => <span className="text-muted">{r.assigneeName ?? t("Sin asignar", "Unassigned", locale)}</span>,
    },
    status: {
      key: "status",
      label: t("Estado", "Status", locale),
      render: (r) => <CatalogChip entry={statuses.get(r.statusId)} fallback={r.status} />,
    },
    priority: {
      key: "priority",
      label: t("Prioridad", "Priority", locale),
      render: (r) => <CatalogChip entry={priorities.get(r.priorityId)} fallback={r.priority} />,
    },
    category: { key: "category", label: t("Categoría", "Category", locale), render: (r) => <span className="text-muted">{r.category ?? "—"}</span> },
    slaName: { key: "slaName", label: "SLA", render: (r) => <span className="text-muted">{r.slaName ?? "—"}</span> },
    dueAt: {
      key: "dueAt",
      label: t("Vence", "Due", locale),
      render: (r) => {
        const overdue = r.resolutionTargetAt && r.resolutionTargetAt.getTime() < Date.now();
        return <span className={cx("tabular-nums", overdue ? "font-medium text-danger" : "text-muted")}>{r.resolutionTargetAt ? fmtDate(r.resolutionTargetAt) : "—"}</span>;
      },
    },
    scheduledFor: {
      key: "scheduledFor",
      label: t("Fecha agendada", "Scheduled date", locale),
      render: (r) => {
        const overdue = r.dueDate && r.dueDate < new Date().toISOString().slice(0, 10);
        return (
          <span className={cx("tabular-nums", overdue ? "font-medium text-amber-600 dark:text-amber-400" : "text-muted")}>
            {r.dueDate ? fmtDate(r.dueDate) : "—"}
          </span>
        );
      },
    },
    minutes: { key: "minutes", label: t("Tiempo", "Time", locale), render: (r) => <span className="tabular-nums text-muted">{r.minutes > 0 ? formatMinutes(r.minutes) : "—"}</span> },
    billingStatus: {
      key: "billingStatus",
      label: t("Cobro", "Billing", locale),
      render: (r) => <CatalogChip entry={billingStatuses.get(r.billingStatusId)} fallback={r.billingStatus} />,
    },
    updatedAt: { key: "updatedAt", label: t("Actualizado", "Updated", locale), render: (r) => <span className="tabular-nums text-muted">{fmtDateTime(r.updatedAt)}</span> },
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

export const DEFAULT_COLUMNS = ["folio", "title", "companyName", "assigneeName", "status", "priority", "category", "slaName", "dueAt", "scheduledFor", "minutes", "billingStatus", "updatedAt"];
export function buildTicketColumnOptions(locale: Locale = DEFAULT_LOCALE) {
  const registry = buildColumnRegistry([], new Map(), new Map(), new Map(), locale);
  return DEFAULT_COLUMNS.map((key) => ({ key, label: registry[key]?.label ?? key }));
}
export function buildTicketKanbanGroupOptions(locale: Locale = DEFAULT_LOCALE) {
  return [
    { key: "status", label: t("Estado", "Status", locale) },
    { key: "priority", label: t("Prioridad", "Priority", locale) },
  ];
}

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
