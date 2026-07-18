import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, ne } from "drizzle-orm";
import { Plus, Repeat } from "lucide-react";
import { db } from "@/db";
import { clients, projects, users } from "@/db/schema";
import { fmtDate, fmtDateTime } from "@/lib/format";
import {
  recurrenceExecutionStatusMeta,
  recurrenceFrequencyMeta,
  recurrenceStatusMeta,
  recurrenceTargetTypeMeta,
} from "@/lib/labels";
import { describeSchedule, getRecurrencesDirectory, successRate, toSchedule } from "@/lib/recurrence-data";
import { ENABLED_TARGET_TYPES, RECURRENCE_FREQUENCIES, RECURRENCE_STATUSES } from "@/lib/recurrence";
import { requireUser } from "@/lib/session";
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  THead,
  Table,
  Td,
  Th,
  buttonClass,
  buttonSecondaryClass,
  cx,
  inputClass,
} from "@/components/ui";
import { RowAction } from "./recurring-forms";

export const metadata: Metadata = { title: "Recurring" };

const VIEWS = [
  ["", "Activas"],
  ["all", "Todas"],
  ["upcoming", "Próximas"],
  ["today", "Hoy"],
  ["overdue", "Vencidas por ejecutar"],
  ["errors", "Con errores"],
  ["paused", "Pausadas"],
  ["mine", "Mis recurrencias"],
  ["completed", "Finalizadas"],
  ["archived", "Archivadas"],
] as const;

export default async function RecurringPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    view?: string;
    status?: string;
    targetType?: string;
    frequency?: string;
    clientId?: string;
    projectId?: string;
    assigneeId?: string;
  }>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  const [rows, clientRows, projectRows, userRows] = await Promise.all([
    getRecurrencesDirectory(user.organizationId, Number(user.id), {
      q: params.q,
      view: params.view,
      status: params.status,
      targetType: params.targetType,
      frequency: params.frequency,
      clientId: params.clientId ? Number(params.clientId) : undefined,
      projectId: params.projectId ? Number(params.projectId) : undefined,
      assigneeId: params.assigneeId ? Number(params.assigneeId) : undefined,
    }),
    db.select({ id: clients.id, name: clients.name }).from(clients).where(eq(clients.organizationId, user.organizationId)).orderBy(asc(clients.name)),
    db.select({ id: projects.id, name: projects.name }).from(projects).where(eq(projects.organizationId, user.organizationId)).orderBy(asc(projects.name)),
    db.select({ id: users.id, name: users.name }).from(users).where(and(eq(users.organizationId, user.organizationId), ne(users.role, "client"))).orderBy(asc(users.name)),
  ]);

  const buildHref = (patch: Record<string, string | undefined>) => {
    const next = { ...params, ...patch };
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) qs.set(k, v);
    const s = qs.toString();
    return s ? `/recurring?${s}` : "/recurring";
  };

  return (
    <div>
      <PageHeader
        title="Recurrentes"
        subtitle="Trabajo operativo que Watson crea, asigna y supervisa automáticamente."
        action={
          <Link href="/recurring/new" className={buttonClass}>
            <Plus className="size-4" /> Nueva recurrencia
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {VIEWS.map(([value, label]) => (
          <Link
            key={value}
            href={buildHref({ view: value || undefined })}
            className={cx(
              "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              (params.view ?? "") === value
                ? "bg-primary-soft text-primary"
                : "border border-edge text-muted hover:bg-subtle hover:text-fg",
            )}
          >
            {label}
          </Link>
        ))}
      </div>

      <form method="get" className="mb-6 flex flex-wrap items-center gap-3">
        {params.view ? <input type="hidden" name="view" value={params.view} /> : null}
        <input
          type="search"
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Buscar por nombre…"
          className={cx(inputClass, "max-w-xs")}
        />
        <select name="status" defaultValue={params.status ?? ""} className={cx(inputClass, "w-auto")}>
          <option value="">Estado</option>
          {RECURRENCE_STATUSES.map((s) => (
            <option key={s} value={s}>{recurrenceStatusMeta[s]?.label ?? s}</option>
          ))}
        </select>
        <select name="targetType" defaultValue={params.targetType ?? ""} className={cx(inputClass, "w-auto")}>
          <option value="">Tipo</option>
          {ENABLED_TARGET_TYPES.map((t) => (
            <option key={t} value={t}>{recurrenceTargetTypeMeta[t]?.label ?? t}</option>
          ))}
        </select>
        <select name="frequency" defaultValue={params.frequency ?? ""} className={cx(inputClass, "w-auto")}>
          <option value="">Frecuencia</option>
          {RECURRENCE_FREQUENCIES.map((f) => (
            <option key={f} value={f}>{recurrenceFrequencyMeta[f]?.label ?? f}</option>
          ))}
        </select>
        <select name="clientId" defaultValue={params.clientId ?? ""} className={cx(inputClass, "w-auto")}>
          <option value="">Cliente</option>
          {clientRows.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select name="projectId" defaultValue={params.projectId ?? ""} className={cx(inputClass, "w-auto")}>
          <option value="">Proyecto</option>
          {projectRows.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select name="assigneeId" defaultValue={params.assigneeId ?? ""} className={cx(inputClass, "w-auto")}>
          <option value="">Responsable</option>
          {userRows.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
        <button type="submit" className={buttonSecondaryClass}>Filtrar</button>
      </form>

      {rows.length === 0 ? (
        <EmptyState icon={<Repeat />} title="Todavía no has automatizado trabajo recurrente">
          <div className="space-y-3">
            <p>Crea tu primera recurrencia para dejar de depender de recordarlo manualmente.</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Link href="/recurring/new" className={buttonSecondaryClass}>Crear recurrencia</Link>
              <Link href="/recurring/new?targetType=activity" className={buttonSecondaryClass}>Actividad mensual</Link>
              <Link href="/recurring/new?targetType=ticket" className={buttonSecondaryClass}>Ticket periódico</Link>
            </div>
          </div>
        </EmptyState>
      ) : (
        <Card className="overflow-visible">
          <Table>
            <THead>
              <tr>
                <Th>Nombre</Th>
                <Th>Tipo</Th>
                <Th>Cliente</Th>
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
                    <Td className="text-muted">{r.clientName ?? "—"}</Td>
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
                      ) : "—"}
                    </Td>
                    <Td>
                      <Badge tone={recurrenceStatusMeta[r.def.status]?.tone ?? "slate"}>
                        {recurrenceStatusMeta[r.def.status]?.label ?? r.def.status}
                      </Badge>
                    </Td>
                    <Td className="tabular-nums text-muted">
                      {r.def.occurrenceCount}{rate !== null ? ` (${rate}%)` : ""}
                    </Td>
                    <Td className={cx("tabular-nums", r.def.failedCount > 0 ? "text-danger" : "text-muted")}>
                      {r.def.failedCount}
                    </Td>
                    <Td>
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
                          <RowAction
                            action="archiveRecurrence"
                            fields={{ id: r.def.id }}
                            label="Archivar"
                            confirm={`¿Archivar "${r.def.name}"?`}
                          />
                        ) : null}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
