"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { contactTypeMeta } from "@/lib/labels";
import { Avatar, Badge, Card, EmptyState, THead, Table, Td, cx } from "@/components/ui";
import { Users } from "lucide-react";
import { compareValues, nextSortState, SortableTh, type SortState } from "@/components/views/sortable-th";

export type ContactRow = {
  id: number;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
  department: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  contactType: string;
  isPrimary: boolean;
  isActive: boolean;
  companyId: number;
  companyName: string;
  openTickets: number;
  createdAt: Date;
  updatedAt: Date;
};

export type ColumnDef = { key: string; label: string; render: (r: ContactRow) => React.ReactNode };

export const COLUMN_REGISTRY: Record<string, ColumnDef> = {
  name: {
    key: "name",
    label: "Contacto",
    render: (r) => (
      <>
        <Link href={`/contacts/${r.id}`} className="flex items-center gap-3 font-medium text-fg transition-colors hover:text-primary">
          <Avatar name={`${r.firstName} ${r.lastName}`} size="sm" />
          <span>
            {r.firstName} {r.lastName}
            {r.isPrimary ? (
              <Badge tone="blue" className="ml-2">
                Principal
              </Badge>
            ) : null}
          </span>
        </Link>
        {r.jobTitle || r.department ? (
          <span className="block pl-11 text-xs text-muted">{[r.jobTitle, r.department].filter(Boolean).join(" · ")}</span>
        ) : null}
      </>
    ),
  },
  companyName: {
    key: "companyName",
    label: "Empresa",
    render: (r) => (
      <Link href={`/companies/${r.companyId}`} className="text-muted hover:text-primary hover:underline">
        {r.companyName}
      </Link>
    ),
  },
  contactType: {
    key: "contactType",
    label: "Tipo",
    render: (r) => <Badge tone={contactTypeMeta[r.contactType]?.tone ?? "slate"}>{contactTypeMeta[r.contactType]?.label ?? r.contactType}</Badge>,
  },
  jobTitle: { key: "jobTitle", label: "Puesto", render: (r) => <span className="text-muted">{r.jobTitle ?? "—"}</span> },
  department: { key: "department", label: "Departamento", render: (r) => <span className="text-muted">{r.department ?? "—"}</span> },
  email: { key: "email", label: "Correo", render: (r) => <span className="text-muted">{r.email ?? "—"}</span> },
  phone: { key: "phone", label: "Teléfono", render: (r) => <span className="text-muted">{r.phone ?? r.mobile ?? "—"}</span> },
  openTickets: {
    key: "openTickets",
    label: "Tickets abiertos",
    render: (r) => <span className={cx("tabular-nums", r.openTickets > 0 ? "text-fg" : "text-muted")}>{r.openTickets}</span>,
  },
  isActive: {
    key: "isActive",
    label: "Estado",
    render: (r) => (r.isActive ? <Badge tone="green">Activo</Badge> : <Badge tone="slate">Archivado</Badge>),
  },
  createdAt: { key: "createdAt", label: "Creado", render: (r) => <span className="tabular-nums text-muted">{fmtDate(r.createdAt)}</span> },
  updatedAt: { key: "updatedAt", label: "Actualizado", render: (r) => <span className="tabular-nums text-muted">{fmtDateTime(r.updatedAt)}</span> },
};

export const DEFAULT_COLUMNS = ["name", "companyName", "contactType", "email", "phone", "openTickets", "isActive"];
/** Superset of DEFAULT_COLUMNS — extra columns (puesto, departamento, creado, …) show up unchecked in the picker until opted in. */
export const CONTACT_COLUMN_OPTIONS = Object.keys(COLUMN_REGISTRY).map((key) => ({ key, label: COLUMN_REGISTRY[key].label }));

function EmptyContacts() {
  return (
    <EmptyState icon={<Users />} title="No se encontraron contactos">
      Prueba otra búsqueda o ajusta los filtros — o agrega tu primer contacto con el botón de arriba.
    </EmptyState>
  );
}

/** Sorting is client-side over the already-fetched page of rows — see company-views.tsx's TableView doc comment for the rationale. */
export function TableView({ rows, columns, density }: { rows: ContactRow[]; columns: string[]; density: "compact" | "comfortable" | "spacious" }) {
  const [sort, setSort] = useState<SortState>(null);
  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const factor = sort.direction === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => factor * compareValues(a[sort.key as keyof ContactRow], b[sort.key as keyof ContactRow]));
  }, [rows, sort]);

  if (rows.length === 0) return <EmptyContacts />;
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
            <tr key={r.id} className={cx("transition-colors hover:bg-subtle", !r.isActive && "opacity-60")}>
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

export function ListView({ rows }: { rows: ContactRow[] }) {
  if (rows.length === 0) return <EmptyContacts />;
  return (
    <Card className="overflow-hidden">
      <ul className="divide-y divide-edge">
        {rows.map((r) => (
          <li key={r.id} className={cx("flex items-center gap-3 px-4 py-2.5 text-sm", !r.isActive && "opacity-60")}>
            {r.isActive ? <Badge tone="green">Activo</Badge> : <Badge tone="slate">Archivado</Badge>}
            <Link href={`/contacts/${r.id}`} className="min-w-0 flex-1 truncate font-medium text-fg hover:text-primary">
              {r.firstName} {r.lastName}
            </Link>
            <span className="shrink-0 text-xs text-muted">{r.companyName}</span>
            <span className={cx("w-24 shrink-0 text-right text-xs tabular-nums", r.openTickets > 0 ? "text-fg" : "text-muted")}>
              {r.openTickets} tickets
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ---------------------------------------------------------------- kanban */

export function KanbanView({ rows }: { rows: ContactRow[] }) {
  if (rows.length === 0) return <EmptyContacts />;
  const groups: { key: string; label: string; tone: "green" | "slate" }[] = [
    { key: "active", label: "Activos", tone: "green" },
    { key: "inactive", label: "Archivados", tone: "slate" },
  ];
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {groups.map((g) => {
        const bucket = rows.filter((r) => (g.key === "active" ? r.isActive : !r.isActive));
        return (
          <div key={g.key} className="rounded-xl border border-edge bg-subtle/40 p-3">
            <div className="mb-2 flex items-center justify-between">
              <Badge tone={g.tone}>{g.label}</Badge>
              <span className="text-xs text-faint">{bucket.length}</span>
            </div>
            <div className="space-y-2">
              {bucket.map((r) => (
                <Link
                  key={r.id}
                  href={`/contacts/${r.id}`}
                  className="block rounded-lg border border-edge bg-surface p-2.5 text-sm shadow-card transition-shadow hover:shadow-card-hover"
                >
                  <span className="flex items-center gap-2 font-medium text-fg">
                    <Avatar name={`${r.firstName} ${r.lastName}`} size="sm" />
                    {r.firstName} {r.lastName}
                  </span>
                  <span className="mt-1 block truncate text-xs text-muted">{r.companyName}</span>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
