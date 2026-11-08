"use client";

import Link from "next/link";
import { ClipboardCheck, LifeBuoy, Layers } from "lucide-react";
import { fmtDate } from "@/lib/format";
import { getLabels } from "@/lib/labels";
import { t, type Locale } from "@/lib/i18n";
import { useLocale } from "@/components/locale-provider";
import { Badge, Card, EmptyState, cx } from "@/components/ui";
import { DataTable, type DataTableColumn, type DataTableColumnConfig } from "@/components/views/data-table";
import { workDetailHref, workPeekToken } from "@/lib/work-peek";

/**
 * The combined Activities + Tickets view ("Trabajo"). Both types are rows of
 * the same `work_items` table (see docs/architecture/work-item-model.md), so
 * this is a presentation layer over data that was already unified — no new
 * storage, no migration.
 *
 * **Type is read from shape, not colour.** Colour in Watson already carries
 * status, priority and activity type, and ticket statuses are org-configurable
 * *with their own colours* — a ticket whose status is configured violet would
 * be indistinguishable from an activity if type were a hue. So type shows up
 * as an icon plus the folio prefix (TK- / ACT-), the same language Calendario
 * and the sidebar already use, which leaves colour free to mean stage and
 * urgency. There is deliberately no "Tipo" badge column: the folio says it.
 */

export type WorkKind = "ticket" | "activity";

export type WorkRow = {
  /** `work_items.id` — globally unique across both types, so it is the row identity. */
  id: number;
  /** The specialization id (tickets.id / activities.id) — what the URL needs. */
  entityId: number;
  type: WorkKind;
  folio: string;
  title: string;
  /** The precise status name: the org's catalog name for a ticket, the localized label for an activity. */
  statusLabel: string;
  /** Org-configured hex for a ticket status; null for activities, which fall back to the category tone. */
  statusColor: string | null;
  /** Shared semantic category — the one vocabulary both types answer to. */
  category: string;
  priority: string;
  companyId: number | null;
  companyName: string | null;
  assigneeId: number | null;
  assigneeName: string | null;
  /** `work_items.due_date`: "Vence" on an activity, "Fecha agendada" on a ticket. */
  dueDate: string | null;
  /** Ticket-only (`tickets.status_id`), needed by TicketRowActions; null for activities. */
  statusId: number | null;
  priorityId: number | null;
};

/** Client-side alias of workDetailHref — the format itself is owned by lib/work-peek. */
export function workHref(row: WorkRow): string {
  return workDetailHref({ type: row.type, entityId: row.entityId });
}

/** The `?peek=` token the page resolves back to a row — format owned by lib/work-peek. */
export function peekToken(row: WorkRow): string {
  return workPeekToken({ type: row.type, entityId: row.entityId });
}

/**
 * Type mark: icon + folio, the row's and card's type signal. The icon carries
 * a tooltip and screen-reader label so the distinction is never colour- or
 * shape-only (the folio prefix is the third, redundant channel).
 */
export function TypeMark({ row, locale }: { row: WorkRow; locale: Locale }) {
  const isTicket = row.type === "ticket";
  const Icon = isTicket ? LifeBuoy : ClipboardCheck;
  const label = isTicket ? t("Ticket", "Ticket", locale) : t("Actividad", "Activity", locale);
  return (
    <span className="flex items-center gap-2">
      <Icon
        aria-hidden
        className={cx("size-4 shrink-0", isTicket ? "text-blue-600 dark:text-blue-400" : "text-violet-600 dark:text-violet-400")}
      />
      <span className="sr-only">{label}</span>
      <span title={label} className="font-mono text-xs text-faint">
        {row.folio}
      </span>
    </span>
  );
}

/** Status chip: the org's configured colour when there is one, else the shared category tone. */
export function StatusChip({ row, categoryTone }: { row: WorkRow; categoryTone: Record<string, { label: string; tone: "slate" | "blue" | "amber" | "green" | "red" | "violet" | "purple" }> }) {
  if (row.statusColor) {
    return (
      <span
        className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium"
        style={{ backgroundColor: `${row.statusColor}22`, color: row.statusColor }}
      >
        {row.statusLabel}
      </span>
    );
  }
  return <Badge tone={categoryTone[row.category]?.tone ?? "slate"}>{row.statusLabel}</Badge>;
}

/**
 * `peekHref` makes both the folio and the title open the quick view instead of
 * navigating away. Two targets, not one: the table's `<tr>` carries no click
 * handler (the shared DataTable is the Views Engine's, left untouched), and a
 * single clickable word in the title column was the whole complaint — "no
 * puedo dar click y abrir". The folio sits at the row start, where people aim.
 */
export function buildWorkColumnRegistry(
  locale: Locale,
  peekHref: (row: WorkRow) => string,
): Record<string, DataTableColumn<WorkRow>> {
  const { ticketPriorityMeta, workCategoryMeta } = getLabels(locale);
  const today = new Date().toISOString().slice(0, 10);
  return {
    folio: {
      label: "Folio",
      render: (r) => (
        <Link href={peekHref(r)} className="inline-flex transition-opacity hover:opacity-70">
          <TypeMark row={r} locale={locale} />
        </Link>
      ),
      sortValue: (r) => r.folio,
      defaultSize: 150,
    },
    title: {
      label: t("Trabajo", "Work", locale),
      render: (r) => (
        <Link href={peekHref(r)} className="block font-medium text-fg transition-colors hover:text-primary">
          {r.title}
        </Link>
      ),
      sortValue: (r) => r.title,
      defaultSize: 320,
    },
    companyName: {
      label: t("Empresa", "Company", locale),
      render: (r) =>
        r.companyName && r.companyId ? (
          <Link href={`/companies/${r.companyId}`} className="text-muted hover:text-primary hover:underline">
            {r.companyName}
          </Link>
        ) : (
          <span className="text-muted">—</span>
        ),
      sortValue: (r) => r.companyName ?? "",
    },
    assigneeName: {
      label: t("Responsable", "Assignee", locale),
      render: (r) => <span className="text-muted">{r.assigneeName ?? t("Sin asignar", "Unassigned", locale)}</span>,
      sortValue: (r) => r.assigneeName ?? "",
    },
    status: {
      label: t("Estado", "Status", locale),
      render: (r) => <StatusChip row={r} categoryTone={workCategoryMeta} />,
      sortValue: (r) => r.statusLabel,
    },
    dueDate: {
      label: t("Vence", "Due", locale),
      render: (r) => {
        const overdue = r.dueDate && r.dueDate < today && r.category !== "closed" && r.category !== "cancelled";
        return (
          <span className={cx("tabular-nums", overdue ? "font-medium text-danger" : "text-muted")}>
            {r.dueDate ? fmtDate(r.dueDate) : "—"}
          </span>
        );
      },
      sortValue: (r) => r.dueDate ?? "",
    },
    // Off by default — available in the column picker for whoever wants it.
    priority: {
      label: t("Prioridad", "Priority", locale),
      render: (r) => <Badge tone={ticketPriorityMeta[r.priority]?.tone ?? "slate"}>{ticketPriorityMeta[r.priority]?.label ?? r.priority}</Badge>,
      sortValue: (r) => r.priority,
    },
    category: {
      label: t("Etapa", "Stage", locale),
      render: (r) => <span className="text-muted">{workCategoryMeta[r.category]?.label ?? r.category}</span>,
      sortValue: (r) => r.category,
    },
  };
}

/**
 * Six columns, not fourteen. The team's standing complaint about `/today` is
 * information overload, so this opens spare and the rest of the registry waits
 * in the column picker.
 */
export const DEFAULT_WORK_COLUMNS = ["folio", "title", "companyName", "assigneeName", "status", "dueDate"];

export function EmptyWork({ filtered }: { filtered: boolean }) {
  const locale = useLocale();
  return (
    <Card>
      <EmptyState
        icon={<Layers />}
        title={filtered ? t("Sin resultados", "No results", locale) : t("Nada pendiente", "Nothing pending", locale)}
      >
        {filtered
          ? t("Ajusta los filtros para ver más trabajo.", "Adjust the filters to see more work.", locale)
          : t(
              "No hay tickets ni actividades abiertos. Cambia a “Todo” para ver el historial.",
              "No open tickets or activities. Switch to “All” to see history.",
              locale,
            )}
      </EmptyState>
    </Card>
  );
}

export function WorkTable({
  rows,
  columnConfig,
  onColumnConfigChange,
  rowActions,
  filtered,
  peekHref,
}: {
  rows: WorkRow[];
  columnConfig: DataTableColumnConfig[];
  onColumnConfigChange: (updater: (prev: DataTableColumnConfig[]) => DataTableColumnConfig[]) => void;
  rowActions?: (row: WorkRow) => React.ReactNode;
  filtered: boolean;
  peekHref: (row: WorkRow) => string;
}) {
  const locale = useLocale();
  return (
    <DataTable
      rows={rows}
      registry={buildWorkColumnRegistry(locale, peekHref)}
      defaultColumnKeys={DEFAULT_WORK_COLUMNS}
      columnConfig={columnConfig}
      onColumnConfigChange={onColumnConfigChange}
      density="compact"
      rowActions={rowActions}
      emptyState={<EmptyWork filtered={filtered} />}
    />
  );
}
