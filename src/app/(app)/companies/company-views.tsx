"use client";

import { useMemo } from "react";
import Link from "next/link";
import { renewalBucket } from "@/lib/company360";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { getLabels } from "@/lib/labels";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n";
import { useLocale } from "@/components/locale-provider";
import { Avatar, Badge, Card, EmptyState, cx } from "@/components/ui";
import { Building2 } from "lucide-react";
import { DataTable, type DataTableColumn, type DataTableColumnConfig } from "@/components/views/data-table";

export type CompanyRow = {
  id: number;
  name: string;
  status: string;
  industry: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  primaryContact: string | null;
  accountOwnerName: string | null;
  activeServices: number;
  openTickets: number;
  pendingBilling: number;
  nextRenewal: string | null;
  lastTouchAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ColumnDef = { key: string; label: string; render: (r: CompanyRow) => React.ReactNode };

export function buildColumnRegistry(locale: Locale): Record<string, ColumnDef> {
  const { companyStatusMeta, renewalBucketMeta } = getLabels(locale);
  return {
  name: {
    key: "name",
    label: "Empresa",
    render: (r) => (
      <Link
        href={`/companies/${r.id}`}
        className="flex items-center gap-3 font-medium text-fg transition-colors hover:text-primary"
      >
        <Avatar name={r.name} size="sm" square />
        {r.name}
      </Link>
    ),
  },
  status: {
    key: "status",
    label: "Estado",
    render: (r) => <Badge tone={companyStatusMeta[r.status]?.tone ?? "slate"}>{companyStatusMeta[r.status]?.label ?? r.status}</Badge>,
  },
  primaryContact: { key: "primaryContact", label: "Contacto principal", render: (r) => <span className="text-muted">{r.primaryContact ?? "—"}</span> },
  accountOwnerName: { key: "accountOwnerName", label: "Responsable de cuenta", render: (r) => <span className="text-muted">{r.accountOwnerName ?? "—"}</span> },
  industry: { key: "industry", label: "Industria", render: (r) => <span className="text-muted">{r.industry ?? "—"}</span> },
  website: {
    key: "website",
    label: "Sitio web",
    render: (r) =>
      r.website ? (
        <a href={r.website} target="_blank" rel="noreferrer" className="text-muted hover:text-primary hover:underline">
          {r.website}
        </a>
      ) : (
        <span className="text-muted">—</span>
      ),
  },
  email: { key: "email", label: "Correo", render: (r) => <span className="text-muted">{r.email ?? "—"}</span> },
  phone: { key: "phone", label: "Teléfono", render: (r) => <span className="text-muted">{r.phone ?? "—"}</span> },
  city: { key: "city", label: "Ciudad", render: (r) => <span className="text-muted">{r.city ?? "—"}</span> },
  state: { key: "state", label: "Estado/provincia", render: (r) => <span className="text-muted">{r.state ?? "—"}</span> },
  country: { key: "country", label: "País", render: (r) => <span className="text-muted">{r.country ?? "—"}</span> },
  activeServices: { key: "activeServices", label: "Servicios", render: (r) => <span className="tabular-nums text-muted">{r.activeServices}</span> },
  openTickets: {
    key: "openTickets",
    label: "Tickets abiertos",
    render: (r) => <span className={cx("tabular-nums", r.openTickets > 0 ? "text-fg" : "text-muted")}>{r.openTickets}</span>,
  },
  pendingBilling: {
    key: "pendingBilling",
    label: "Facturación",
    render: (r) => (r.pendingBilling > 0 ? <Badge tone="amber">{r.pendingBilling} pending</Badge> : <span className="text-muted">—</span>),
  },
  nextRenewal: {
    key: "nextRenewal",
    label: "Próxima renovación",
    render: (r) => {
      const bucket = r.nextRenewal ? renewalBucket(r.nextRenewal, new Date()) : null;
      return r.nextRenewal && bucket ? (
        <Badge tone={renewalBucketMeta[bucket]?.tone ?? "slate"}>{fmtDate(r.nextRenewal)}</Badge>
      ) : (
        <span className="text-muted">—</span>
      );
    },
  },
  lastTouchAt: { key: "lastTouchAt", label: "Último contacto", render: (r) => <span className="tabular-nums text-muted">{r.lastTouchAt ? fmtDateTime(r.lastTouchAt) : "—"}</span> },
  createdAt: { key: "createdAt", label: "Creado", render: (r) => <span className="tabular-nums text-muted">{fmtDate(r.createdAt)}</span> },
  updatedAt: { key: "updatedAt", label: "Actualizado", render: (r) => <span className="tabular-nums text-muted">{fmtDateTime(r.updatedAt)}</span> },
  };
}

export const DEFAULT_COLUMNS = [
  "name",
  "status",
  "primaryContact",
  "accountOwnerName",
  "activeServices",
  "openTickets",
  "pendingBilling",
  "nextRenewal",
];
/** Superset of DEFAULT_COLUMNS — extra columns (industry, sitio web, correo, …) show up unchecked in the picker until opted in. */
const STATIC_COLUMN_REGISTRY = buildColumnRegistry(DEFAULT_LOCALE);
export const COMPANY_COLUMN_OPTIONS = Object.keys(STATIC_COLUMN_REGISTRY).map((key) => ({ key, label: STATIC_COLUMN_REGISTRY[key].label }));

function EmptyCompanies() {
  return (
    <EmptyState icon={<Building2 />} title="No se encontraron empresas">
      Prueba otra búsqueda o ajusta los filtros — o agrega tu primera empresa con el botón de arriba.
    </EmptyState>
  );
}

/** TanStack Table (see components/views/data-table.tsx) — sorting stays client-side/unpersisted, same as before (2026-07-29 rationale: no generic ORDER BY across every row shape yet, and the whole capped result set is already loaded in one shot). */
export function TableView({
  rows,
  columnConfig,
  onColumnConfigChange,
  density,
}: {
  rows: CompanyRow[];
  columnConfig: DataTableColumnConfig[];
  onColumnConfigChange: (updater: (prev: DataTableColumnConfig[]) => DataTableColumnConfig[]) => void;
  density: "compact" | "comfortable" | "spacious";
}) {
  const locale = useLocale();
  const dataTableRegistry = useMemo(() => {
    const registry = buildColumnRegistry(locale);
    const out: Record<string, DataTableColumn<CompanyRow>> = {};
    for (const key of Object.keys(registry)) {
      out[key] = {
        label: registry[key].label,
        render: registry[key].render,
        sortValue: (r) => r[key as keyof CompanyRow],
        align: key === "activeServices" || key === "openTickets" || key === "pendingBilling" ? "right" : undefined,
      };
    }
    return out;
  }, [locale]);

  return (
    <DataTable
      rows={rows}
      registry={dataTableRegistry}
      defaultColumnKeys={DEFAULT_COLUMNS}
      columnConfig={columnConfig}
      onColumnConfigChange={onColumnConfigChange}
      density={density}
      enableRowSelection
      emptyState={<EmptyCompanies />}
    />
  );
}

/* ------------------------------------------------------------------- list */

export function ListView({ rows }: { rows: CompanyRow[] }) {
  const { companyStatusMeta } = getLabels(useLocale());
  if (rows.length === 0) return <EmptyCompanies />;
  return (
    <Card className="overflow-hidden">
      <ul className="divide-y divide-edge">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <Badge tone={companyStatusMeta[r.status]?.tone ?? "slate"}>{companyStatusMeta[r.status]?.label ?? r.status}</Badge>
            <Link href={`/companies/${r.id}`} className="min-w-0 flex-1 truncate font-medium text-fg hover:text-primary">
              {r.name}
            </Link>
            <span className="shrink-0 text-xs text-muted">{r.accountOwnerName ?? "Sin responsable"}</span>
            <span className={cx("w-16 shrink-0 text-right text-xs tabular-nums", r.openTickets > 0 ? "text-fg" : "text-muted")}>
              {r.openTickets} tickets
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ---------------------------------------------------------------- kanban */

const KANBAN_STATUSES = ["active", "prospect_legacy", "inactive", "archived"] as const;

export function KanbanView({ rows }: { rows: CompanyRow[] }) {
  const { companyStatusMeta } = getLabels(useLocale());
  if (rows.length === 0) return <EmptyCompanies />;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {KANBAN_STATUSES.map((status) => {
        const bucket = rows.filter((r) => r.status === status);
        return (
          <div key={status} className="rounded-xl border border-edge bg-subtle/40 p-3">
            <div className="mb-2 flex items-center justify-between">
              <Badge tone={companyStatusMeta[status]?.tone ?? "slate"}>{companyStatusMeta[status]?.label ?? status}</Badge>
              <span className="text-xs text-faint">{bucket.length}</span>
            </div>
            <div className="space-y-2">
              {bucket.map((r) => (
                <Link
                  key={r.id}
                  href={`/companies/${r.id}`}
                  className="block rounded-lg border border-edge bg-surface p-2.5 text-sm shadow-card transition-shadow hover:shadow-card-hover"
                >
                  <span className="flex items-center gap-2 font-medium text-fg">
                    <Avatar name={r.name} size="sm" square />
                    {r.name}
                  </span>
                  {r.accountOwnerName ? <span className="mt-1 block truncate text-xs text-muted">{r.accountOwnerName}</span> : null}
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
