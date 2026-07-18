import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, ne } from "drizzle-orm";
import { FolderKanban, Plus } from "lucide-react";
import { db } from "@/db";
import { clients, users } from "@/db/schema";
import { fmtDate } from "@/lib/format";
import { projectHealthMeta, projectPriorityMeta, projectStatusMeta } from "@/lib/labels";
import { getProjectsDirectory } from "@/lib/project-data";
import { PROJECT_HEALTHS, PROJECT_PRIORITIES, PROJECT_STATUSES } from "@/lib/projects";
import { requireUser } from "@/lib/session";
import { formatMinutes } from "@/lib/time-entries";
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Progress,
  THead,
  Table,
  Td,
  Th,
  buttonClass,
  buttonSecondaryClass,
  cx,
  inputClass,
} from "@/components/ui";

export const metadata: Metadata = { title: "Projects" };

const VIEWS = [
  ["", "Activos"],
  ["all", "Todos"],
  ["mine", "Mis proyectos"],
  ["team", "Mi equipo"],
  ["at_risk", "En riesgo"],
  ["blocked", "Bloqueados"],
  ["due_soon", "Próximos a vencer"],
  ["overdue", "Vencidos"],
  ["internal", "Sin cliente"],
  ["completed", "Completados"],
  ["archived", "Archivados"],
] as const;

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    view?: string;
    status?: string;
    health?: string;
    priority?: string;
    clientId?: string;
    managerId?: string;
  }>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  const [rows, clientRows, managerRows] = await Promise.all([
    getProjectsDirectory(user.organizationId, Number(user.id), {
      q: params.q,
      view: params.view,
      status: params.status,
      health: params.health,
      priority: params.priority,
      clientId: params.clientId ? Number(params.clientId) : undefined,
      managerId: params.managerId ? Number(params.managerId) : undefined,
    }),
    db
      .select({ id: clients.id, name: clients.name })
      .from(clients)
      .where(eq(clients.organizationId, user.organizationId))
      .orderBy(asc(clients.name)),
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(and(eq(users.organizationId, user.organizationId), ne(users.role, "client")))
      .orderBy(asc(users.name)),
  ]);

  const buildHref = (patch: Record<string, string | undefined>) => {
    const next = { ...params, ...patch };
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) qs.set(k, v);
    const s = qs.toString();
    return s ? `/projects?${s}` : "/projects";
  };

  const canCreate = ["superadmin", "administrator", "director", "project_manager"].includes(
    user.role,
  );

  return (
    <div>
      <PageHeader
        title="Proyectos"
        subtitle="Proyecto → Listas → Actividades → Subactividades. Los tickets nunca viven aquí."
        action={
          canCreate ? (
            <Link href="/projects/new" className={buttonClass}>
              <Plus className="size-4" /> Nuevo proyecto
            </Link>
          ) : undefined
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
          placeholder="Buscar por folio, nombre o descripción…"
          className={cx(inputClass, "max-w-xs")}
        />
        <select name="status" defaultValue={params.status ?? ""} className={cx(inputClass, "w-auto")}>
          <option value="">Estado</option>
          {PROJECT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {projectStatusMeta[s]?.label ?? s}
            </option>
          ))}
        </select>
        <select name="health" defaultValue={params.health ?? ""} className={cx(inputClass, "w-auto")}>
          <option value="">Salud</option>
          {PROJECT_HEALTHS.map((s) => (
            <option key={s} value={s}>
              {projectHealthMeta[s]?.label ?? s}
            </option>
          ))}
        </select>
        <select
          name="priority"
          defaultValue={params.priority ?? ""}
          className={cx(inputClass, "w-auto")}
        >
          <option value="">Prioridad</option>
          {PROJECT_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {projectPriorityMeta[p]?.label ?? p}
            </option>
          ))}
        </select>
        <select
          name="clientId"
          defaultValue={params.clientId ?? ""}
          className={cx(inputClass, "w-auto")}
        >
          <option value="">Cliente</option>
          {clientRows.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          name="managerId"
          defaultValue={params.managerId ?? ""}
          className={cx(inputClass, "w-auto")}
        >
          <option value="">Project Manager</option>
          {managerRows.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <button type="submit" className={buttonSecondaryClass}>
          Filtrar
        </button>
      </form>

      {rows.length === 0 ? (
        <EmptyState icon={<FolderKanban />} title="Sin proyectos en esta vista">
          Cambia la vista o los filtros, o crea un proyecto nuevo.
        </EmptyState>
      ) : (
        <Card className="overflow-visible">
          <Table>
            <THead>
              <tr>
                <Th>Proyecto</Th>
                <Th>Cliente</Th>
                <Th>PM</Th>
                <Th>Estado</Th>
                <Th>Salud</Th>
                <Th>Prioridad</Th>
                <Th>Avance</Th>
                <Th>Pend. / Venc.</Th>
                <Th>Próximo hito</Th>
                <Th>Objetivo</Th>
                <Th>Tiempo</Th>
              </tr>
            </THead>
            <tbody className="divide-y divide-edge">
              {rows.map((r) => {
                const percent =
                  r.total === 0 ? 0 : Math.round((r.completed / r.total) * 100);
                const pending = r.total - r.completed;
                return (
                  <tr key={r.project.id} className="group transition-colors hover:bg-subtle">
                    <Td>
                      <Link
                        href={`/projects/${r.project.id}`}
                        className="font-medium text-fg transition-colors group-hover:text-primary"
                      >
                        <span className="text-xs text-faint tabular-nums">{r.project.folio}</span>{" "}
                        {r.project.name}
                      </Link>
                    </Td>
                    <Td className="text-muted">{r.clientName ?? "Interno"}</Td>
                    <Td className="text-muted">{r.managerName ?? "—"}</Td>
                    <Td>
                      <Badge tone={projectStatusMeta[r.project.status]?.tone ?? "slate"}>
                        {projectStatusMeta[r.project.status]?.label ?? r.project.status}
                      </Badge>
                    </Td>
                    <Td>
                      <Badge tone={projectHealthMeta[r.project.healthStatus]?.tone ?? "slate"}>
                        {projectHealthMeta[r.project.healthStatus]?.label ?? r.project.healthStatus}
                      </Badge>
                    </Td>
                    <Td>
                      <Badge tone={projectPriorityMeta[r.project.priority]?.tone ?? "slate"}>
                        {projectPriorityMeta[r.project.priority]?.label ?? r.project.priority}
                      </Badge>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <Progress value={percent} className="w-16" />
                        <span className="text-xs text-muted tabular-nums">{percent}%</span>
                      </div>
                    </Td>
                    <Td className="tabular-nums">
                      <span className="text-muted">{pending}</span>
                      {r.overdue > 0 ? <span className="ml-1 text-danger">/ {r.overdue}</span> : null}
                    </Td>
                    <Td className="max-w-40 truncate text-xs text-muted">{r.nextMilestone ?? "—"}</Td>
                    <Td className="text-muted">
                      {r.project.targetDate ? fmtDate(r.project.targetDate) : "—"}
                    </Td>
                    <Td className="tabular-nums text-muted">{formatMinutes(r.loggedMinutes)}</Td>
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
