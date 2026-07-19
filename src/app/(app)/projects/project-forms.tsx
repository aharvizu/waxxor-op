"use client";

import { useActionState } from "react";
import {
  buttonGhostClass,
  buttonSecondaryClass,
  cx,
  inputClass,
  labelClass,
} from "@/components/ui";
import { FieldError, FormAlert } from "@/components/form-feedback";
import { SubmitButton } from "@/components/submit-button";
import type { ActionState } from "@/lib/action-result";
import { ACTIVITY_TYPES } from "@/lib/activities";
import {
  MILESTONE_STATUSES,
  PROJECT_LIST_STATUSES,
  PROJECT_MEMBER_ROLES,
  PROJECT_PRIORITIES,
  PROJECT_HEALTHS,
  PROJECT_WORKFLOW_STATUSES,
  RISK_IMPACTS,
  RISK_PROBABILITIES,
  RISK_STATUSES,
} from "@/lib/projects";
import {
  activityTypeMeta,
  milestoneStatusMeta,
  projectHealthMeta,
  projectListStatusMeta,
  projectMemberRoleMeta,
  projectPriorityMeta,
  projectStatusMeta,
  riskStatusMeta,
} from "@/lib/labels";
import {
  addDependency,
  addProjectComment,
  addProjectMember,
  archiveProject,
  completeProject,
  completeProjectActivity,
  createMilestone,
  createProject,
  createProjectActivity,
  createProjectList,
  createRisk,
  deleteProject,
  editOwnProjectComment,
  linkMilestoneActivity,
  moveActivityToList,
  moveProjectList,
  removeDependency,
  removeProjectMember,
  restoreProject,
  setProjectHealth,
  setProjectStatus,
  toggleMilestoneComplete,
  updateMilestone,
  updateProject,
  updateProjectList,
  updateRisk,
  uploadProjectFile,
} from "./actions";

type Option = { id: number; name: string };
type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/* ----------------------------------------------------------- primitives */

function useForm(action: Action, defaults?: Record<string, unknown>) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, null);
  const failed = state && !state.ok ? state : null;
  const errors = failed?.fieldErrors ?? {};
  const value = (name: string) => {
    const v = failed?.values?.[name] ?? defaults?.[name];
    return v === null || v === undefined ? "" : String(v);
  };
  return { state, formAction, errors, value };
}

function Field({
  label,
  name,
  errors,
  children,
}: {
  label: string;
  name: string;
  errors: Record<string, string[]>;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={name} className={labelClass}>
        {label}
      </label>
      {children}
      <FieldError id={`${name}-error`} errors={errors[name]} />
    </div>
  );
}

function TextInput({
  name,
  value,
  errors,
  type = "text",
  required,
}: {
  name: string;
  value: (n: string) => string;
  errors: Record<string, string[]>;
  type?: string;
  required?: boolean;
}) {
  return (
    <input
      id={name}
      name={name}
      type={type}
      required={required}
      defaultValue={value(name)}
      className={inputClass}
      aria-invalid={errors[name] ? true : undefined}
    />
  );
}

function SelectInput({
  name,
  value,
  options,
  allowEmpty,
}: {
  name: string;
  value: (n: string) => string;
  options: { value: string; label: string }[];
  allowEmpty?: string;
}) {
  return (
    <select id={name} name={name} defaultValue={value(name)} className={inputClass}>
      {allowEmpty !== undefined ? <option value="">{allowEmpty}</option> : null}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

const metaOptions = (values: readonly string[], meta: Record<string, { label: string }>) =>
  values.map((v) => ({ value: v, label: meta[v]?.label ?? v }));

export function Disclosure({
  label,
  children,
  open,
}: {
  label: string;
  children: React.ReactNode;
  open?: boolean;
}) {
  return (
    <details className="group rounded-lg border border-edge" open={open}>
      <summary className={cx(buttonSecondaryClass, "cursor-pointer list-none border-0 select-none")}>
        {label}
      </summary>
      <div className="border-t border-edge p-4">{children}</div>
    </details>
  );
}

const rowActions = {
  archiveProject,
  restoreProject,
  deleteProject,
  removeProjectMember,
  removeDependency,
  toggleMilestoneComplete,
  moveProjectList,
} as const;

/** Small inline form for one-click row actions. */
export function RowAction({
  action,
  fields,
  label,
  confirm,
  danger,
}: {
  action: keyof typeof rowActions;
  fields: Record<string, string | number>;
  label: string;
  confirm?: string;
  danger?: boolean;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(rowActions[action], null);
  return (
    <form
      action={formAction}
      className="inline"
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <button
        type="submit"
        className={cx(
          "rounded-md px-2 py-1 text-xs font-medium transition-colors",
          danger ? "text-danger hover:bg-danger-soft" : "text-muted hover:bg-subtle hover:text-fg",
        )}
      >
        {label}
      </button>
      {state && !state.ok ? <span className="ml-2 text-xs text-danger">{state.message}</span> : null}
    </form>
  );
}

/* -------------------------------------------------------------- project */

export type ProjectDefaults = {
  id: number;
  name: string;
  description: string | null;
  companyId: number | null;
  projectManagerId: number | null;
  ownerId: number | null;
  priority: string;
  startDate: string | null;
  targetDate: string | null;
  estimatedMinutes: number | null;
  budgetAmount: string | null;
  billingType: string | null;
};

export function ProjectForm({
  project,
  companies,
  internalUsers,
  defaultCompanyId,
  defaultPriority,
  templates = [],
}: {
  project?: ProjectDefaults;
  companies: Option[];
  internalUsers: Option[];
  defaultCompanyId?: number;
  /** Org default from Settings → Proyectos; preselected, always editable. */
  defaultPriority?: string;
  /** Active project templates from Settings → Proyectos. */
  templates?: Option[];
}) {
  const { state, formAction, errors, value } = useForm(
    project ? updateProject : createProject,
    project ?? {
      ...(defaultCompanyId ? { companyId: defaultCompanyId } : {}),
      ...(defaultPriority ? { priority: defaultPriority } : {}),
    },
  );
  const userOptions = internalUsers.map((u) => ({ value: String(u.id), label: u.name }));
  return (
    <form action={formAction} className="space-y-4">
      {project ? <input type="hidden" name="id" value={project.id} /> : null}
      <FormAlert state={state} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Nombre del proyecto" name="name" errors={errors}>
          <TextInput name="name" value={value} errors={errors} required />
        </Field>
        <Field label="Cliente (vacío = proyecto interno)" name="companyId" errors={errors}>
          <SelectInput
            name="companyId"
            value={value}
            options={companies.map((c) => ({ value: String(c.id), label: c.name }))}
            allowEmpty="— Interno, sin cliente —"
          />
        </Field>
        <Field label="Project Manager" name="projectManagerId" errors={errors}>
          <SelectInput name="projectManagerId" value={value} options={userOptions} allowEmpty="— Selecciona —" />
        </Field>
        <Field label="Prioridad" name="priority" errors={errors}>
          <SelectInput
            name="priority"
            value={value}
            options={metaOptions(PROJECT_PRIORITIES, projectPriorityMeta)}
          />
        </Field>
        <Field label="Inicio" name="startDate" errors={errors}>
          <TextInput name="startDate" value={value} errors={errors} type="date" />
        </Field>
        <Field label="Fecha objetivo" name="targetDate" errors={errors}>
          <TextInput name="targetDate" value={value} errors={errors} type="date" />
        </Field>
        <Field label="Estimación (minutos)" name="estimatedMinutes" errors={errors}>
          <TextInput name="estimatedMinutes" value={value} errors={errors} type="number" />
        </Field>
        <Field label="Presupuesto" name="budgetAmount" errors={errors}>
          <TextInput name="budgetAmount" value={value} errors={errors} />
        </Field>
        {project ? (
          <Field label="Owner (patrocinador)" name="ownerId" errors={errors}>
            <SelectInput name="ownerId" value={value} options={userOptions} allowEmpty="— Sin owner —" />
          </Field>
        ) : null}
        <Field label="Tipo de cobro" name="billingType" errors={errors}>
          <SelectInput
            name="billingType"
            value={value}
            options={[
              { value: "fixed_price", label: "Precio fijo" },
              { value: "time_and_materials", label: "Tiempo y materiales" },
              { value: "included_in_contract", label: "Incluido en contrato" },
              { value: "internal", label: "Interno (sin cobro)" },
            ]}
            allowEmpty="— Sin definir —"
          />
        </Field>
      </div>
      <Field label="Descripción" name="description" errors={errors}>
        <textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={value("description")}
          className={inputClass}
        />
      </Field>
      {!project ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Lista inicial" name="initialListName" errors={errors}>
            <input
              id="initialListName"
              name="initialListName"
              placeholder="General"
              className={inputClass}
            />
          </Field>
          {templates.length > 0 ? (
            <Field label="Plantilla (crea sus listas)" name="templateId" errors={errors}>
              <select id="templateId" name="templateId" defaultValue="" className={inputClass}>
                <option value="">— Sin plantilla —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          <div>
            <span className={labelClass}>Participantes</span>
            <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-edge p-2">
              {internalUsers.map((u) => (
                <label key={u.id} className="flex items-center gap-2 text-sm text-fg">
                  <input type="checkbox" name="memberIds" value={u.id} />
                  {u.name}
                </label>
              ))}
            </div>
          </div>
        </div>
      ) : null}
      <SubmitButton>{project ? "Guardar proyecto" : "Crear proyecto"}</SubmitButton>
    </form>
  );
}

/* ------------------------------------------------------- status / health */

export function StatusSelect({ projectId, current }: { projectId: number; current: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(setProjectStatus, null);
  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="id" value={projectId} />
      <select
        name="status"
        defaultValue={PROJECT_WORKFLOW_STATUSES.includes(current as never) ? current : ""}
        className={cx(inputClass, "h-8 w-auto text-xs")}
        aria-label="Cambiar estado"
      >
        {!PROJECT_WORKFLOW_STATUSES.includes(current as never) ? (
          <option value="" disabled>
            {projectStatusMeta[current]?.label ?? current}
          </option>
        ) : null}
        {PROJECT_WORKFLOW_STATUSES.map((s) => (
          <option key={s} value={s}>
            {projectStatusMeta[s]?.label ?? s}
          </option>
        ))}
      </select>
      <button type="submit" className={cx(buttonGhostClass, "h-8 px-2 text-xs")}>
        Cambiar
      </button>
      {state && !state.ok ? <span className="text-xs text-danger">{state.message}</span> : null}
    </form>
  );
}

export function HealthSelect({
  projectId,
  current,
  suggested,
}: {
  projectId: number;
  current: string;
  suggested: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(setProjectHealth, null);
  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="id" value={projectId} />
      <select
        name="healthStatus"
        defaultValue={current}
        className={cx(inputClass, "h-8 w-auto text-xs")}
        aria-label="Cambiar salud"
      >
        {PROJECT_HEALTHS.map((s) => (
          <option key={s} value={s}>
            {projectHealthMeta[s]?.label ?? s}
            {s === suggested ? " (sugerido)" : ""}
          </option>
        ))}
      </select>
      <button type="submit" className={cx(buttonGhostClass, "h-8 px-2 text-xs")}>
        Cambiar
      </button>
      {state && !state.ok ? <span className="text-xs text-danger">{state.message}</span> : null}
    </form>
  );
}

export function CompleteProjectForm({
  projectId,
  pendingActivities,
}: {
  projectId: number;
  pendingActivities: number;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(completeProject, null);
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={projectId} />
      <FormAlert state={state} />
      {pendingActivities > 0 ? (
        <div className="space-y-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
          <p className="text-fg">
            Hay {pendingActivities} actividad(es) pendiente(s). Completar el proyecto con
            pendientes requiere una excepción explícita con motivo (queda auditada).
          </p>
          <label className="flex items-center gap-2 text-fg">
            <input type="checkbox" name="force" /> Completar con excepción
          </label>
          <textarea
            name="forceReason"
            rows={2}
            placeholder="Motivo de la excepción…"
            className={inputClass}
          />
        </div>
      ) : null}
      <SubmitButton>Completar proyecto</SubmitButton>
    </form>
  );
}

/* ------------------------------------------------------------------ lists */

export function ListForm({
  projectId,
  list,
}: {
  projectId: number;
  list?: {
    id: number;
    name: string;
    description: string | null;
    startDate: string | null;
    targetDate: string | null;
    status: string;
  };
}) {
  const { state, formAction, errors, value } = useForm(
    list ? updateProjectList : createProjectList,
    list,
  );
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="projectId" value={projectId} />
      {list ? <input type="hidden" name="id" value={list.id} /> : null}
      <FormAlert state={state} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Nombre" name="name" errors={errors}>
          <TextInput name="name" value={value} errors={errors} required />
        </Field>
        {list ? (
          <Field label="Estado" name="status" errors={errors}>
            <SelectInput
              name="status"
              value={value}
              options={metaOptions(PROJECT_LIST_STATUSES, projectListStatusMeta)}
            />
          </Field>
        ) : null}
        <Field label="Inicio" name="startDate" errors={errors}>
          <TextInput name="startDate" value={value} errors={errors} type="date" />
        </Field>
        <Field label="Objetivo" name="targetDate" errors={errors}>
          <TextInput name="targetDate" value={value} errors={errors} type="date" />
        </Field>
      </div>
      <Field label="Descripción" name="description" errors={errors}>
        <textarea
          id="description"
          name="description"
          rows={2}
          defaultValue={value("description")}
          className={inputClass}
        />
      </Field>
      <SubmitButton>{list ? "Guardar lista" : "Crear lista"}</SubmitButton>
    </form>
  );
}

/* ------------------------------------------------------------- activities */

export function ProjectActivityForm({
  projectId,
  lists,
  internalUsers,
  defaultListId,
  parentActivityId,
}: {
  projectId: number;
  lists: Option[];
  internalUsers: Option[];
  defaultListId?: number;
  /** Set when creating a subactivity — the list is locked to the parent's. */
  parentActivityId?: number;
}) {
  const { state, formAction, errors, value } = useForm(createProjectActivity, {
    listId: defaultListId,
  });
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="projectId" value={projectId} />
      {parentActivityId ? (
        <input type="hidden" name="parentActivityId" value={parentActivityId} />
      ) : null}
      <FormAlert state={state} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Título" name="title" errors={errors}>
          <TextInput name="title" value={value} errors={errors} required />
        </Field>
        {parentActivityId && defaultListId ? (
          <input type="hidden" name="listId" value={defaultListId} />
        ) : (
          <Field label="Lista" name="listId" errors={errors}>
            <SelectInput
              name="listId"
              value={value}
              options={lists.map((l) => ({ value: String(l.id), label: l.name }))}
              allowEmpty="— Selecciona —"
            />
          </Field>
        )}
        <Field label="Tipo" name="activityType" errors={errors}>
          <SelectInput
            name="activityType"
            value={value}
            options={metaOptions(ACTIVITY_TYPES, activityTypeMeta)}
          />
        </Field>
        <Field label="Prioridad" name="priority" errors={errors}>
          <SelectInput
            name="priority"
            value={value}
            options={[
              { value: "low", label: "Low" },
              { value: "medium", label: "Medium" },
              { value: "high", label: "High" },
              { value: "critical", label: "Critical" },
            ]}
          />
        </Field>
        <Field label="Responsable" name="assigneeId" errors={errors}>
          <SelectInput
            name="assigneeId"
            value={value}
            options={internalUsers.map((u) => ({ value: String(u.id), label: u.name }))}
            allowEmpty="— Sin asignar —"
          />
        </Field>
        <Field label="Vence" name="dueDate" errors={errors}>
          <TextInput name="dueDate" value={value} errors={errors} type="date" />
        </Field>
        <Field label="Estimación (min)" name="estimatedMinutes" errors={errors}>
          <TextInput name="estimatedMinutes" value={value} errors={errors} type="number" />
        </Field>
      </div>
      <SubmitButton>{parentActivityId ? "Crear subactividad" : "Crear actividad"}</SubmitButton>
    </form>
  );
}

export function MoveToListForm({
  activityId,
  lists,
  currentListId,
}: {
  activityId: number;
  lists: Option[];
  currentListId: number | null;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(moveActivityToList, null);
  return (
    <form action={formAction} className="flex items-center gap-1">
      <input type="hidden" name="id" value={activityId} />
      <select
        name="listId"
        defaultValue={currentListId ? String(currentListId) : ""}
        className={cx(inputClass, "h-7 w-auto text-xs")}
        aria-label="Mover a lista"
      >
        {lists.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
      <button type="submit" className={cx(buttonGhostClass, "h-7 px-2 text-xs")}>
        Mover
      </button>
      {state && !state.ok ? <span className="text-xs text-danger">{state.message}</span> : null}
    </form>
  );
}

export function CompleteActivityButton({
  activityId,
  openBlockers,
}: {
  activityId: number;
  openBlockers: number;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    completeProjectActivity,
    null,
  );
  return (
    <form
      action={formAction}
      className="inline"
      onSubmit={(e) => {
        if (
          openBlockers > 0 &&
          !window.confirm(
            `Esta actividad está bloqueada por ${openBlockers} dependencia(s) abierta(s). ¿Completar de todas formas?`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={activityId} />
      {openBlockers > 0 ? <input type="hidden" name="confirmBlocked" value="true" /> : null}
      <button
        type="submit"
        className="rounded-md px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-subtle hover:text-fg"
      >
        Completar
      </button>
      {state && !state.ok ? <span className="ml-1 text-xs text-danger">{state.message}</span> : null}
    </form>
  );
}

/* -------------------------------------------------------------- members */

export function MemberForm({
  projectId,
  internalUsers,
}: {
  projectId: number;
  internalUsers: Option[];
}) {
  const { state, formAction, errors, value } = useForm(addProjectMember);
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="projectId" value={projectId} />
      <div className="min-w-48">
        <Field label="Usuario" name="userId" errors={errors}>
          <SelectInput
            name="userId"
            value={value}
            options={internalUsers.map((u) => ({ value: String(u.id), label: u.name }))}
            allowEmpty="— Selecciona —"
          />
        </Field>
      </div>
      <div>
        <Field label="Rol" name="role" errors={errors}>
          <SelectInput
            name="role"
            value={value}
            options={metaOptions(
              PROJECT_MEMBER_ROLES.filter((r) => r !== "manager"),
              projectMemberRoleMeta,
            )}
          />
        </Field>
      </div>
      <SubmitButton>Agregar</SubmitButton>
      <FormAlert state={state} />
    </form>
  );
}

/* ------------------------------------------------------------ milestones */

export function MilestoneForm({
  projectId,
  internalUsers,
  milestone,
}: {
  projectId: number;
  internalUsers: Option[];
  milestone?: {
    id: number;
    name: string;
    description: string | null;
    targetDate: string;
    ownerId: number | null;
    status: string;
  };
}) {
  const { state, formAction, errors, value } = useForm(
    milestone ? updateMilestone : createMilestone,
    milestone,
  );
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="projectId" value={projectId} />
      {milestone ? <input type="hidden" name="id" value={milestone.id} /> : null}
      <FormAlert state={state} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Nombre" name="name" errors={errors}>
          <TextInput name="name" value={value} errors={errors} required />
        </Field>
        <Field label="Fecha objetivo" name="targetDate" errors={errors}>
          <TextInput name="targetDate" value={value} errors={errors} type="date" required />
        </Field>
        <Field label="Responsable" name="ownerId" errors={errors}>
          <SelectInput
            name="ownerId"
            value={value}
            options={internalUsers.map((u) => ({ value: String(u.id), label: u.name }))}
            allowEmpty="— Sin responsable —"
          />
        </Field>
        {milestone ? (
          <Field label="Estado" name="status" errors={errors}>
            <SelectInput
              name="status"
              value={value}
              options={metaOptions(MILESTONE_STATUSES, milestoneStatusMeta)}
            />
          </Field>
        ) : null}
      </div>
      <Field label="Descripción" name="description" errors={errors}>
        <textarea
          id="description"
          name="description"
          rows={2}
          defaultValue={value("description")}
          className={inputClass}
        />
      </Field>
      <SubmitButton>{milestone ? "Guardar hito" : "Crear hito"}</SubmitButton>
    </form>
  );
}

export function MilestoneLinkForm({
  milestoneId,
  activities,
  linked,
}: {
  milestoneId: number;
  activities: Option[];
  linked: { activityId: number; title: string }[];
}) {
  const { state, formAction, errors, value } = useForm(linkMilestoneActivity);
  const [unlinkState, unlinkAction] = useActionState<ActionState, FormData>(
    linkMilestoneActivity,
    null,
  );
  return (
    <div className="space-y-2">
      {linked.length > 0 ? (
        <ul className="space-y-1">
          {linked.map((l) => (
            <li key={l.activityId} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate text-muted">{l.title}</span>
              <form action={unlinkAction} className="inline">
                <input type="hidden" name="milestoneId" value={milestoneId} />
                <input type="hidden" name="activityId" value={l.activityId} />
                <input type="hidden" name="unlink" value="true" />
                <button type="submit" className="text-xs text-muted hover:text-danger">
                  Desvincular
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : null}
      {unlinkState && !unlinkState.ok ? (
        <p className="text-xs text-danger">{unlinkState.message}</p>
      ) : null}
      <form action={formAction} className="flex items-center gap-2">
        <input type="hidden" name="milestoneId" value={milestoneId} />
        <select
          name="activityId"
          defaultValue={value("activityId")}
          className={cx(inputClass, "h-8 w-auto text-xs")}
          aria-label="Vincular actividad"
        >
          <option value="">— Vincular actividad —</option>
          {activities.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <button type="submit" className={cx(buttonGhostClass, "h-8 px-2 text-xs")}>
          Vincular
        </button>
        <FieldError id="activityId-error" errors={errors.activityId} />
        {state && !state.ok ? <span className="text-xs text-danger">{state.message}</span> : null}
      </form>
    </div>
  );
}

/* ----------------------------------------------------------------- risks */

export function RiskForm({
  projectId,
  internalUsers,
  risk,
}: {
  projectId: number;
  internalUsers: Option[];
  risk?: {
    id: number;
    title: string;
    description: string | null;
    probability: string;
    impact: string;
    status: string;
    ownerId: number | null;
    mitigationPlan: string | null;
    dueDate: string | null;
  };
}) {
  const { state, formAction, errors, value } = useForm(risk ? updateRisk : createRisk, risk);
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="projectId" value={projectId} />
      {risk ? <input type="hidden" name="id" value={risk.id} /> : null}
      <FormAlert state={state} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Título" name="title" errors={errors}>
          <TextInput name="title" value={value} errors={errors} required />
        </Field>
        <Field label="Responsable" name="ownerId" errors={errors}>
          <SelectInput
            name="ownerId"
            value={value}
            options={internalUsers.map((u) => ({ value: String(u.id), label: u.name }))}
            allowEmpty="— Sin responsable —"
          />
        </Field>
        <Field label="Probabilidad" name="probability" errors={errors}>
          <SelectInput
            name="probability"
            value={value}
            options={RISK_PROBABILITIES.map((p) => ({ value: p, label: p }))}
          />
        </Field>
        <Field label="Impacto" name="impact" errors={errors}>
          <SelectInput
            name="impact"
            value={value}
            options={RISK_IMPACTS.map((i) => ({ value: i, label: i }))}
          />
        </Field>
        {risk ? (
          <Field label="Estado" name="status" errors={errors}>
            <SelectInput
              name="status"
              value={value}
              options={metaOptions(RISK_STATUSES, riskStatusMeta)}
            />
          </Field>
        ) : null}
        <Field label="Fecha límite" name="dueDate" errors={errors}>
          <TextInput name="dueDate" value={value} errors={errors} type="date" />
        </Field>
      </div>
      <Field label="Descripción" name="description" errors={errors}>
        <textarea
          id="description"
          name="description"
          rows={2}
          defaultValue={value("description")}
          className={inputClass}
        />
      </Field>
      <Field label="Plan de mitigación" name="mitigationPlan" errors={errors}>
        <textarea
          id="mitigationPlan"
          name="mitigationPlan"
          rows={2}
          defaultValue={value("mitigationPlan")}
          className={inputClass}
        />
      </Field>
      <SubmitButton>{risk ? "Guardar riesgo" : "Registrar riesgo"}</SubmitButton>
    </form>
  );
}

/* ---------------------------------------------------------- dependencies */

export function DependencyForm({
  blockedActivityId,
  candidates,
}: {
  blockedActivityId: number;
  candidates: Option[];
}) {
  const { state, formAction, errors, value } = useForm(addDependency);
  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="blockedActivityId" value={blockedActivityId} />
      <select
        name="blockerActivityId"
        defaultValue={value("blockerActivityId")}
        className={cx(inputClass, "h-8 w-auto text-xs")}
        aria-label="Bloqueada por"
      >
        <option value="">— Bloqueada por… —</option>
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <button type="submit" className={cx(buttonGhostClass, "h-8 px-2 text-xs")}>
        Agregar
      </button>
      <FieldError id="blockerActivityId-error" errors={errors.blockerActivityId} />
      {state && !state.ok ? <span className="text-xs text-danger">{state.message}</span> : null}
    </form>
  );
}

/* -------------------------------------------------------------- comments */

export function CommentComposer({ projectId }: { projectId: number }) {
  const { state, formAction, errors, value } = useForm(addProjectComment);
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="projectId" value={projectId} />
      <FormAlert state={state} />
      <Field label="Nuevo comentario" name="body" errors={errors}>
        <textarea
          id="body"
          name="body"
          rows={3}
          required
          defaultValue={value("body")}
          className={inputClass}
          placeholder="Acuerdos, decisiones, seguimiento del proyecto…"
        />
      </Field>
      <SubmitButton>Comentar</SubmitButton>
    </form>
  );
}

export function CommentEditor({
  projectId,
  commentId,
  body,
}: {
  projectId: number;
  commentId: number;
  body: string;
}) {
  const { state, formAction, errors, value } = useForm(editOwnProjectComment, { body });
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-xs text-muted hover:text-fg">Editar</summary>
      <form action={formAction} className="mt-2 space-y-2">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="id" value={commentId} />
        <FormAlert state={state} />
        <textarea
          name="body"
          rows={3}
          required
          defaultValue={value("body")}
          className={inputClass}
          aria-label="Editar comentario"
        />
        <FieldError id="body-error" errors={errors.body} />
        <SubmitButton>Guardar</SubmitButton>
      </form>
    </details>
  );
}

/* ----------------------------------------------------------------- files */

export function ProjectUploadForm({ projectId }: { projectId: number }) {
  const [state, formAction] = useActionState<ActionState, FormData>(uploadProjectFile, null);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="file" name="file" required className="text-sm text-muted" />
      <SubmitButton>Subir archivo</SubmitButton>
      <FormAlert state={state} />
    </form>
  );
}
