"use client";

import { useMemo } from "react";
import Link from "next/link";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { vendorStatusMeta } from "@/lib/labels";
import { Avatar, Badge, Card, EmptyState, cx } from "@/components/ui";
import { Truck } from "lucide-react";
import { DataTable, type DataTableColumn, type DataTableColumnConfig } from "@/components/views/data-table";

export type VendorRow = {
  id: number;
  name: string;
  status: string;
  category: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  country: string | null;
  accountOwnerName: string | null;
  activePurchases: number;
  createdAt: Date;
  updatedAt: Date;
};

export type ColumnDef = { key: string; label: string; render: (r: VendorRow) => React.ReactNode };

export const COLUMN_REGISTRY: Record<string, ColumnDef> = {
  name: {
    key: "name",
    label: "Proveedor",
    render: (r) => (
      <Link href={`/vendors/${r.id}`} className="flex items-center gap-3 font-medium text-fg transition-colors hover:text-primary">
        <Avatar name={r.name} size="sm" square />
        {r.name}
      </Link>
    ),
  },
  status: {
    key: "status",
    label: "Estado",
    render: (r) => <Badge tone={vendorStatusMeta[r.status]?.tone ?? "slate"}>{vendorStatusMeta[r.status]?.label ?? r.status}</Badge>,
  },
  category: { key: "category", label: "Categoría", render: (r) => <span className="text-muted">{r.category ?? "—"}</span> },
  accountOwnerName: { key: "accountOwnerName", label: "Responsable", render: (r) => <span className="text-muted">{r.accountOwnerName ?? "—"}</span> },
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
  country: { key: "country", label: "País", render: (r) => <span className="text-muted">{r.country ?? "—"}</span> },
  activePurchases: {
    key: "activePurchases",
    label: "Compras activas",
    render: (r) => <span className={cx("tabular-nums", r.activePurchases > 0 ? "text-fg" : "text-muted")}>{r.activePurchases}</span>,
  },
  createdAt: { key: "createdAt", label: "Creado", render: (r) => <span className="tabular-nums text-muted">{fmtDate(r.createdAt)}</span> },
  updatedAt: { key: "updatedAt", label: "Actualizado", render: (r) => <span className="tabular-nums text-muted">{fmtDateTime(r.updatedAt)}</span> },
};

export const DEFAULT_COLUMNS = ["name", "status", "category", "accountOwnerName", "activePurchases", "email", "phone"];
/** Superset of DEFAULT_COLUMNS — extra columns show up unchecked in the picker until opted in. */
export const VENDOR_COLUMN_OPTIONS = Object.keys(COLUMN_REGISTRY).map((key) => ({ key, label: COLUMN_REGISTRY[key].label }));

function EmptyVendors() {
  return (
    <EmptyState icon={<Truck />} title="No se encontraron proveedores">
      Prueba otra búsqueda o ajusta los filtros — o agrega tu primer proveedor con el botón de arriba.
    </EmptyState>
  );
}

/** TanStack Table (see components/views/data-table.tsx) — same pattern as Companies' Table view. */
export function TableView({
  rows,
  columnConfig,
  onColumnConfigChange,
  density,
}: {
  rows: VendorRow[];
  columnConfig: DataTableColumnConfig[];
  onColumnConfigChange: (updater: (prev: DataTableColumnConfig[]) => DataTableColumnConfig[]) => void;
  density: "compact" | "comfortable" | "spacious";
}) {
  const dataTableRegistry = useMemo(() => {
    const out: Record<string, DataTableColumn<VendorRow>> = {};
    for (const key of Object.keys(COLUMN_REGISTRY)) {
      out[key] = {
        label: COLUMN_REGISTRY[key].label,
        render: COLUMN_REGISTRY[key].render,
        sortValue: (r) => r[key as keyof VendorRow],
        align: key === "activePurchases" ? "right" : undefined,
      };
    }
    return out;
  }, []);

  return (
    <DataTable
      rows={rows}
      registry={dataTableRegistry}
      defaultColumnKeys={DEFAULT_COLUMNS}
      columnConfig={columnConfig}
      onColumnConfigChange={onColumnConfigChange}
      density={density}
      enableRowSelection
      emptyState={<EmptyVendors />}
    />
  );
}

/* ------------------------------------------------------------------- list */

export function ListView({ rows }: { rows: VendorRow[] }) {
  if (rows.length === 0) return <EmptyVendors />;
  return (
    <Card className="overflow-hidden">
      <ul className="divide-y divide-edge">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <Badge tone={vendorStatusMeta[r.status]?.tone ?? "slate"}>{vendorStatusMeta[r.status]?.label ?? r.status}</Badge>
            <Link href={`/vendors/${r.id}`} className="min-w-0 flex-1 truncate font-medium text-fg hover:text-primary">
              {r.name}
            </Link>
            <span className="shrink-0 text-xs text-muted">{r.accountOwnerName ?? "Sin responsable"}</span>
            <span className={cx("w-24 shrink-0 text-right text-xs tabular-nums", r.activePurchases > 0 ? "text-fg" : "text-muted")}>
              {r.activePurchases} compras
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ---------------------------------------------------------------- kanban */

const KANBAN_STATUSES = ["active", "inactive", "archived"] as const;

export function KanbanView({ rows }: { rows: VendorRow[] }) {
  if (rows.length === 0) return <EmptyVendors />;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {KANBAN_STATUSES.map((status) => {
        const bucket = rows.filter((r) => r.status === status);
        return (
          <div key={status} className="rounded-xl border border-edge bg-subtle/40 p-3">
            <div className="mb-2 flex items-center justify-between">
              <Badge tone={vendorStatusMeta[status]?.tone ?? "slate"}>{vendorStatusMeta[status]?.label ?? status}</Badge>
              <span className="text-xs text-faint">{bucket.length}</span>
            </div>
            <div className="space-y-2">
              {bucket.map((r) => (
                <Link
                  key={r.id}
                  href={`/vendors/${r.id}`}
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
