import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, ne } from "drizzle-orm";
import { Archive, CheckCircle2, Clock, History, ListChecks, Repeat } from "lucide-react";
import { db } from "@/db";
import { auditLogs, clients, projectLists, projects, users } from "@/db/schema";
import { fmtDate, fmtDateTime } from "@/lib/format";
import {
  recurrenceExecutionSourceMeta,
  recurrenceExecutionStatusMeta,
  recurrenceStatusMeta,
  recurrenceTargetTypeMeta,
} from "@/lib/labels";
import {
  describeSchedule,
  getRecurrenceDetail,
  getRecurrenceExecutions,
  successRate,
  toSchedule,
  upcomingOccurrences,
} from "@/lib/recurrence-data";
import { RECURRENCE_MAX_CONSECUTIVE_FAILURES } from "@/lib/recurrence";
import { requireUser } from "@/lib/session";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  StatCard,
  THead,
  Table,
  Td,
  Th,
  buttonSecondaryClass,
  cx,
} from "@/components/ui";
import {
  ActivateButton,
  BackfillForm,
  Disclosure,
  DuplicateForm,
  PauseForm,
  ReactivateForm,
  RecurrenceWizard,
  RetryButton,
  RowAction,
  SkipForm,
} from "../recurring-forms";

export const metadata: Metadata = { title: "Recurrence" };

const TABS = [
  ["resumen", "Resumen"],
  ["configuracion", "Configuración"],
  ["proximas", "Próximas ocurrencias"],
  ["historial", "Historial"],
  ["auditoria", "Auditoría"],
] as const;
type Tab = (typeof TABS)[number][0];

function TabLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cx(
        "shrink-0 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
        active ? "bg-primary-soft text-primary" : "text-muted hover:bg-subtle hover:text-fg",
      )}
    >
      {children}
    </Link>
  );
}

const MGMT_ROLES = ["superadmin", "administrator", "director", "project_manager"];

export default async function RecurrenceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { tab: rawTab } = await searchParams;
  const recurrenceId = Number(id);
  if (!Number.isInteger(recurrenceId)) notFound();

  const detail = await getRecurrenceDetail(user.organizationId, recurrenceId);
  if (!detail) notFound();
  const def = detail.def;

  const tab: Tab = TABS.some(([t]) => t === rawTab) ? (rawTab as Tab) : "resumen";
  const isMgmt = MGMT_ROLES.includes(user.role);
  const canBackfill = ["superadmin", "administrator", "director"].includes(user.role);
  const rate = successRate(def);
  const upcoming = def.status === "active" ? upcomingOccurrences(def, 5) : [];

  return (
    <div>
      {def.archivedAt ? (
        <div className="mb-5 flex items-center gap-2 rounded-lg border border-edge bg-subtle px-4 py-3 text-sm text-muted">
          <Archive className="size-4 shrink-0" />
          Esta recurrencia está archivada — se conservan sus ejecuciones y objetos generados.
        </div>
      ) : null}
      {def.status === "paused" ? (
        <div className="mb-5 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-fg">
          Pausada{def.pauseReason ? `: ${def.pauseReason}` : ""}. Próxima fecha de referencia si se reactiva:{" "}
          {def.nextRunAt ? fmtDateTime(def.nextRunAt) : "sin calcular"} (no se ejecutará mientras esté pausada).
        </div>
      ) : null}
      {def.status === "error" ? (
        <div className="mb-5 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-fg">
          Pausada automáticamente tras {RECURRENCE_MAX_CONSECUTIVE_FAILURES} fallos consecutivos. Corrige la
          configuración (cliente, responsable, proyecto/lista) y reactívala.
        </div>
      ) : null}
      {def.status === "completed" ? (
        <div className="mb-5 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary-soft px-4 py-3 text-sm text-primary">
          <CheckCircle2 className="size-4 shrink-0" />
          Recurrencia finalizada. El historial sigue disponible abajo.
        </div>
      ) : null}

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {def.name}
            <Badge tone={recurrenceStatusMeta[def.status]?.tone ?? "slate"}>
              {recurrenceStatusMeta[def.status]?.label ?? def.status}
            </Badge>
            <Badge tone={recurrenceTargetTypeMeta[def.targetType]?.tone ?? "slate"}>
              {recurrenceTargetTypeMeta[def.targetType]?.label ?? def.targetType}
            </Badge>
          </span>
        }
        subtitle={describeSchedule(toSchedule(def))}
        action={
          <>
            {def.status === "draft" || def.status === "paused" || def.status === "error" ? (
              <ActivateButton id={def.id} />
            ) : null}
            {def.status === "active" ? (
              <RowAction action="runRecurrenceNow" fields={{ id: def.id }} label="Ejecutar ahora" confirm="¿Generar una ocurrencia manual ahora?" />
            ) : null}
            <Link href="/recurring" className={buttonSecondaryClass}>Volver</Link>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard icon={<Repeat />} label="Total ejecutadas" value={String(def.occurrenceCount)} />
        <StatCard icon={<CheckCircle2 />} label="Exitosas" value={String(def.successfulCount)} footer={rate !== null ? `${rate}% de éxito` : undefined} />
        <StatCard icon={<History />} label="Fallidas" value={String(def.failedCount)} />
        <StatCard icon={<ListChecks />} label="Omitidas" value={String(def.skippedCount)} />
        <StatCard icon={<Clock />} label="Próxima ejecución" value={def.nextRunAt ? fmtDate(def.nextRunAt) : "—"} />
        <StatCard icon={<Clock />} label="Última ejecución" value={def.lastRunAt ? fmtDate(def.lastRunAt) : "—"} />
      </div>

      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-edge pb-px">
        {TABS.map(([key, label]) => (
          <TabLink key={key} href={`/recurring/${recurrenceId}?tab=${key}`} active={tab === key}>{label}</TabLink>
        ))}
      </div>

      {tab === "resumen" ? <ResumenTab detail={detail} isMgmt={isMgmt} canBackfill={canBackfill} /> : null}
      {tab === "configuracion" ? <ConfiguracionTab orgId={user.organizationId} def={def} isSuperAdmin={user.role === "superadmin"} /> : null}
      {tab === "proximas" ? <ProximasTab upcoming={upcoming} status={def.status} /> : null}
      {tab === "historial" ? <HistorialTab orgId={user.organizationId} definitionId={def.id} /> : null}
      {tab === "auditoria" ? <AuditoriaTab orgId={user.organizationId} definitionId={def.id} canSeeTechnical={user.role === "superadmin" || user.role === "administrator"} /> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ Resumen */

async function ResumenTab({
  detail,
  isMgmt,
  canBackfill,
}: {
  detail: NonNullable<Awaited<ReturnType<typeof getRecurrenceDetail>>>;
  isMgmt: boolean;
  canBackfill: boolean;
}) {
  const def = detail.def;
  const recentExecutions = await getRecurrenceExecutions(def.organizationId, def.id, { limit: 5 });
  const activeErrors = recentExecutions.filter((e) => e.exec.status === "failed");

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <div className="space-y-6 xl:col-span-2">
        {activeErrors.length > 0 ? (
          <Card className="overflow-hidden">
            <CardHeader title="Atención requerida" />
            <ul className="divide-y divide-edge">
              {activeErrors.map(({ exec }) => (
                <li key={exec.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                  <span className="min-w-0 truncate text-fg">{exec.errorMessage ?? "Error sin detalle."}</span>
                  {exec.status === "failed" && def.status !== "archived" ? (
                    <RetryButton executionId={exec.id} definitionId={def.id} />
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <Card className="overflow-hidden">
          <CardHeader title="Objetos recientes" />
          {recentExecutions.filter((e) => e.exec.generatedEntityId).length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted">Aún no se ha generado ningún objeto.</p>
          ) : (
            <ul className="divide-y divide-edge">
              {recentExecutions
                .filter((e) => e.exec.generatedEntityId)
                .map(({ exec }) => (
                  <li key={exec.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                    <Link
                      href={exec.generatedEntityType === "ticket" ? `/helpdesk/${exec.generatedEntityId}` : `/activities/${exec.generatedEntityId}`}
                      className="font-medium text-fg hover:text-primary"
                    >
                      {exec.generatedEntityType} #{exec.generatedEntityId}
                    </Link>
                    <span className="text-xs text-faint tabular-nums">{fmtDateTime(exec.completedAt)}</span>
                  </li>
                ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="p-5">
          <CardHeader title="Contexto" className="mb-3 px-0 pt-0" />
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Cliente</dt><dd className="text-fg">{detail.clientName ?? "Interno"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Proyecto</dt><dd className="text-fg">{detail.projectName ?? "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Responsable</dt><dd className="text-fg">{detail.assigneeName ?? "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Creado por</dt><dd className="text-fg">{detail.creatorName ?? "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Zona horaria</dt><dd className="text-fg">{def.timezone}</dd></div>
          </dl>
        </Card>

        {isMgmt && def.status !== "archived" ? (
          <Card className="p-5">
            <CardHeader title="Acciones" className="mb-3 px-0 pt-0" />
            <div className="space-y-3">
              {def.status === "active" ? (
                <Disclosure label="Pausar">
                  <PauseForm id={def.id} />
                </Disclosure>
              ) : null}
              {def.status === "paused" || def.status === "error" ? (
                <Disclosure label="Reactivar">
                  <ReactivateForm id={def.id} />
                </Disclosure>
              ) : null}
              {def.status === "active" ? (
                <Disclosure label="Omitir próxima ocurrencia">
                  <SkipForm id={def.id} />
                </Disclosure>
              ) : null}
              <Disclosure label="Duplicar">
                <DuplicateForm id={def.id} defaultName={def.name} />
              </Disclosure>
              {["active", "paused", "completed", "expired", "error"].includes(def.status) ? (
                <RowAction action="finishRecurrence" fields={{ id: def.id }} label="Finalizar" confirm="¿Finalizar esta recurrencia? No se generarán más ocurrencias." />
              ) : null}
              <RowAction action="archiveRecurrence" fields={{ id: def.id }} label="Archivar" confirm={`¿Archivar "${def.name}"?`} />
              {canBackfill && def.status !== "draft" ? (
                <Disclosure label="Generar faltantes (backfill)">
                  <BackfillForm id={def.id} />
                </Disclosure>
              ) : null}
            </div>
          </Card>
        ) : null}
        {def.archivedAt && isMgmt ? (
          <Card className="p-5">
            <RowAction action="restoreRecurrence" fields={{ id: def.id }} label="Restaurar" />
          </Card>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- Configuración */

async function ConfiguracionTab({
  orgId,
  def,
  isSuperAdmin,
}: {
  orgId: number;
  def: NonNullable<Awaited<ReturnType<typeof getRecurrenceDetail>>>["def"];
  isSuperAdmin: boolean;
}) {
  const [clientRows, projectRows, listRows, userRows] = await Promise.all([
    db.select({ id: clients.id, name: clients.name }).from(clients).where(eq(clients.organizationId, orgId)).orderBy(asc(clients.name)),
    db.select({ id: projects.id, name: projects.name }).from(projects).where(eq(projects.organizationId, orgId)).orderBy(asc(projects.name)),
    db.select({ id: projectLists.id, name: projectLists.name, projectId: projectLists.projectId }).from(projectLists).where(eq(projectLists.organizationId, orgId)),
    db.select({ id: users.id, name: users.name }).from(users).where(and(eq(users.organizationId, orgId), ne(users.role, "client"))).orderBy(asc(users.name)),
  ]);
  const projectListsByProject: Record<number, { id: number; name: string }[]> = {};
  for (const l of listRows) (projectListsByProject[l.projectId] ??= []).push({ id: l.id, name: l.name });

  if (def.targetType === "report") {
    return (
      <p className="text-sm text-muted">
        Las recurrencias de Reporte no son editables todavía — la generación automática de reportes está
        reservada hasta que el módulo de Reportes soporte contenido real (ver docs/features/recurring.md).
      </p>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <Card className="p-6">
        <RecurrenceWizard
          clients={clientRows}
          projects={projectRows}
          projectListsByProject={projectListsByProject}
          internalUsers={userRows}
          defaults={{
            id: def.id,
            name: def.name,
            description: def.description,
            targetType: def.targetType,
            clientId: def.clientId,
            projectId: def.projectId,
            projectListId: def.projectListId,
            assigneeId: def.assigneeId,
            frequency: def.frequency,
            interval: def.interval,
            daysOfWeek: def.daysOfWeek as number[] | null,
            dayOfMonth: def.dayOfMonth,
            monthOfYear: def.monthOfYear,
            weekOfMonth: def.weekOfMonth,
            timeOfDay: def.timeOfDay,
            timezone: def.timezone,
            startAt: def.startAt,
            endAt: def.endAt,
            maxOccurrences: def.maxOccurrences,
            templateData: def.templateData as Record<string, unknown>,
          }}
        />
      </Card>
      {isSuperAdmin ? (
        <Card className="p-5">
          <CardHeader title="Eliminación permanente" description="Solo SuperAdmin. Bloqueado si esta recurrencia generó objetos — archívala en ese caso." className="mb-3 px-0 pt-0" />
          <RowAction
            action="deleteRecurrence"
            fields={{ id: def.id }}
            label="Eliminar permanentemente"
            confirm={`¿Eliminar "${def.name}" para siempre? Esta acción no se puede deshacer.`}
            danger
          />
        </Card>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------- Próximas ocurrencias */

function ProximasTab({
  upcoming,
  status,
}: {
  upcoming: { local: string; runAt: Date }[];
  status: string;
}) {
  if (status !== "active") {
    return (
      <EmptyState icon={<Clock />} title="Sin ejecuciones programadas">
        {status === "draft"
          ? "Esta recurrencia todavía no se ha activado."
          : "Esta recurrencia no está activa — no se calculan próximas ocurrencias mientras tanto."}
      </EmptyState>
    );
  }
  if (upcoming.length === 0) {
    return (
      <EmptyState icon={<Clock />} title="Sin próximas ocurrencias">
        La recurrencia ya alcanzó su fecha de fin o el máximo de ocurrencias.
      </EmptyState>
    );
  }
  return (
    <Card className="overflow-visible">
      <Table>
        <THead>
          <tr>
            <Th>Fecha</Th>
            <Th>Hora</Th>
          </tr>
        </THead>
        <tbody className="divide-y divide-edge">
          {upcoming.map((o) => (
            <tr key={o.local}>
              <Td className="font-medium text-fg">{o.local}</Td>
              <Td className="text-muted">{fmtDateTime(o.runAt)}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

/* ----------------------------------------------------------------- Historial */

async function HistorialTab({ orgId, definitionId }: { orgId: number; definitionId: number }) {
  const rows = await getRecurrenceExecutions(orgId, definitionId, { limit: 100 });
  if (rows.length === 0) {
    return (
      <EmptyState icon={<History />} title="Sin ejecuciones todavía">
        Cuando llegue la primera fecha programada (o la ejecutes manualmente), aparecerá aquí.
      </EmptyState>
    );
  }
  return (
    <Card className="overflow-visible">
      <Table>
        <THead>
          <tr>
            <Th>Programada</Th>
            <Th>Estado</Th>
            <Th>Origen</Th>
            <Th>Intento</Th>
            <Th>Objeto</Th>
            <Th>Ejecutor</Th>
            <Th>Error</Th>
            <Th>Duración</Th>
          </tr>
        </THead>
        <tbody className="divide-y divide-edge">
          {rows.map(({ exec, executorName }) => {
            const duration =
              exec.startedAt && exec.completedAt
                ? `${Math.max(0, Math.round((exec.completedAt.getTime() - exec.startedAt.getTime()) / 1000))}s`
                : "—";
            return (
              <tr key={exec.id}>
                <Td className="text-muted">{fmtDateTime(exec.scheduledFor)}</Td>
                <Td>
                  <Badge tone={recurrenceExecutionStatusMeta[exec.status]?.tone ?? "slate"}>
                    {recurrenceExecutionStatusMeta[exec.status]?.label ?? exec.status}
                  </Badge>
                </Td>
                <Td className="text-muted">{recurrenceExecutionSourceMeta[exec.executionSource]?.label ?? exec.executionSource}</Td>
                <Td className="tabular-nums text-muted">{exec.attemptCount}</Td>
                <Td>
                  {exec.generatedEntityId ? (
                    <Link
                      href={exec.generatedEntityType === "ticket" ? `/helpdesk/${exec.generatedEntityId}` : `/activities/${exec.generatedEntityId}`}
                      className="text-primary hover:underline"
                    >
                      {exec.generatedEntityType} #{exec.generatedEntityId}
                    </Link>
                  ) : "—"}
                </Td>
                <Td className="text-muted">{executorName ?? "—"}</Td>
                <Td className="max-w-xs truncate text-danger">{exec.errorMessage ?? "—"}</Td>
                <Td className="text-muted">{duration}</Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </Card>
  );
}

/* ---------------------------------------------------------------- Auditoría */

async function AuditoriaTab({
  orgId,
  definitionId,
  canSeeTechnical,
}: {
  orgId: number;
  definitionId: number;
  canSeeTechnical: boolean;
}) {
  if (!canSeeTechnical) {
    return <p className="text-sm text-muted">El registro técnico es visible solo para SuperAdmin y Administrator.</p>;
  }
  const rows = await db
    .select({ log: auditLogs, actorName: users.name })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .where(and(eq(auditLogs.organizationId, orgId), eq(auditLogs.entityType, "recurrence_definition"), eq(auditLogs.entityId, definitionId)))
    .orderBy(auditLogs.createdAt);
  if (rows.length === 0) {
    return <p className="text-sm text-muted">Sin eventos de auditoría todavía.</p>;
  }
  return (
    <Card className="overflow-hidden">
      <ul className="divide-y divide-edge">
        {rows.map(({ log, actorName }) => (
          <li key={log.id} className="flex items-baseline justify-between gap-3 px-5 py-2.5 text-sm">
            <span className="min-w-0">
              <span className="font-medium text-fg">{log.field ?? log.action}</span>{" "}
              <span className="text-muted">{log.field ? `${log.oldValue ?? "—"} → ${log.newValue ?? "—"}` : ""}</span>
            </span>
            <span className="shrink-0 text-xs text-faint tabular-nums">{actorName ?? "sistema"} · {fmtDateTime(log.createdAt)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
