import Link from "next/link";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { ticketBillingMeta, ticketPriorityMeta, ticketStatusMeta } from "@/lib/labels";
import type { StyledMeta } from "@/lib/catalog-styles";
import { formatMinutes } from "@/lib/time-entries";
import { Badge, Card, EmptyState, THead, Table, Td, Th, cx } from "@/components/ui";
import { LifeBuoy, Plus } from "lucide-react";
import { TicketRowActions } from "./ticket-row-actions";
import { FavoriteToggle } from "./favorite-toggle";

export type TicketRow = {
  id: number;
  folio: string;
  title: string;
  status: string;
  priority: string;
  category: string | null;
  slaName: string | null;
  resolutionTargetAt: Date | null;
  billingStatus: string;
  companyName: string | null;
  assigneeId: number | null;
  assigneeName: string | null;
  updatedAt: Date;
  createdAt: Date;
  minutes: number;
  isFavorite: boolean;
  customFields: Record<string, unknown>;
};

export type ColumnDef = { key: string; label: string; render: (r: TicketRow) => React.ReactNode };

export function buildColumnRegistry(customFieldDefs: { key: string; name: string }[]): Record<string, ColumnDef> {
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
    companyName: { key: "companyName", label: "Empresa", render: (r) => <span className="text-muted">{r.companyName ?? "—"}</span> },
    assigneeName: { key: "assigneeName", label: "Responsable", render: (r) => <span className="text-muted">{r.assigneeName ?? "Sin asignar"}</span> },
    status: {
      key: "status",
      label: "Estado",
      render: (r) => <Badge tone={ticketStatusMeta[r.status]?.tone ?? "slate"}>{ticketStatusMeta[r.status]?.label ?? r.status}</Badge>,
    },
    priority: {
      key: "priority",
      label: "Prioridad",
      render: (r) => <Badge tone={ticketPriorityMeta[r.priority]?.tone ?? "slate"}>{ticketPriorityMeta[r.priority]?.label ?? r.priority}</Badge>,
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
      render: (r) => <Badge tone={ticketBillingMeta[r.billingStatus]?.tone ?? "slate"}>{ticketBillingMeta[r.billingStatus]?.label ?? r.billingStatus}</Badge>,
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
}: {
  rows: TicketRow[];
  columns: string[];
  registry: Record<string, ColumnDef>;
  users: { id: number; name: string }[];
}) {
  if (rows.length === 0) return <EmptyTickets />;
  const activeColumns = (columns.length > 0 ? columns : DEFAULT_COLUMNS).filter((c) => registry[c]);
  return (
    <Card className="overflow-visible">
      <Table>
        <THead>
          <tr>
            <Th> </Th>
            {activeColumns.map((c) => <Th key={c}>{registry[c].label}</Th>)}
            <Th>Acciones</Th>
          </tr>
        </THead>
        <tbody className="divide-y divide-edge">
          {rows.map((r) => (
            <tr key={r.id} className="group transition-colors hover:bg-subtle">
              <Td><FavoriteToggle ticketId={r.id} isFavorite={r.isFavorite} /></Td>
              {activeColumns.map((c) => <Td key={c}>{registry[c].render(r)}</Td>)}
              <Td>
                <TicketRowActions ticketId={r.id} status={r.status} priority={r.priority} assigneeId={r.assigneeId} users={users} />
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

/* ------------------------------------------------------------------- list */

export function ListView({ rows }: { rows: TicketRow[] }) {
  if (rows.length === 0) return <EmptyTickets />;
  return (
    <Card className="overflow-hidden">
      <ul className="divide-y divide-edge">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <FavoriteToggle ticketId={r.id} isFavorite={r.isFavorite} />
            <Badge tone={ticketStatusMeta[r.status]?.tone ?? "slate"}>{ticketStatusMeta[r.status]?.label ?? r.status}</Badge>
            <Link href={`/helpdesk/${r.id}`} className="min-w-0 flex-1 truncate font-medium text-fg hover:text-primary">
              {r.folio} · {r.title}
            </Link>
            <span className="shrink-0 text-xs text-muted">{r.companyName ?? "—"}</span>
            <Badge tone={ticketPriorityMeta[r.priority]?.tone ?? "slate"}>{ticketPriorityMeta[r.priority]?.label ?? r.priority}</Badge>
            <span className="w-28 shrink-0 truncate text-xs text-muted">{r.assigneeName ?? "Sin asignar"}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ---------------------------------------------------------------- kanban */

export function KanbanView({
  rows,
  groupByField,
  groupStyles,
  groupValues,
}: {
  rows: TicketRow[];
  groupByField: "status" | "priority";
  groupStyles: Record<string, StyledMeta>;
  groupValues: readonly string[];
}) {
  if (rows.length === 0) return <EmptyTickets />;
  const ordered = [...groupValues].sort((a, b) => groupStyles[a].sortOrder - groupStyles[b].sortOrder);
  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {ordered.map((value) => {
        const items = rows.filter((r) => r[groupByField] === value);
        const meta = groupStyles[value];
        return (
          <div key={value} className="w-72 shrink-0">
            <div className="mb-2 flex items-center justify-between px-1">
              <Badge tone={meta.tone}>{meta.label}</Badge>
              <span className="text-xs text-faint">{items.length}</span>
            </div>
            <div className="space-y-2">
              {items.map((r) => (
                <Link
                  key={r.id}
                  href={`/helpdesk/${r.id}`}
                  className="block rounded-lg border border-edge bg-surface p-3 text-sm shadow-card transition-colors hover:border-edge-strong"
                >
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] text-faint">{r.folio}</span>
                    <Badge tone={ticketPriorityMeta[r.priority]?.tone ?? "slate"}>{ticketPriorityMeta[r.priority]?.label ?? r.priority}</Badge>
                  </div>
                  <p className="mb-2 line-clamp-2 font-medium text-fg">{r.title}</p>
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span className="truncate">{r.companyName ?? "—"}</span>
                    <span className="shrink-0">{r.assigneeName ?? "Sin asignar"}</span>
                  </div>
                </Link>
              ))}
              {items.length === 0 ? <p className="px-1 text-xs text-faint">Sin tickets</p> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------------- calendar */

export function CalendarView({ rows }: { rows: TicketRow[] }) {
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
              <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <Badge tone={ticketStatusMeta[r.status]?.tone ?? "slate"}>{ticketStatusMeta[r.status]?.label ?? r.status}</Badge>
                <Link href={`/helpdesk/${r.id}`} className="min-w-0 flex-1 truncate font-medium text-fg hover:text-primary">{r.folio} · {r.title}</Link>
                <span className="shrink-0 text-xs text-muted">{r.companyName ?? "—"}</span>
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
                <Badge tone={ticketStatusMeta[r.status]?.tone ?? "slate"}>{ticketStatusMeta[r.status]?.label ?? r.status}</Badge>
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

export function TimelineView({ rows }: { rows: TicketRow[] }) {
  if (rows.length === 0) return <EmptyTickets />;
  const sorted = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return (
    <Card className="overflow-hidden">
      <ul className="divide-y divide-edge">
        {sorted.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-4 py-3 text-sm">
            <div className="w-24 shrink-0 text-xs text-faint tabular-nums">{fmtDate(r.createdAt)}</div>
            <div className="h-full w-px shrink-0 self-stretch bg-edge" aria-hidden />
            <Badge tone={ticketStatusMeta[r.status]?.tone ?? "slate"}>{ticketStatusMeta[r.status]?.label ?? r.status}</Badge>
            <Link href={`/helpdesk/${r.id}`} className="min-w-0 flex-1 truncate font-medium text-fg hover:text-primary">{r.folio} · {r.title}</Link>
            <div className="w-28 shrink-0 text-right text-xs text-muted">
              {r.resolutionTargetAt ? `vence ${fmtDate(r.resolutionTargetAt)}` : "sin vencimiento"}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
