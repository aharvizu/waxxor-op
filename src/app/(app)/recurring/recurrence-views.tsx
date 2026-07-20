import Link from "next/link";
import { fmtDate, fmtDateTime } from "@/lib/format";
import {
  recurrenceExecutionStatusMeta,
  recurrenceFrequencyMeta,
  recurrenceStatusMeta,
  recurrenceTargetTypeMeta,
} from "@/lib/labels";
import { describeSchedule, successRate, toSchedule } from "@/lib/recurrence-data";
import { Badge, Card, EmptyState, THead, Table, Td, Th, cx } from "@/components/ui";
import { Repeat } from "lucide-react";
import { FavoriteToggle } from "@/components/views/favorite-toggle";
import { RowAction } from "./recurring-forms";
import { RecurrenceKanban } from "./recurrence-kanban";
import type { recurrenceDefinitions } from "@/db/schema";

export type RecurrenceRow = {
  def: typeof recurrenceDefinitions.$inferSelect;
  companyName: string | null;
  projectName: string | null;
  assigneeName: string | null;
  lastResultStatus: string | null;
  isFavorite: boolean;
};

function RowActions({ r }: { r: RecurrenceRow }) {
  return (
    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
      {r.def.status === "active" ? (
        <>
          <RowAction action="runRecurrenceNow" fields={{ id: r.def.id }} label="Ejecutar" />
          <RowAction action="pauseRecurrence" fields={{ id: r.def.id }} label="Pausar" />
        </>
      ) : null}
      {r.def.status === "paused" || r.def.status === "error" ? (
        <RowAction action="reactivateRecurrence" fields={{ id: r.def.id }} label="Reactivar" />
      ) : null}
      {!r.def.archivedAt && r.def.status !== "archived" ? (
        <RowAction action="archiveRecurrence" fields={{ id: r.def.id }} label="Archivar" confirm={`¿Archivar "${r.def.name}"?`} />
      ) : null}
    </div>
  );
}

function EmptyRecurring() {
  return (
    <EmptyState icon={<Repeat />} title="Sin recurrencias">
      Nada coincide con esta vista o filtros.
    </EmptyState>
  );
}

/* ------------------------------------------------------------------ table */

export function TableView({ rows, basePath }: { rows: RecurrenceRow[]; basePath: string }) {
  if (rows.length === 0) return <EmptyRecurring />;
  return (
    <Card className="overflow-visible">
      <Table>
        <THead>
          <tr>
            <Th> </Th>
            <Th>Nombre</Th>
            <Th>Tipo</Th>
            <Th>Empresa</Th>
            <Th>Proyecto</Th>
            <Th>Responsable</Th>
            <Th>Frecuencia</Th>
            <Th>Próxima ejecución</Th>
            <Th>Última</Th>
            <Th>Resultado</Th>
            <Th>Estado</Th>
            <Th>Ejecuciones</Th>
            <Th>Errores</Th>
            <Th>Acciones</Th>
          </tr>
        </THead>
        <tbody className="divide-y divide-edge">
          {rows.map((r) => {
            const rate = successRate(r.def);
            return (
              <tr key={r.def.id} className="group transition-colors hover:bg-subtle">
                <Td>
                  <FavoriteToggle module="recurring" entityId={r.def.id} isFavorite={r.isFavorite} basePath={basePath} />
                </Td>
                <Td>
                  <Link href={`/recurring/${r.def.id}`} className="font-medium text-fg transition-colors group-hover:text-primary">
                    {r.def.name}
                  </Link>
                  <span className="block text-xs text-muted">{describeSchedule(toSchedule(r.def))}</span>
                </Td>
                <Td>
                  <Badge tone={recurrenceTargetTypeMeta[r.def.targetType]?.tone ?? "slate"}>
                    {recurrenceTargetTypeMeta[r.def.targetType]?.label ?? r.def.targetType}
                  </Badge>
                </Td>
                <Td className="text-muted">{r.companyName ?? "—"}</Td>
                <Td className="text-muted">{r.projectName ?? "—"}</Td>
                <Td className="text-muted">{r.assigneeName ?? "—"}</Td>
                <Td className="text-muted">{recurrenceFrequencyMeta[r.def.frequency]?.label ?? r.def.frequency}</Td>
                <Td className="text-muted">{r.def.nextRunAt ? fmtDateTime(r.def.nextRunAt) : "—"}</Td>
                <Td className="text-muted">{r.def.lastRunAt ? fmtDate(r.def.lastRunAt) : "—"}</Td>
                <Td>
                  {r.lastResultStatus ? (
                    <Badge tone={recurrenceExecutionStatusMeta[r.lastResultStatus]?.tone ?? "slate"}>
                      {recurrenceExecutionStatusMeta[r.lastResultStatus]?.label ?? r.lastResultStatus}
                    </Badge>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td>
                  <Badge tone={recurrenceStatusMeta[r.def.status]?.tone ?? "slate"}>
                    {recurrenceStatusMeta[r.def.status]?.label ?? r.def.status}
                  </Badge>
                </Td>
                <Td className="tabular-nums text-muted">
                  {r.def.occurrenceCount}
                  {rate !== null ? ` (${rate}%)` : ""}
                </Td>
                <Td className={cx("tabular-nums", r.def.failedCount > 0 ? "text-danger" : "text-muted")}>{r.def.failedCount}</Td>
                <Td>
                  <RowActions r={r} />
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </Card>
  );
}

/* ------------------------------------------------------------------- list */

export function ListView({ rows, basePath }: { rows: RecurrenceRow[]; basePath: string }) {
  if (rows.length === 0) return <EmptyRecurring />;
  return (
    <Card className="overflow-hidden">
      <ul className="divide-y divide-edge">
        {rows.map((r) => (
          <li key={r.def.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <FavoriteToggle module="recurring" entityId={r.def.id} isFavorite={r.isFavorite} basePath={basePath} />
            <Badge tone={recurrenceStatusMeta[r.def.status]?.tone ?? "slate"}>{recurrenceStatusMeta[r.def.status]?.label ?? r.def.status}</Badge>
            <Link href={`/recurring/${r.def.id}`} className="min-w-0 flex-1 truncate font-medium text-fg hover:text-primary">
              {r.def.name}
            </Link>
            <span className="shrink-0 text-xs text-muted">{r.companyName ?? "—"}</span>
            <Badge tone={recurrenceTargetTypeMeta[r.def.targetType]?.tone ?? "slate"}>{recurrenceTargetTypeMeta[r.def.targetType]?.label ?? r.def.targetType}</Badge>
            <span className="w-28 shrink-0 truncate text-xs text-muted">{r.assigneeName ?? "—"}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ---------------------------------------------------------------- kanban */

export function KanbanView({ rows }: { rows: RecurrenceRow[] }) {
  if (rows.length === 0) return <EmptyRecurring />;
  return <RecurrenceKanban rows={rows} />;
}
