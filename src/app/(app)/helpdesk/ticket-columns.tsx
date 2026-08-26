import Link from "next/link";
import { fmtDate, fmtDateTime } from "@/lib/format";
import type { TicketStatusCategoryValue } from "@/lib/ticket-catalogs";
import { formatMinutes } from "@/lib/time-entries";
import { Badge, cx } from "@/components/ui";
import { DEFAULT_LOCALE, t, type Locale } from "@/lib/i18n";

/**
 * Not a "use client" module, unlike its sibling ticket-views.tsx: helpdesk/page.tsx
 * (a server component) calls buildTicketColumnOptions()/buildTicketKanbanGroupOptions()
 * directly to build locale-aware option lists, and a function exported from a
 * "use client" file can only be *rendered* from the server, not called — see
 * https://nextjs.org/docs/messages/react-client-hook-in-server-component for the
 * class of error this avoids. CatalogChip/buildColumnRegistry live here too since
 * the builders depend on them.
 */

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
