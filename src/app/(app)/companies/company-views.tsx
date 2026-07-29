"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { renewalBucket } from "@/lib/company360";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { companyStatusMeta, renewalBucketMeta } from "@/lib/labels";
import { Avatar, Badge, Card, EmptyState, THead, Table, Td, cx } from "@/components/ui";
import { Building2 } from "lucide-react";
import { compareValues, nextSortState, SortableTh, type SortState } from "@/components/views/sortable-th";

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

export const COLUMN_REGISTRY: Record<string, ColumnDef> = {
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
export const COMPANY_COLUMN_OPTIONS = Object.keys(COLUMN_REGISTRY).map((key) => ({ key, label: COLUMN_REGISTRY[key].label }));

function EmptyCompanies() {
  return (
    <EmptyState icon={<Building2 />} title="No se encontraron empresas">
      Prueba otra búsqueda o ajusta los filtros — o agrega tu primera empresa con el botón de arriba.
    </EmptyState>
  );
}

/**
 * Sorting is client-side, over the already-fetched page of rows — not
 * persisted to the saved view. `savedViewConfigSchema.sortBy` exists and
 * Tickets already reads it server-side for two hardcoded fields, but there's
 * no generic way yet to turn an arbitrary clicked column (including the
 * aggregate SQL ones) into a dynamic `ORDER BY` across every row shape, and
 * the whole result set is already loaded in one shot (capped at 200) — so a
 * plain client-side re-sort is instant, simpler, and exactly what "click a
 * header" implies (2026-07-29).
 */
export function TableView({ rows, columns, density }: { rows: CompanyRow[]; columns: string[]; density: "compact" | "comfortable" | "spacious" }) {
  const [sort, setSort] = useState<SortState>(null);
  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const factor = sort.direction === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => factor * compareValues(a[sort.key as keyof CompanyRow], b[sort.key as keyof CompanyRow]));
  }, [rows, sort]);

  if (rows.length === 0) return <EmptyCompanies />;
  const activeColumns = (columns.length > 0 ? columns : DEFAULT_COLUMNS).filter((c) => COLUMN_REGISTRY[c]);
  return (
    <Card className="overflow-visible">
      <Table density={density}>
        <THead>
          <tr>
            {activeColumns.map((c) => (
              <SortableTh key={c} label={COLUMN_REGISTRY[c].label} sortKey={c} sort={sort} onSort={(key) => setSort((prev) => nextSortState(prev, key))} />
            ))}
          </tr>
        </THead>
        <tbody className="divide-y divide-edge">
          {sortedRows.map((r) => (
            <tr key={r.id} className="transition-colors hover:bg-subtle">
              {activeColumns.map((c) => (
                <Td key={c}>{COLUMN_REGISTRY[c].render(r)}</Td>
              ))}
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

/* ------------------------------------------------------------------- list */

export function ListView({ rows }: { rows: CompanyRow[] }) {
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
