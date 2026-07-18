import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, ne } from "drizzle-orm";
import {
  AlertTriangle,
  Archive,
  Clock,
  FileText,
  Flag,
  FolderKanban,
  History,
  ListChecks,
  MessageSquare,
  Users,
} from "lucide-react";
import { db } from "@/db";
import { clients, users } from "@/db/schema";
import { fmtDate, fmtDateTime } from "@/lib/format";
import {
  activityStatusMeta,
  milestoneStatusMeta,
  projectHealthMeta,
  projectListStatusMeta,
  projectMemberRoleMeta,
  projectPriorityMeta,
  projectStatusMeta,
  recurrenceStatusMeta,
  riskSeverityMeta,
  riskStatusMeta,
  ticketPriorityMeta,
} from "@/lib/labels";
import {
  getMilestoneLinks,
  getProjectAttachments,
  getProjectAuditTrail,
  getProjectComments,
  getProjectDependencies,
  getProjectDetail,
  getProjectMembers,
  getProjectMilestones,
  getProjectRisks,
  getProjectTimeRollup,
  getProjectWorkTree,
  toProgressInput,
  type ProjectTreeActivity,
} from "@/lib/project-data";
import {
  OPEN_ACTIVITY_STATUSES,
  computeProgress,
  describeProjectAuditEvent,
  suggestedHealth,
} from "@/lib/projects";
import { getProjectRecurrences } from "@/lib/recurrence-data";
import { requireUser } from "@/lib/session";
import { formatMinutes } from "@/lib/time-entries";
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
  CommentComposer,
  CommentEditor,
  CompleteActivityButton,
  CompleteProjectForm,
  DependencyForm,
  Disclosure,
  HealthSelect,
  ListForm,
  MemberForm,
  MilestoneForm,
  MilestoneLinkForm,
  MoveToListForm,
  ProjectActivityForm,
  ProjectForm,
  ProjectUploadForm,
  RiskForm,
  RowAction,
  StatusSelect,
} from "../project-forms";

export const metadata: Metadata = { title: "Project" };

const TABS = [
  ["resumen", "Resumen"],
  ["trabajo", "Trabajo"],
  ["hitos", "Hitos"],
  ["riesgos", "Riesgos"],
  ["tiempo", "Tiempo"],
  ["archivos", "Archivos"],
  ["comentarios", "Comentarios"],
  ["historial", "Historial"],
  ["configuracion", "Configuración"],
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

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; mode?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { tab: rawTab, mode } = await searchParams;
  const projectId = Number(id);
  if (!Number.isInteger(projectId)) notFound();

  const detail = await getProjectDetail(user.organizationId, projectId);
  if (!detail) notFound();
  const project = detail.project;

  const tab: Tab = TABS.some(([t]) => t === rawTab) ? (rawTab as Tab) : "resumen";
  const now = new Date();
  const progressInput = toProgressInput(detail, now);
  const progress = computeProgress(progressInput);
  const suggested = suggestedHealth(progressInput);
  const isMgmt = MGMT_ROLES.includes(user.role);
  const archived = project.status === "archived";

  const internalUsers = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(and(eq(users.organizationId, user.organizationId), ne(users.role, "client")))
    .orderBy(asc(users.name));

  return (
    <div>
      {archived ? (
        <div className="mb-5 flex items-center gap-2 rounded-lg border border-edge bg-subtle px-4 py-3 text-sm text-muted">
          <Archive className="size-4 shrink-0" />
          Este proyecto está archivado — solo lectura. Restáuralo desde Configuración.
        </div>
      ) : null}
      {project.status === "completed" ? (
        <div className="mb-5 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary-soft px-4 py-3 text-sm text-primary">
          <Flag className="size-4 shrink-0" />
          Proyecto completado el {project.completedAt ? fmtDateTime(project.completedAt) : "—"} —
          resumen final abajo; el historial sigue disponible.
        </div>
      ) : null}

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-faint tabular-nums">{project.folio}</span>
            {project.name}
            <Badge tone={projectStatusMeta[project.status]?.tone ?? "slate"}>
              {projectStatusMeta[project.status]?.label ?? project.status}
            </Badge>
            <Badge tone={projectHealthMeta[project.healthStatus]?.tone ?? "slate"}>
              {projectHealthMeta[project.healthStatus]?.label ?? project.healthStatus}
            </Badge>
            <Badge tone={projectPriorityMeta[project.priority]?.tone ?? "slate"}>
              {projectPriorityMeta[project.priority]?.label ?? project.priority}
            </Badge>
          </span>
        }
        subtitle={
          <>
            {detail.clientName ? (
              <Link href={`/clients/${project.clientId}`} className="hover:text-primary">
                {detail.clientName}
              </Link>
            ) : (
              "Proyecto interno"
            )}
            {" · PM: "}
            {detail.managerName ?? "—"}
            {project.targetDate ? ` · Objetivo: ${fmtDate(project.targetDate)}` : " · Sin fecha objetivo"}
          </>
        }
        action={
          <Link href="/projects" className={buttonSecondaryClass}>
            Volver
          </Link>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard
          icon={<ListChecks />}
          label="Avance"
          value={`${progress.percent}%`}
          footer={`${detail.completed}/${detail.total} actividades`}
        />
        <StatCard
          icon={<AlertTriangle />}
          label="Vencidas / bloqueadas"
          value={`${detail.overdue} / ${detail.blocked}`}
        />
        <StatCard icon={<Users />} label="Sin responsable" value={String(detail.unassigned)} />
        <StatCard
          icon={<Flag />}
          label="Hitos"
          value={`${detail.milestonesCompleted}/${detail.milestonesTotal}`}
          footer={detail.milestonesOverdue > 0 ? `${detail.milestonesOverdue} vencido(s)` : undefined}
        />
        <StatCard
          icon={<Clock />}
          label="Tiempo"
          value={formatMinutes(detail.loggedMinutes)}
          footer={
            project.estimatedMinutes
              ? `de ${formatMinutes(project.estimatedMinutes)} estimados`
              : "sin estimación"
          }
        />
        <StatCard
          icon={<AlertTriangle />}
          label="Riesgos abiertos"
          value={String(detail.openRisks)}
          footer={detail.openHighRisks > 0 ? `${detail.openHighRisks} alto(s)/crítico(s)` : undefined}
        />
      </div>

      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-edge pb-px">
        {TABS.map(([key, label]) => (
          <TabLink key={key} href={`/projects/${projectId}?tab=${key}`} active={tab === key}>
            {label}
          </TabLink>
        ))}
      </div>

      {tab === "resumen" ? (
        <ResumenTab
          orgId={user.organizationId}
          projectId={projectId}
          detail={detail}
          progress={progress}
          suggested={suggested}
          now={now}
        />
      ) : null}
      {tab === "trabajo" ? (
        <TrabajoTab
          orgId={user.organizationId}
          projectId={projectId}
          internalUsers={internalUsers}
          archived={archived}
          tableMode={mode === "table"}
          now={now}
        />
      ) : null}
      {tab === "hitos" ? (
        <HitosTab
          orgId={user.organizationId}
          projectId={projectId}
          internalUsers={internalUsers}
          isMgmt={isMgmt}
          archived={archived}
          now={now}
        />
      ) : null}
      {tab === "riesgos" ? (
        <RiesgosTab
          orgId={user.organizationId}
          projectId={projectId}
          internalUsers={internalUsers}
          isMgmt={isMgmt}
          archived={archived}
        />
      ) : null}
      {tab === "tiempo" ? <TiempoTab orgId={user.organizationId} projectId={projectId} project={project} /> : null}
      {tab === "archivos" ? (
        <ArchivosTab orgId={user.organizationId} projectId={projectId} archived={archived} />
      ) : null}
      {tab === "comentarios" ? (
        <ComentariosTab
          orgId={user.organizationId}
          projectId={projectId}
          currentUserId={Number(user.id)}
          archived={archived}
        />
      ) : null}
      {tab === "historial" ? (
        <HistorialTab
          orgId={user.organizationId}
          projectId={projectId}
          canSeeTechnical={user.role === "superadmin" || user.role === "administrator"}
        />
      ) : null}
      {tab === "configuracion" ? (
        <ConfiguracionTab
          project={project}
          detail={detail}
          internalUsers={internalUsers}
          suggested={suggested}
          isMgmt={isMgmt}
          isSuperAdmin={user.role === "superadmin"}
          archived={archived}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ Resumen */

async function ResumenTab({
  orgId,
  projectId,
  detail,
  progress,
  suggested,
  now,
}: {
  orgId: number;
  projectId: number;
  detail: NonNullable<Awaited<ReturnType<typeof getProjectDetail>>>;
  progress: ReturnType<typeof computeProgress>;
  suggested: string;
  now: Date;
}) {
  const [milestones, risks, tree, members, audit, recurrences] = await Promise.all([
    getProjectMilestones(orgId, projectId),
    getProjectRisks(orgId, projectId),
    getProjectWorkTree(orgId, projectId),
    getProjectMembers(orgId, projectId),
    getProjectAuditTrail(orgId, projectId, 10),
    getProjectRecurrences(orgId, projectId),
  ]);
  const upcomingMilestones = milestones
    .filter((m) => !["completed", "cancelled"].includes(m.milestone.status))
    .slice(0, 5);
  const overdueActivities = tree.activities
    .filter(
      (a) =>
        (OPEN_ACTIVITY_STATUSES as readonly string[]).includes(a.status) &&
        a.dueDate !== null &&
        a.dueDate < now.toISOString().slice(0, 10),
    )
    .slice(0, 8);
  const topRisks = risks
    .filter((r) => ["open", "monitoring", "occurred"].includes(r.risk.status))
    .slice(0, 5);
  const byAssignee = new Map<string, number>();
  for (const a of tree.activities) {
    if (!(OPEN_ACTIVITY_STATUSES as readonly string[]).includes(a.status)) continue;
    const key = a.assigneeName ?? "Sin responsable";
    byAssignee.set(key, (byAssignee.get(key) ?? 0) + 1);
  }

  const attention: { text: string; href: string }[] = [];
  if (detail.overdue > 0)
    attention.push({ text: `${detail.overdue} actividad(es) vencida(s)`, href: `/projects/${projectId}?tab=trabajo` });
  if (detail.blocked > 0)
    attention.push({ text: `${detail.blocked} actividad(es) bloqueada(s)`, href: `/projects/${projectId}?tab=trabajo` });
  if (detail.unassigned > 0)
    attention.push({ text: `${detail.unassigned} sin responsable`, href: `/projects/${projectId}?tab=trabajo` });
  if (detail.milestonesOverdue > 0)
    attention.push({ text: `${detail.milestonesOverdue} hito(s) vencido(s)`, href: `/projects/${projectId}?tab=hitos` });
  if (detail.openHighRisks > 0)
    attention.push({ text: `${detail.openHighRisks} riesgo(s) alto(s)/crítico(s)`, href: `/projects/${projectId}?tab=riesgos` });
  if (
    progress.timeDeviationMinutes !== null &&
    detail.project.estimatedMinutes &&
    progress.timeDeviationMinutes > 0
  ) {
    attention.push({
      text: `Desviación de tiempo: +${formatMinutes(progress.timeDeviationMinutes)}`,
      href: `/projects/${projectId}?tab=tiempo`,
    });
  }

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <div className="space-y-6 xl:col-span-2">
        <Card className="overflow-hidden">
          <CardHeader
            title="Atención requerida"
            description={`Salud sugerida por datos: ${projectHealthMeta[suggested]?.label ?? suggested}. ${
              progress.daysRemaining !== null
                ? progress.daysRemaining >= 0
                  ? `${progress.daysRemaining} días restantes.`
                  : `${Math.abs(progress.daysRemaining)} días de retraso.`
                : "Sin fecha objetivo definida."
            }`}
          />
          {attention.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted">Nada urgente — el proyecto está bajo control.</p>
          ) : (
            <ul className="divide-y divide-edge">
              {attention.map((a) => (
                <li key={a.text}>
                  <Link
                    href={a.href}
                    className="flex items-center gap-2 px-5 py-2.5 text-sm text-fg transition-colors hover:bg-subtle"
                  >
                    <AlertTriangle className="size-4 shrink-0 text-warning" />
                    {a.text}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader title="Actividades vencidas" />
          {overdueActivities.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted">Sin actividades vencidas.</p>
          ) : (
            <ul className="divide-y divide-edge">
              {overdueActivities.map((a) => (
                <li key={a.activityId} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                  <Link href={`/activities/${a.activityId}`} className="min-w-0 truncate font-medium text-fg hover:text-primary">
                    {a.title}
                  </Link>
                  <span className="shrink-0 text-xs text-danger tabular-nums">
                    venció {fmtDate(a.dueDate)} · {a.assigneeName ?? "sin responsable"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader title="Actividad reciente" />
          {audit.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted">Sin eventos todavía.</p>
          ) : (
            <ul className="divide-y divide-edge">
              {audit.map(({ log, actorName }) => (
                <li key={log.id} className="flex items-baseline justify-between gap-3 px-5 py-2.5 text-sm">
                  <span className="text-fg">{describeProjectAuditEvent(log)}</span>
                  <span className="shrink-0 text-xs text-faint tabular-nums">
                    {actorName ?? "sistema"} · {fmtDateTime(log.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="overflow-hidden">
          <CardHeader title="Próximos hitos" />
          {upcomingMilestones.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted">Sin hitos próximos.</p>
          ) : (
            <ul className="divide-y divide-edge">
              {upcomingMilestones.map(({ milestone }) => (
                <li key={milestone.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                  <span className="min-w-0 truncate font-medium text-fg">{milestone.name}</span>
                  <Badge
                    tone={
                      milestone.targetDate < now.toISOString().slice(0, 10) ? "red" : "slate"
                    }
                  >
                    {fmtDate(milestone.targetDate)}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader title="Riesgos principales" />
          {topRisks.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted">Sin riesgos abiertos.</p>
          ) : (
            <ul className="divide-y divide-edge">
              {topRisks.map(({ risk, severity }) => (
                <li key={risk.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                  <span className="min-w-0 truncate text-fg">{risk.title}</span>
                  <Badge tone={riskSeverityMeta[severity]?.tone ?? "slate"}>
                    {riskSeverityMeta[severity]?.label ?? severity}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader title="Distribución del trabajo" description="Actividades abiertas por persona." />
          {byAssignee.size === 0 ? (
            <p className="px-5 py-6 text-sm text-muted">Sin trabajo abierto.</p>
          ) : (
            <ul className="divide-y divide-edge">
              {[...byAssignee.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([name, count]) => (
                  <li key={name} className="flex items-center justify-between px-5 py-2.5 text-sm">
                    <span className="text-fg">{name}</span>
                    <span className="tabular-nums text-muted">{count}</span>
                  </li>
                ))}
            </ul>
          )}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader title="Participantes" />
          <ul className="divide-y divide-edge">
            {members
              .filter((m) => m.member.isActive)
              .map((m) => (
                <li key={m.member.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                  <span className="text-fg">{m.userName}</span>
                  <Badge tone={projectMemberRoleMeta[m.member.role]?.tone ?? "slate"}>
                    {projectMemberRoleMeta[m.member.role]?.label ?? m.member.role}
                  </Badge>
                </li>
              ))}
          </ul>
        </Card>

        <Card className="p-5">
          <CardHeader
            title="Reportes"
            description="Reportes de estado del proyecto — avance, hitos, riesgos y tiempo del periodo."
            className="mb-3 px-0 pt-0"
          />
          <div className="flex flex-wrap gap-3 text-sm">
            <Link href={`/reports/new?projectId=${projectId}&type=project_report`} className="font-medium text-primary hover:underline">
              Generar reporte
            </Link>
            <Link href={`/reports?projectId=${projectId}`} className="font-medium text-primary hover:underline">
              Historial de reportes
            </Link>
          </div>
        </Card>

        <Card className="p-5">
          <CardHeader
            title="Conversaciones"
            description="Hilos del proyecto en el Inbox unificado."
            className="mb-3 px-0 pt-0"
          />
          <div className="flex flex-wrap gap-3 text-sm">
            <Link href={`/inbox?projectId=${projectId}`} className="font-medium text-primary hover:underline">
              Ver conversaciones
            </Link>
            <Link href={`/inbox?projectId=${projectId}&new=1`} className="font-medium text-primary hover:underline">
              Nueva conversación
            </Link>
          </div>
        </Card>

        {recurrences.length > 0 ? (
          <Card className="overflow-hidden">
            <CardHeader
              title="Recurrentes"
              action={
                <div className="flex items-center gap-3 text-xs font-medium">
                  <Link href={`/recurring/new?projectId=${projectId}`} className="text-primary hover:underline">
                    Crear
                  </Link>
                  <Link href={`/recurring?projectId=${projectId}`} className="text-primary hover:underline">
                    Ver todas
                  </Link>
                </div>
              }
            />
            <ul className="divide-y divide-edge">
              {recurrences.slice(0, 5).map(({ def, assigneeName }) => (
                <li key={def.id} className="px-5 py-2.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <Link href={`/recurring/${def.id}`} className="min-w-0 truncate font-medium text-fg hover:text-primary">
                      {def.name}
                    </Link>
                    <Badge tone={recurrenceStatusMeta[def.status]?.tone ?? "slate"}>
                      {recurrenceStatusMeta[def.status]?.label ?? def.status}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted">
                    {assigneeName ?? "sin responsable"} · próxima:{" "}
                    {def.nextRunAt ? fmtDate(def.nextRunAt) : "—"}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Trabajo */

async function TrabajoTab({
  orgId,
  projectId,
  internalUsers,
  archived,
  tableMode,
  now,
}: {
  orgId: number;
  projectId: number;
  internalUsers: { id: number; name: string }[];
  archived: boolean;
  tableMode: boolean;
  now: Date;
}) {
  const [tree, dependencies] = await Promise.all([
    getProjectWorkTree(orgId, projectId),
    getProjectDependencies(orgId, projectId),
  ]);
  const activeLists = tree.lists.filter((l) => l.status !== "archived");
  const listOptions = activeLists.map((l) => ({ id: l.id, name: l.name }));
  const today = now.toISOString().slice(0, 10);

  const byList = new Map<number | null, ProjectTreeActivity[]>();
  for (const a of tree.activities) {
    const key = a.parentActivityId === null ? a.listId : null;
    if (key === null && a.parentActivityId === null) {
      // top-level activity without list (shouldn't happen) — bucket under null
    }
    if (a.parentActivityId !== null) continue;
    const list = byList.get(a.listId);
    if (list) list.push(a);
    else byList.set(a.listId, [a]);
  }
  const childrenOf = (parentId: number) =>
    tree.activities.filter((a) => a.parentActivityId === parentId);

  const blockersOf = (workItemId: number) =>
    dependencies.filter((d) => d.blockedWorkItemId === workItemId);
  const blocksOf = (workItemId: number) =>
    dependencies.filter((d) => d.blockerWorkItemId === workItemId);
  const openBlockersCount = (workItemId: number) =>
    blockersOf(workItemId).filter((d) =>
      (OPEN_ACTIVITY_STATUSES as readonly string[]).includes(d.blockerStatus),
    ).length;

  if (tree.activities.length === 0 && tree.lists.length <= 1) {
    return (
      <div className="space-y-6">
        <EmptyState icon={<FolderKanban />} title="Este proyecto todavía no tiene actividades">
          Crea la primera actividad, agrega otra lista o define un hito.
        </EmptyState>
        {!archived ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <CardHeader title="Crear actividad" className="mb-3 px-0 pt-0" />
              <ProjectActivityForm
                projectId={projectId}
                lists={listOptions}
                internalUsers={internalUsers}
                defaultListId={listOptions[0]?.id}
              />
            </Card>
            <Card className="p-5">
              <CardHeader title="Crear lista" className="mb-3 px-0 pt-0" />
              <ListForm projectId={projectId} />
            </Card>
          </div>
        ) : null}
      </div>
    );
  }

  const ActivityRow = ({ a, isChild }: { a: ProjectTreeActivity; isChild?: boolean }) => {
    const kids = isChild ? [] : childrenOf(a.activityId);
    const doneKids = kids.filter((k) => k.status === "completed").length;
    const openBlockers = openBlockersCount(a.workItemId);
    const isOpen = (OPEN_ACTIVITY_STATUSES as readonly string[]).includes(a.status);
    return (
      <li className={cx("px-4 py-2.5", isChild && "pl-10")}>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/activities/${a.activityId}`}
            className={cx(
              "min-w-0 truncate text-sm font-medium hover:text-primary",
              a.status === "completed" ? "text-muted line-through" : "text-fg",
            )}
          >
            {a.title}
          </Link>
          {isChild ? <Badge tone="slate">Subactividad</Badge> : null}
          <Badge tone={activityStatusMeta[a.status]?.tone ?? "slate"}>
            {activityStatusMeta[a.status]?.label ?? a.status}
          </Badge>
          <Badge tone={ticketPriorityMeta[a.priority]?.tone ?? "slate"}>
            {ticketPriorityMeta[a.priority]?.label ?? a.priority}
          </Badge>
          {a.dueDate ? (
            <span
              className={cx(
                "text-xs tabular-nums",
                isOpen && a.dueDate < today ? "text-danger" : "text-faint",
              )}
            >
              {fmtDate(a.dueDate)}
            </span>
          ) : null}
          <span className="text-xs text-faint">{a.assigneeName ?? "sin responsable"}</span>
          {a.minutes > 0 ? (
            <span className="text-xs text-faint tabular-nums">{formatMinutes(a.minutes)}</span>
          ) : null}
          {openBlockers > 0 ? <Badge tone="red">bloqueada ({openBlockers})</Badge> : null}
          {kids.length > 0 ? (
            <span className="text-xs text-faint tabular-nums">
              subactividades {doneKids}/{kids.length}
            </span>
          ) : null}
          {!archived && isOpen ? (
            <span className="ml-auto flex items-center gap-1">
              <CompleteActivityButton activityId={a.activityId} openBlockers={openBlockers} />
              {!isChild ? (
                <MoveToListForm activityId={a.activityId} lists={listOptions} currentListId={a.listId} />
              ) : null}
            </span>
          ) : null}
        </div>
        {!archived && (blockersOf(a.workItemId).length > 0 || blocksOf(a.workItemId).length > 0) ? (
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
            {blockersOf(a.workItemId).map((d) => (
              <span key={d.id} className="flex items-center gap-1">
                Bloqueada por: {d.blockerTitle}
                <RowAction action="removeDependency" fields={{ id: d.id }} label="×" danger />
              </span>
            ))}
            {blocksOf(a.workItemId).map((d) => (
              <span key={d.id}>Bloquea a: {d.blockedTitle}</span>
            ))}
          </div>
        ) : null}
        {!archived && !isChild ? (
          <div className="mt-1.5 flex flex-wrap gap-3">
            <details>
              <summary className="cursor-pointer text-xs text-muted hover:text-fg">+ Subactividad</summary>
              <div className="mt-2 rounded-lg border border-edge p-3">
                <ProjectActivityForm
                  projectId={projectId}
                  lists={listOptions}
                  internalUsers={internalUsers}
                  defaultListId={a.listId ?? undefined}
                  parentActivityId={a.activityId}
                />
              </div>
            </details>
            <details>
              <summary className="cursor-pointer text-xs text-muted hover:text-fg">+ Dependencia</summary>
              <div className="mt-2">
                <DependencyForm
                  blockedActivityId={a.activityId}
                  candidates={tree.activities
                    .filter((c) => c.activityId !== a.activityId)
                    .map((c) => ({ id: c.activityId, name: c.title }))}
                />
              </div>
            </details>
          </div>
        ) : null}
        {kids.length > 0 ? (
          <ul className="mt-2 divide-y divide-edge/60 border-t border-edge/60">
            {kids.map((k) => (
              <ActivityRow key={k.activityId} a={k} isChild />
            ))}
          </ul>
        ) : null}
      </li>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <Link
            href={`/projects/${projectId}?tab=trabajo`}
            className={cx(
              "rounded-md px-3 py-1.5 text-xs font-medium",
              !tableMode ? "bg-primary-soft text-primary" : "border border-edge text-muted hover:bg-subtle",
            )}
          >
            Lista estructurada
          </Link>
          <Link
            href={`/projects/${projectId}?tab=trabajo&mode=table`}
            className={cx(
              "rounded-md px-3 py-1.5 text-xs font-medium",
              tableMode ? "bg-primary-soft text-primary" : "border border-edge text-muted hover:bg-subtle",
            )}
          >
            Tabla
          </Link>
        </div>
        {!archived ? (
          <div className="flex gap-2">
            <Disclosure label="+ Lista">
              <ListForm projectId={projectId} />
            </Disclosure>
            <Disclosure label="+ Actividad">
              <ProjectActivityForm
                projectId={projectId}
                lists={listOptions}
                internalUsers={internalUsers}
                defaultListId={listOptions[0]?.id}
              />
            </Disclosure>
          </div>
        ) : null}
      </div>

      {tableMode ? (
        <Card className="overflow-visible">
          <Table>
            <THead>
              <tr>
                <Th>Título</Th>
                <Th>Tipo</Th>
                <Th>Lista</Th>
                <Th>Responsable</Th>
                <Th>Estado</Th>
                <Th>Prioridad</Th>
                <Th>Vence</Th>
                <Th>Est.</Th>
                <Th>Tiempo</Th>
                <Th>Dep.</Th>
              </tr>
            </THead>
            <tbody className="divide-y divide-edge">
              {tree.activities.map((a) => (
                <tr key={a.activityId} className="transition-colors hover:bg-subtle">
                  <Td>
                    <Link href={`/activities/${a.activityId}`} className="font-medium text-fg hover:text-primary">
                      {a.parentActivityId ? "↳ " : ""}
                      {a.title}
                    </Link>
                  </Td>
                  <Td className="text-muted">{a.parentActivityId ? "Subactividad" : "Actividad"}</Td>
                  <Td className="text-muted">
                    {tree.lists.find((l) => l.id === a.listId)?.name ?? "—"}
                  </Td>
                  <Td className="text-muted">{a.assigneeName ?? "—"}</Td>
                  <Td>
                    <Badge tone={activityStatusMeta[a.status]?.tone ?? "slate"}>
                      {activityStatusMeta[a.status]?.label ?? a.status}
                    </Badge>
                  </Td>
                  <Td>
                    <Badge tone={ticketPriorityMeta[a.priority]?.tone ?? "slate"}>
                      {ticketPriorityMeta[a.priority]?.label ?? a.priority}
                    </Badge>
                  </Td>
                  <Td
                    className={cx(
                      "tabular-nums",
                      (OPEN_ACTIVITY_STATUSES as readonly string[]).includes(a.status) &&
                        a.dueDate &&
                        a.dueDate < today
                        ? "text-danger"
                        : "text-muted",
                    )}
                  >
                    {a.dueDate ? fmtDate(a.dueDate) : "—"}
                  </Td>
                  <Td className="tabular-nums text-muted">
                    {a.estimatedMinutes ? formatMinutes(a.estimatedMinutes) : "—"}
                  </Td>
                  <Td className="tabular-nums text-muted">{formatMinutes(a.minutes)}</Td>
                  <Td className="tabular-nums text-muted">
                    {a.blockedByCount > 0 || a.blocksCount > 0
                      ? `${a.blockedByCount}↓ ${a.blocksCount}↑`
                      : "—"}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : (
        <div className="space-y-4">
          {tree.lists.map((list) => {
            const items = byList.get(list.id) ?? [];
            const done = items.filter((a) => a.status === "completed").length;
            return (
              <Card key={list.id} className={cx("overflow-hidden", list.status === "archived" && "opacity-60")}>
                <details open={list.status === "active"}>
                  <summary className="flex cursor-pointer flex-wrap items-center gap-3 border-b border-edge px-5 py-3 select-none">
                    <span className="font-semibold text-fg">{list.name}</span>
                    <Badge tone={projectListStatusMeta[list.status]?.tone ?? "slate"}>
                      {projectListStatusMeta[list.status]?.label ?? list.status}
                    </Badge>
                    <span className="text-xs text-faint tabular-nums">
                      {done}/{items.length} completadas
                    </span>
                    {list.targetDate ? (
                      <span className="text-xs text-faint tabular-nums">objetivo {fmtDate(list.targetDate)}</span>
                    ) : null}
                    {!archived ? (
                      <span className="ml-auto flex items-center gap-1">
                        <RowAction action="moveProjectList" fields={{ id: list.id, direction: "up" }} label="↑" />
                        <RowAction action="moveProjectList" fields={{ id: list.id, direction: "down" }} label="↓" />
                      </span>
                    ) : null}
                  </summary>
                  {items.length === 0 ? (
                    <p className="px-5 py-4 text-sm text-muted">Sin actividades en esta lista.</p>
                  ) : (
                    <ul className="divide-y divide-edge">
                      {items.map((a) => (
                        <ActivityRow key={a.activityId} a={a} />
                      ))}
                    </ul>
                  )}
                  {!archived ? (
                    <div className="border-t border-edge p-4">
                      <details>
                        <summary className="cursor-pointer text-xs font-medium text-muted hover:text-fg">
                          + Agregar actividad a {list.name}
                        </summary>
                        <div className="mt-3">
                          <ProjectActivityForm
                            projectId={projectId}
                            lists={listOptions}
                            internalUsers={internalUsers}
                            defaultListId={list.id}
                          />
                        </div>
                      </details>
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs font-medium text-muted hover:text-fg">
                          Editar lista
                        </summary>
                        <div className="mt-3">
                          <ListForm
                            projectId={projectId}
                            list={{
                              id: list.id,
                              name: list.name,
                              description: list.description,
                              startDate: list.startDate,
                              targetDate: list.targetDate,
                              status: list.status,
                            }}
                          />
                        </div>
                      </details>
                    </div>
                  ) : null}
                </details>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------- Hitos */

async function HitosTab({
  orgId,
  projectId,
  internalUsers,
  isMgmt,
  archived,
  now,
}: {
  orgId: number;
  projectId: number;
  internalUsers: { id: number; name: string }[];
  isMgmt: boolean;
  archived: boolean;
  now: Date;
}) {
  const [milestones, tree] = await Promise.all([
    getProjectMilestones(orgId, projectId),
    getProjectWorkTree(orgId, projectId),
  ]);
  const links = await getMilestoneLinks(
    orgId,
    milestones.map((m) => m.milestone.id),
  );
  const today = now.toISOString().slice(0, 10);
  const activityOptions = tree.activities.map((a) => ({ id: a.activityId, name: a.title }));

  return (
    <div className="space-y-6">
      {isMgmt && !archived ? (
        <Disclosure label="+ Crear hito">
          <MilestoneForm projectId={projectId} internalUsers={internalUsers} />
        </Disclosure>
      ) : null}
      {milestones.length === 0 ? (
        <EmptyState icon={<Flag />} title="Sin hitos">
          Define hitos para marcar los momentos clave del proyecto.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {milestones.map(({ milestone, ownerName, linkedActivities, linkedCompleted }) => {
            const overdue =
              !["completed", "cancelled"].includes(milestone.status) &&
              milestone.targetDate < today;
            const linked = links.filter((l) => l.milestoneId === milestone.id);
            return (
              <Card key={milestone.id} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-fg">{milestone.name}</p>
                    <p className="text-xs text-muted">
                      {fmtDate(milestone.targetDate)} · {ownerName ?? "sin responsable"}
                      {linkedActivities > 0 ? ` · ${linkedCompleted}/${linkedActivities} actividades` : ""}
                    </p>
                  </div>
                  <Badge tone={overdue ? "red" : (milestoneStatusMeta[milestone.status]?.tone ?? "slate")}>
                    {overdue ? "Vencido" : (milestoneStatusMeta[milestone.status]?.label ?? milestone.status)}
                  </Badge>
                </div>
                {milestone.description ? (
                  <p className="mt-2 text-sm text-muted">{milestone.description}</p>
                ) : null}
                {isMgmt && !archived ? (
                  <div className="mt-3 space-y-3 border-t border-edge pt-3">
                    <RowAction
                      action="toggleMilestoneComplete"
                      fields={{ id: milestone.id }}
                      label={milestone.status === "completed" ? "Reabrir" : "Completar"}
                    />
                    <MilestoneLinkForm
                      milestoneId={milestone.id}
                      activities={activityOptions}
                      linked={linked.map((l) => ({ activityId: l.activityId, title: l.title }))}
                    />
                    <details>
                      <summary className="cursor-pointer text-xs text-muted hover:text-fg">Editar hito</summary>
                      <div className="mt-2">
                        <MilestoneForm
                          projectId={projectId}
                          internalUsers={internalUsers}
                          milestone={{
                            id: milestone.id,
                            name: milestone.name,
                            description: milestone.description,
                            targetDate: milestone.targetDate,
                            ownerId: milestone.ownerId,
                            status: milestone.status,
                          }}
                        />
                      </div>
                    </details>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Riesgos */

async function RiesgosTab({
  orgId,
  projectId,
  internalUsers,
  isMgmt,
  archived,
}: {
  orgId: number;
  projectId: number;
  internalUsers: { id: number; name: string }[];
  isMgmt: boolean;
  archived: boolean;
}) {
  const risks = await getProjectRisks(orgId, projectId);
  return (
    <div className="space-y-6">
      {!archived ? (
        <Disclosure label="+ Reportar riesgo">
          <RiskForm projectId={projectId} internalUsers={internalUsers} />
        </Disclosure>
      ) : null}
      {risks.length === 0 ? (
        <EmptyState icon={<AlertTriangle />} title="Sin riesgos registrados">
          Cuando identifiques un riesgo, repórtalo aquí para que alimente la salud del proyecto.
        </EmptyState>
      ) : (
        <Card className="overflow-visible">
          <Table>
            <THead>
              <tr>
                <Th>Riesgo</Th>
                <Th>Severidad</Th>
                <Th>Prob. / Impacto</Th>
                <Th>Estado</Th>
                <Th>Responsable</Th>
                <Th>Límite</Th>
              </tr>
            </THead>
            <tbody className="divide-y divide-edge">
              {risks.map(({ risk, ownerName, severity }) => (
                <tr key={risk.id}>
                  <Td>
                    <span className="font-medium text-fg">{risk.title}</span>
                    {risk.mitigationPlan ? (
                      <span className="block max-w-md truncate text-xs text-muted">
                        Mitigación: {risk.mitigationPlan}
                      </span>
                    ) : null}
                    {isMgmt && !archived ? (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-muted hover:text-fg">Editar</summary>
                        <div className="mt-2 max-w-xl">
                          <RiskForm
                            projectId={projectId}
                            internalUsers={internalUsers}
                            risk={{
                              id: risk.id,
                              title: risk.title,
                              description: risk.description,
                              probability: risk.probability,
                              impact: risk.impact,
                              status: risk.status,
                              ownerId: risk.ownerId,
                              mitigationPlan: risk.mitigationPlan,
                              dueDate: risk.dueDate,
                            }}
                          />
                        </div>
                      </details>
                    ) : null}
                  </Td>
                  <Td>
                    <Badge tone={riskSeverityMeta[severity]?.tone ?? "slate"}>
                      {riskSeverityMeta[severity]?.label ?? severity}
                    </Badge>
                  </Td>
                  <Td className="text-muted">
                    {risk.probability} / {risk.impact}
                  </Td>
                  <Td>
                    <Badge tone={riskStatusMeta[risk.status]?.tone ?? "slate"}>
                      {riskStatusMeta[risk.status]?.label ?? risk.status}
                    </Badge>
                  </Td>
                  <Td className="text-muted">{ownerName ?? "—"}</Td>
                  <Td className="text-muted">{risk.dueDate ? fmtDate(risk.dueDate) : "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- Tiempo */

async function TiempoTab({
  orgId,
  projectId,
  project,
}: {
  orgId: number;
  projectId: number;
  project: { estimatedMinutes: number | null; budgetAmount: string | null };
}) {
  const rollup = await getProjectTimeRollup(orgId, projectId);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          icon={<Clock />}
          label="Registrado"
          value={formatMinutes(rollup.totals.total)}
          footer={
            project.estimatedMinutes ? `de ${formatMinutes(project.estimatedMinutes)} estimados` : undefined
          }
        />
        <StatCard icon={<Clock />} label="Facturable" value={formatMinutes(rollup.totals.billable)} />
        <StatCard icon={<Clock />} label="No facturable" value={formatMinutes(rollup.totals.nonBillable)} />
        <StatCard icon={<Clock />} label="En contrato" value={formatMinutes(rollup.totals.inContract)} />
      </div>
      <p className="text-sm text-muted">
        El tiempo se registra sobre actividades y subactividades (abre la actividad → pestaña
        Tiempo). Para coordinación/gestión general crea una actividad dedicada (p. ej.
        &quot;Coordinación y gestión&quot;) en la lista correspondiente.
      </p>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader title="Por persona" />
          {rollup.byUser.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted">Sin tiempo registrado.</p>
          ) : (
            <ul className="divide-y divide-edge">
              {rollup.byUser.map((u) => (
                <li key={u.name ?? "—"} className="flex items-center justify-between px-5 py-2.5 text-sm">
                  <span className="text-fg">{u.name ?? "—"}</span>
                  <span className="tabular-nums text-muted">{formatMinutes(u.minutes)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="overflow-hidden">
          <CardHeader title="Por lista" />
          {rollup.byList.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted">Sin tiempo registrado.</p>
          ) : (
            <ul className="divide-y divide-edge">
              {rollup.byList.map((l, i) => (
                <li key={i} className="flex items-center justify-between px-5 py-2.5 text-sm">
                  <span className="text-fg">{l.listName ?? "Sin lista"}</span>
                  <span className="tabular-nums text-muted">{formatMinutes(l.minutes)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="overflow-hidden">
          <CardHeader title="Top actividades" />
          {rollup.byActivity.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted">Sin tiempo registrado.</p>
          ) : (
            <ul className="divide-y divide-edge">
              {rollup.byActivity.map((a, i) => (
                <li key={i} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                  <span className="min-w-0 truncate text-fg">{a.title}</span>
                  <span className="shrink-0 tabular-nums text-muted">{formatMinutes(a.minutes)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="overflow-hidden">
          <CardHeader title="Por modalidad" />
          {rollup.byModality.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted">Sin tiempo registrado.</p>
          ) : (
            <ul className="divide-y divide-edge">
              {rollup.byModality.map((m) => (
                <li key={m.modality} className="flex items-center justify-between px-5 py-2.5 text-sm">
                  <span className="text-fg capitalize">{m.modality.replace("_", " ")}</span>
                  <span className="tabular-nums text-muted">{formatMinutes(m.minutes)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- Archivos */

async function ArchivosTab({
  orgId,
  projectId,
  archived,
}: {
  orgId: number;
  projectId: number;
  archived: boolean;
}) {
  const rows = await getProjectAttachments(orgId, projectId);
  return (
    <div className="space-y-6">
      {!archived ? (
        <Card className="p-5">
          <CardHeader
            title="Subir archivo"
            description="Solo metadata en la base — los blobs viven en el almacenamiento local (MVP)."
            className="mb-3 px-0 pt-0"
          />
          <ProjectUploadForm projectId={projectId} />
        </Card>
      ) : null}
      {rows.length === 0 ? (
        <EmptyState icon={<FileText />} title="Sin archivos">
          Los archivos del proyecto y de sus actividades aparecen aquí.
        </EmptyState>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-edge">
            {rows.map(({ attachment, uploaderName, itemTitle }) => (
              <li key={attachment.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <span className="min-w-0">
                  <a
                    href={`/api/attachments/${attachment.id}`}
                    className="font-medium text-fg hover:text-primary"
                  >
                    {attachment.filename}
                  </a>
                  <span className="block text-xs text-muted">
                    {(attachment.size / 1024).toFixed(0)} KB
                    {itemTitle ? ` · en actividad: ${itemTitle}` : " · del proyecto"}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-faint tabular-nums">
                  {uploaderName ?? "—"} · {fmtDate(attachment.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- Comentarios */

async function ComentariosTab({
  orgId,
  projectId,
  currentUserId,
  archived,
}: {
  orgId: number;
  projectId: number;
  currentUserId: number;
  archived: boolean;
}) {
  const rows = await getProjectComments(orgId, projectId);
  return (
    <div className="space-y-6">
      {!archived ? (
        <Card className="p-5">
          <CommentComposer projectId={projectId} />
        </Card>
      ) : null}
      {rows.length === 0 ? (
        <EmptyState icon={<MessageSquare />} title="Sin comentarios">
          Todavía no hay comentarios en este proyecto.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {rows.map(({ comment, authorName }) => (
            <Card key={comment.id} className="p-4">
              <div className="text-xs text-faint">
                {authorName ?? "—"} · {fmtDateTime(comment.createdAt)}
                {comment.editedAt ? " · editado" : ""}
              </div>
              <p className="mt-2 text-sm whitespace-pre-wrap text-fg">{comment.body}</p>
              {comment.authorId === currentUserId && !archived ? (
                <CommentEditor projectId={projectId} commentId={comment.id} body={comment.body} />
              ) : null}
            </Card>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- Historial */

async function HistorialTab({
  orgId,
  projectId,
  canSeeTechnical,
}: {
  orgId: number;
  projectId: number;
  canSeeTechnical: boolean;
}) {
  const rows = await getProjectAuditTrail(orgId, projectId);
  if (rows.length === 0) {
    return (
      <EmptyState icon={<History />} title="Sin historial">
        No hay eventos registrados para este proyecto todavía.
      </EmptyState>
    );
  }
  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <CardHeader title="Historial" description="Qué ha pasado en el proyecto, en lenguaje simple." />
        <ul className="divide-y divide-edge">
          {rows.map(({ log, actorName }) => (
            <li key={log.id} className="flex items-baseline justify-between gap-3 px-5 py-2.5 text-sm">
              <span className="text-fg">{describeProjectAuditEvent(log)}</span>
              <span className="shrink-0 text-xs text-faint tabular-nums">
                {actorName ?? "sistema"} · {fmtDateTime(log.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      </Card>
      {canSeeTechnical ? (
        <Card className="overflow-hidden">
          <CardHeader title="Registro técnico" description="AuditLog — SuperAdmin / Administrator." />
          <ul className="divide-y divide-edge">
            {rows.map(({ log, actorName }) => (
              <li key={log.id} className="flex items-baseline justify-between gap-3 px-5 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="font-medium text-fg">
                    {log.entityType}.{log.field ?? log.action}
                  </span>{" "}
                  <span className="text-muted">
                    {log.field ? `${log.oldValue ?? "—"} → ${log.newValue ?? "—"}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-faint tabular-nums">
                  {actorName ?? "system"} · {fmtDateTime(log.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------ Configuración */

async function ConfiguracionTab({
  project,
  detail,
  internalUsers,
  suggested,
  isMgmt,
  isSuperAdmin,
  archived,
}: {
  project: NonNullable<Awaited<ReturnType<typeof getProjectDetail>>>["project"];
  detail: NonNullable<Awaited<ReturnType<typeof getProjectDetail>>>;
  internalUsers: { id: number; name: string }[];
  suggested: string;
  isMgmt: boolean;
  isSuperAdmin: boolean;
  archived: boolean;
}) {
  const [members, clientRows] = await Promise.all([
    getProjectMembers(project.organizationId, project.id),
    db
      .select({ id: clients.id, name: clients.name })
      .from(clients)
      .where(eq(clients.organizationId, project.organizationId))
      .orderBy(asc(clients.name)),
  ]);
  const pendingActivities = detail.total - detail.completed;

  if (!isMgmt) {
    return (
      <p className="text-sm text-muted">
        La configuración del proyecto la administran SuperAdmin, Administrator, Director y Project
        Manager. Puedes crear actividades, registrar tiempo y reportar riesgos desde las otras
        pestañas.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <div className="xl:col-span-2">
        {!archived ? (
          <Card className="p-6">
            <CardHeader title="Editar proyecto" className="mb-4 px-0 pt-0" />
            <ProjectForm
              project={{
                id: project.id,
                name: project.name,
                description: project.description,
                clientId: project.clientId,
                projectManagerId: project.projectManagerId,
                ownerId: project.ownerId,
                priority: project.priority,
                startDate: project.startDate,
                targetDate: project.targetDate,
                estimatedMinutes: project.estimatedMinutes,
                budgetAmount: project.budgetAmount,
                billingType: project.billingType,
              }}
              clients={clientRows}
              internalUsers={internalUsers}
            />
          </Card>
        ) : null}
      </div>
      <div className="space-y-6">
        {!archived ? (
          <>
            <Card className="p-5">
              <CardHeader title="Estado y salud" className="mb-3 px-0 pt-0" />
              <div className="space-y-3">
                <StatusSelect projectId={project.id} current={project.status} />
                <HealthSelect projectId={project.id} current={project.healthStatus} suggested={suggested} />
              </div>
            </Card>
            <Card className="p-5">
              <CardHeader title="Completar proyecto" className="mb-3 px-0 pt-0" />
              <CompleteProjectForm projectId={project.id} pendingActivities={pendingActivities} />
            </Card>
            <Card className="p-5">
              <CardHeader title="Participantes" className="mb-3 px-0 pt-0" />
              <ul className="mb-4 space-y-1">
                {members
                  .filter((m) => m.member.isActive)
                  .map((m) => (
                    <li key={m.member.id} className="flex items-center justify-between text-sm">
                      <span className="text-fg">
                        {m.userName}{" "}
                        <span className="text-xs text-muted">
                          ({projectMemberRoleMeta[m.member.role]?.label ?? m.member.role})
                        </span>
                      </span>
                      {project.projectManagerId !== m.member.userId ? (
                        <RowAction action="removeProjectMember" fields={{ id: m.member.id }} label="Quitar" />
                      ) : null}
                    </li>
                  ))}
              </ul>
              <MemberForm projectId={project.id} internalUsers={internalUsers} />
            </Card>
          </>
        ) : null}
        <Card className="p-5">
          <CardHeader title="Ciclo de vida" className="mb-3 px-0 pt-0" />
          <div className="flex flex-wrap gap-2">
            {archived ? (
              <RowAction action="restoreProject" fields={{ id: project.id }} label="Restaurar proyecto" />
            ) : (
              <RowAction
                action="archiveProject"
                fields={{ id: project.id }}
                label="Archivar proyecto"
                confirm="¿Archivar este proyecto? Saldrá de las vistas operativas."
              />
            )}
            {isSuperAdmin ? (
              <RowAction
                action="deleteProject"
                fields={{ id: project.id }}
                label="Eliminar permanentemente"
                confirm={`¿Eliminar "${project.name}" para siempre? Solo es posible sin actividades.`}
                danger
              />
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
