"use client";

import { useActionState, useMemo, useState } from "react";
import { buttonSecondaryClass, cx, inputClass, labelClass } from "@/components/ui";
import { FieldError, FormAlert } from "@/components/form-feedback";
import { SubmitButton } from "@/components/submit-button";
import type { ActionState } from "@/lib/action-result";
import { activityTypeMeta } from "@/lib/labels";
import { ACTIVITY_TYPES } from "@/lib/activities";
import {
  computeNextRun,
  describeSchedule,
  nextOccurrencesLocal,
  renderTemplate,
  TemplateRenderError,
  type ScheduleFields,
  type TemplateContext,
} from "@/lib/recurrence";
import {
  activateRecurrence,
  archiveRecurrence,
  backfillRecurrence,
  createRecurrence,
  deleteRecurrence,
  duplicateRecurrence,
  finishRecurrence,
  pauseRecurrence,
  reactivateRecurrence,
  restoreRecurrence,
  retryRecurrenceExecution,
  runRecurrenceNow,
  skipNextRecurrenceOccurrence,
  updateRecurrence,
} from "./actions";

type Option = { id: number; name: string };
type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/* ----------------------------------------------------------- row actions */

const rowActions = {
  runRecurrenceNow,
  pauseRecurrence,
  reactivateRecurrence,
  archiveRecurrence,
  restoreRecurrence,
  finishRecurrence,
  retryRecurrenceExecution,
  skipNextRecurrenceOccurrence,
  deleteRecurrence,
} as const;

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

export function Disclosure({ label, children, open }: { label: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details className="group rounded-lg border border-edge" open={open}>
      <summary className={cx(buttonSecondaryClass, "cursor-pointer list-none border-0 select-none")}>{label}</summary>
      <div className="border-t border-edge p-4">{children}</div>
    </details>
  );
}

/* --------------------------------------------------------- small forms */

export function ActivateButton({ id }: { id: number }) {
  const [state, formAction] = useActionState<ActionState, FormData>(activateRecurrence, null);
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="id" value={id} />
      <button type="submit" className={buttonSecondaryClass}>Activar</button>
      {state && !state.ok ? <span className="ml-2 text-xs text-danger">{state.message}</span> : null}
    </form>
  );
}

export function PauseForm({ id }: { id: number }) {
  const [state, formAction] = useActionState<ActionState, FormData>(pauseRecurrence, null);
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <FormAlert state={state} />
      <textarea name="reason" rows={2} placeholder="Motivo (opcional)…" className={inputClass} />
      <SubmitButton>Pausar</SubmitButton>
    </form>
  );
}

export function ReactivateForm({ id }: { id: number }) {
  const [state, formAction] = useActionState<ActionState, FormData>(reactivateRecurrence, null);
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <FormAlert state={state} />
      <label className={labelClass}>Al reactivar</label>
      <select name="mode" defaultValue="next_future" className={inputClass}>
        <option value="next_future">Continuar desde la siguiente fecha futura</option>
        <option value="recalculate">Recalcular desde hoy</option>
      </select>
      <SubmitButton>Reactivar</SubmitButton>
    </form>
  );
}

export function SkipForm({ id }: { id: number }) {
  const [state, formAction] = useActionState<ActionState, FormData>(skipNextRecurrenceOccurrence, null);
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <FormAlert state={state} />
      <textarea name="reason" rows={2} placeholder="Motivo (opcional)…" className={inputClass} />
      <SubmitButton>Omitir próxima ocurrencia</SubmitButton>
    </form>
  );
}

export function DuplicateForm({ id, defaultName }: { id: number; defaultName: string }) {
  const { state, formAction, errors, value } = useForm(duplicateRecurrence, { name: `${defaultName} (copia)` });
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <FormAlert state={state} />
      <Field label="Nombre de la copia" name="name" errors={errors}>
        <TextInput name="name" value={value} errors={errors} required />
      </Field>
      <SubmitButton>Duplicar como borrador</SubmitButton>
    </form>
  );
}

export function BackfillForm({ id }: { id: number }) {
  const [state, formAction] = useActionState<ActionState, FormData>(backfillRecurrence, null);
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <FormAlert state={state} />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Desde</label>
          <input type="date" name="from" required className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Hasta</label>
          <input type="date" name="to" required className={inputClass} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-fg">
        <input type="checkbox" name="confirm" required /> Confirmo generar las ocurrencias faltantes en ese rango (máx. 31).
      </label>
      <SubmitButton>Generar faltantes</SubmitButton>
    </form>
  );
}

export function RetryButton({ executionId, definitionId }: { executionId: number; definitionId: number }) {
  const [state, formAction] = useActionState<ActionState, FormData>(retryRecurrenceExecution, null);
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="executionId" value={executionId} />
      <input type="hidden" name="definitionId" value={definitionId} />
      <button type="submit" className="text-xs font-medium text-primary hover:underline">
        Reintentar
      </button>
      {state && !state.ok ? <span className="ml-2 text-xs text-danger">{state.message}</span> : null}
    </form>
  );
}

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

function Field({ label, name, errors, children }: { label: string; name: string; errors: Record<string, string[]>; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={name} className={labelClass}>{label}</label>
      {children}
      <FieldError id={`${name}-error`} errors={errors[name]} />
    </div>
  );
}

function TextInput({ name, value, errors, type = "text", required }: { name: string; value: (n: string) => string; errors: Record<string, string[]>; type?: string; required?: boolean }) {
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

/* ---------------------------------------------------------------- wizard */

type TargetType = "activity" | "ticket" | "project_activity" | "report";
type Frequency = "daily" | "weekly" | "monthly" | "quarterly" | "semiannual" | "annual" | "weekdays" | "custom";

const WEEKDAY_OPTIONS = [
  [1, "Lun"], [2, "Mar"], [3, "Mié"], [4, "Jue"], [5, "Vie"], [6, "Sáb"], [7, "Dom"],
] as const;

export type RecurrenceFormDefaults = {
  id?: number;
  name?: string;
  description?: string | null;
  targetType?: TargetType;
  clientId?: number | null;
  projectId?: number | null;
  projectListId?: number | null;
  assigneeId?: number | null;
  frequency?: Frequency;
  interval?: number;
  daysOfWeek?: number[] | null;
  dayOfMonth?: number | null;
  monthOfYear?: number | null;
  weekOfMonth?: number | null;
  timeOfDay?: string;
  timezone?: string;
  startAt?: string;
  endAt?: string | null;
  maxOccurrences?: number | null;
  templateData?: Record<string, unknown>;
};

const COMMON_TIMEZONES = [
  "America/Mexico_City",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "America/Bogota",
  "America/Argentina/Buenos_Aires",
  "UTC",
];

export function RecurrenceWizard({
  defaults,
  clients,
  projects,
  projectListsByProject,
  internalUsers,
  initialTargetType,
}: {
  defaults?: RecurrenceFormDefaults;
  clients: Option[];
  projects: Option[];
  projectListsByProject: Record<number, Option[]>;
  internalUsers: Option[];
  initialTargetType?: string;
}) {
  const isEdit = defaults?.id !== undefined;
  const action = isEdit ? updateRecurrence : createRecurrence;
  const [state, formAction] = useActionState<ActionState, FormData>(action, null);
  const failed = state && !state.ok ? state : null;
  const errors = failed?.fieldErrors ?? {};

  const [targetType, setTargetType] = useState<TargetType>(
    (defaults?.targetType ?? (initialTargetType as TargetType) ?? "activity") as TargetType,
  );
  const [name, setName] = useState(defaults?.name ?? "");
  const [clientId, setClientId] = useState<string>(defaults?.clientId ? String(defaults.clientId) : "");
  const [projectId, setProjectId] = useState<string>(defaults?.projectId ? String(defaults.projectId) : "");
  const [projectListId, setProjectListId] = useState<string>(defaults?.projectListId ? String(defaults.projectListId) : "");
  const [assigneeId, setAssigneeId] = useState<string>(defaults?.assigneeId ? String(defaults.assigneeId) : "");

  const td = (defaults?.templateData ?? {}) as Record<string, unknown>;
  const [title, setTitle] = useState(String(td.title ?? ""));
  const [description, setDescription] = useState(String(td.description ?? ""));
  const [priority, setPriority] = useState(String(td.priority ?? "medium"));
  const [activityType, setActivityType] = useState(String(td.activityType ?? "general"));
  const [category, setCategory] = useState(String(td.category ?? ""));
  const [channel, setChannel] = useState(String(td.channel ?? "internal"));
  const [modality, setModality] = useState(String(td.modality ?? "remote"));
  const [dueOffsetDays, setDueOffsetDays] = useState(td.dueOffsetDays != null ? String(td.dueOffsetDays) : "");
  const [reportPeriodRule, setReportPeriodRule] = useState(String(td.periodRule ?? "previous_month"));
  const [startOffsetDays, setStartOffsetDays] = useState(td.startOffsetDays != null ? String(td.startOffsetDays) : "");
  const [estimatedMinutes, setEstimatedMinutes] = useState(td.estimatedMinutes != null ? String(td.estimatedMinutes) : "");

  const [frequency, setFrequency] = useState<Frequency>(defaults?.frequency ?? "monthly");
  const [interval, setIntervalVal] = useState(String(defaults?.interval ?? 1));
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(defaults?.daysOfWeek ?? []);
  const [dayOfMonth, setDayOfMonth] = useState(defaults?.dayOfMonth != null ? String(defaults.dayOfMonth) : "1");
  const [monthOfYear, setMonthOfYear] = useState(defaults?.monthOfYear != null ? String(defaults.monthOfYear) : "1");
  const [weekOfMonth, setWeekOfMonth] = useState(defaults?.weekOfMonth != null ? String(defaults.weekOfMonth) : "");
  const [timeOfDay, setTimeOfDay] = useState(defaults?.timeOfDay ?? "09:00");
  const [timezone, setTimezone] = useState(defaults?.timezone ?? "America/Mexico_City");
  const [startAt, setStartAt] = useState(defaults?.startAt ?? new Date().toISOString().slice(0, 10));
  const [endAt, setEndAt] = useState(defaults?.endAt ?? "");
  const [maxOccurrences, setMaxOccurrences] = useState(defaults?.maxOccurrences != null ? String(defaults.maxOccurrences) : "");

  const projectLists = projectId ? (projectListsByProject[Number(projectId)] ?? []) : [];
  const clientName = clients.find((c) => String(c.id) === clientId)?.name;
  const projectName = projects.find((p) => String(p.id) === projectId)?.name;
  const assigneeName = internalUsers.find((u) => String(u.id) === assigneeId)?.name;

  const schedule: ScheduleFields = useMemo(
    () => ({
      frequency,
      interval: Number(interval) || 1,
      daysOfWeek: daysOfWeek.length > 0 ? daysOfWeek : null,
      dayOfMonth: dayOfMonth === "" ? null : Number(dayOfMonth),
      monthOfYear: monthOfYear === "" ? null : Number(monthOfYear),
      weekOfMonth: weekOfMonth === "" ? null : Number(weekOfMonth),
      timeOfDay,
      timezone,
      startAt,
      endAt: endAt || null,
    }),
    [frequency, interval, daysOfWeek, dayOfMonth, monthOfYear, weekOfMonth, timeOfDay, timezone, startAt, endAt],
  );

  const preview = useMemo(() => {
    const next = computeNextRun(schedule, new Date());
    if (!next) return { locals: [] as string[], scheduleText: "" };
    const locals = [next.local, ...nextOccurrencesLocal(schedule, next.local, 4)];
    return { locals, scheduleText: describeSchedule(schedule) };
  }, [schedule]);

  const templatePreview = useMemo(() => {
    if (preview.locals.length === 0) return { title: null as string | null, error: null as string | null };
    const ctx: TemplateContext = {
      client: clientName ? { name: clientName } : null,
      contact: null,
      project: projectName ? { name: projectName } : null,
      assignee: assigneeName ? { name: assigneeName } : null,
      recurrence: { name: name || "(sin nombre)" },
      occurrence: { date: preview.locals[0] },
    };
    try {
      return { title: renderTemplate(title || "(sin título)", ctx), error: null };
    } catch (err) {
      return { title: null, error: err instanceof TemplateRenderError ? err.message : "Error de plantilla." };
    }
  }, [preview.locals, title, clientName, projectName, assigneeName, name]);

  const templateData = useMemo(() => {
    const base: Record<string, unknown> = { targetType, title, description, priority };
    if (targetType === "activity" || targetType === "project_activity") {
      base.activityType = activityType;
      base.dueOffsetDays = dueOffsetDays === "" ? null : Number(dueOffsetDays);
      base.startOffsetDays = startOffsetDays === "" ? null : Number(startOffsetDays);
      base.estimatedMinutes = estimatedMinutes === "" ? null : Number(estimatedMinutes);
    } else if (targetType === "ticket") {
      base.category = category;
      base.channel = channel;
      base.modality = modality;
      base.dueOffsetDays = dueOffsetDays === "" ? null : Number(dueOffsetDays);
    } else if (targetType === "report") {
      base.periodRule = reportPeriodRule;
      base.templateId = null;
      base.dueOffsetDays = dueOffsetDays === "" ? null : Number(dueOffsetDays);
      delete base.description;
      delete base.priority;
    }
    return JSON.stringify(base);
  }, [targetType, title, description, priority, activityType, dueOffsetDays, startOffsetDays, estimatedMinutes, category, channel, modality, reportPeriodRule]);

  const missing: string[] = [];
  if (!name.trim()) missing.push("Nombre de la recurrencia");
  if (!title.trim()) missing.push("Título de la plantilla");
  if (targetType === "ticket" && !clientId) missing.push("Cliente (los tickets requieren cliente)");
  if (targetType === "report" && !assigneeId) missing.push("Responsable del reporte (recomendado)" );
  if (targetType === "ticket" && !category.trim()) missing.push("Categoría del ticket");
  if (targetType === "project_activity" && (!projectId || !projectListId)) missing.push("Proyecto y Lista");
  if (templatePreview.error) missing.push(templatePreview.error);

  return (
    <form action={formAction} className="space-y-6">
      {isEdit ? <input type="hidden" name="id" value={defaults!.id} /> : null}
      <input type="hidden" name="templateData" value={templateData} />
      <FormAlert state={state} />

      {/* Paso 1: Tipo */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-fg">1. Tipo de trabajo a generar</h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {(["activity", "ticket", "project_activity", "report"] as const).map((t) => (
            <button
              key={t}
              type="button"
              disabled={isEdit}
              onClick={() => setTargetType(t)}
              className={cx(
                "rounded-lg border px-4 py-3 text-left text-sm transition-colors",
                targetType === t ? "border-primary bg-primary-soft text-primary" : "border-edge text-fg hover:bg-subtle",
                isEdit && "cursor-not-allowed opacity-60",
              )}
            >
              {t === "activity" ? "Actividad" : t === "ticket" ? "Ticket" : t === "project_activity" ? "Actividad de proyecto" : "Reporte"}
            </button>
          ))}
        </div>
        <input type="hidden" name="targetType" value={targetType} />
        <FieldError id="targetType-error" errors={errors.targetType} />
      </section>

      {/* Paso 2: Contexto */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-fg">2. Contexto</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nombre de la recurrencia" name="name" errors={errors}>
            <input id="name" name="name" required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </Field>
          <Field label={`Cliente${targetType === "ticket" ? " (requerido)" : " (opcional)"}`} name="clientId" errors={errors}>
            <select id="clientId" name="clientId" value={clientId} onChange={(e) => setClientId(e.target.value)} className={inputClass}>
              <option value="">— Sin cliente / interno —</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          {targetType === "project_activity" ? (
            <>
              <Field label="Proyecto" name="projectId" errors={errors}>
                <select
                  id="projectId"
                  name="projectId"
                  value={projectId}
                  onChange={(e) => {
                    setProjectId(e.target.value);
                    setProjectListId("");
                  }}
                  className={inputClass}
                >
                  <option value="">— Selecciona —</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
              <Field label="Lista" name="projectListId" errors={errors}>
                <select id="projectListId" name="projectListId" value={projectListId} onChange={(e) => setProjectListId(e.target.value)} className={inputClass}>
                  <option value="">— Selecciona —</option>
                  {projectLists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </Field>
            </>
          ) : null}
          <Field label="Responsable" name="assigneeId" errors={errors}>
            <select id="assigneeId" name="assigneeId" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className={inputClass}>
              <option value="">— Sin asignar —</option>
              {internalUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Descripción de la recurrencia (opcional)" name="description" errors={errors}>
          <textarea id="description" name="description" rows={2} defaultValue={defaults?.description ?? ""} className={inputClass} />
        </Field>
      </section>

      {/* Paso 3: Plantilla */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-fg">3. Plantilla del {targetType === "ticket" ? "ticket" : "actividad"}</h3>
        <p className="text-xs text-muted">
          Variables disponibles: <code>{"{{client.name}}"}</code> <code>{"{{project.name}}"}</code>{" "}
          <code>{"{{recurrence.name}}"}</code> <code>{"{{occurrence.date}}"}</code> <code>{"{{occurrence.month}}"}</code>{" "}
          <code>{"{{occurrence.year}}"}</code> <code>{"{{assignee.name}}"}</code> <code>{"{{period.start}}"}</code>{" "}
          <code>{"{{period.end}}"}</code>
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass}>Título</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder="Revisión mensual de respaldos — {{client.name}}" />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Descripción (opcional)</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Prioridad</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className={inputClass}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          {targetType === "activity" || targetType === "project_activity" ? (
            <>
              <div>
                <label className={labelClass}>Tipo de actividad</label>
                <select value={activityType} onChange={(e) => setActivityType(e.target.value)} className={inputClass}>
                  {ACTIVITY_TYPES.map((t) => <option key={t} value={t}>{activityTypeMeta[t]?.label ?? t}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Vence N días después de la ocurrencia</label>
                <input type="number" value={dueOffsetDays} onChange={(e) => setDueOffsetDays(e.target.value)} className={inputClass} placeholder="ej. 2" />
              </div>
              <div>
                <label className={labelClass}>Inicia N días antes/después</label>
                <input type="number" value={startOffsetDays} onChange={(e) => setStartOffsetDays(e.target.value)} className={inputClass} placeholder="ej. -1" />
              </div>
              <div>
                <label className={labelClass}>Estimación (minutos)</label>
                <input type="number" value={estimatedMinutes} onChange={(e) => setEstimatedMinutes(e.target.value)} className={inputClass} />
              </div>
            </>
          ) : targetType === "report" ? (
            <>
              <div>
                <label className={labelClass}>Periodo del reporte</label>
                <select value={reportPeriodRule} onChange={(e) => setReportPeriodRule(e.target.value)} className={inputClass}>
                  <option value="previous_month">Mes anterior</option>
                  <option value="previous_week">Semana anterior</option>
                  <option value="previous_quarter">Trimestre anterior</option>
                  <option value="current_month">Mes actual</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Fecha límite N días después</label>
                <input type="number" value={dueOffsetDays} onChange={(e) => setDueOffsetDays(e.target.value)} className={inputClass} placeholder="ej. 5" />
              </div>
              <p className="text-xs text-muted sm:col-span-2">
                La recurrencia crea el Reporte en borrador con el periodo resuelto; la generación de
                contenido, revisión y aprobación siguen siendo humanas — nunca se aprueba ni se marca
                enviado automáticamente.
              </p>
            </>
          ) : (
            <>
              <div>
                <label className={labelClass}>Categoría</label>
                <input value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass} placeholder="Mantenimiento" />
              </div>
              <div>
                <label className={labelClass}>Canal</label>
                <select value={channel} onChange={(e) => setChannel(e.target.value)} className={inputClass}>
                  {["email", "phone", "whatsapp", "portal", "in_person", "internal"].map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Modalidad</label>
                <select value={modality} onChange={(e) => setModality(e.target.value)} className={inputClass}>
                  <option value="remote">Remota</option>
                  <option value="onsite">En sitio</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Vence N días después</label>
                <input type="number" value={dueOffsetDays} onChange={(e) => setDueOffsetDays(e.target.value)} className={inputClass} />
              </div>
            </>
          )}
        </div>
      </section>

      {/* Paso 4: Frecuencia */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-fg">4. Frecuencia</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className={labelClass}>Frecuencia</label>
            <select name="frequency" value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)} className={inputClass}>
              <option value="daily">Diaria</option>
              <option value="weekdays">Días laborales (lun–vie)</option>
              <option value="weekly">Semanal</option>
              <option value="monthly">Mensual</option>
              <option value="quarterly">Trimestral</option>
              <option value="semiannual">Semestral</option>
              <option value="annual">Anual</option>
            </select>
          </div>
          {frequency !== "weekdays" ? (
            <div>
              <label className={labelClass}>Cada N {frequency === "daily" ? "días" : frequency === "weekly" ? "semanas" : "periodos"}</label>
              <input type="number" name="interval" min={1} value={interval} onChange={(e) => setIntervalVal(e.target.value)} className={inputClass} />
            </div>
          ) : null}
          <div>
            <label className={labelClass}>Hora</label>
            <input type="time" name="timeOfDay" value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value)} className={inputClass} />
          </div>
          <div className="sm:col-span-3">
            <label className={labelClass}>Zona horaria</label>
            <select name="timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} className={inputClass}>
              {[...new Set([timezone, ...COMMON_TIMEZONES])].map((tz) => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </div>

          {frequency === "weekly" || frequency === "custom" ? (
            <div className="sm:col-span-3">
              <label className={labelClass}>Días de la semana</label>
              <div className="flex flex-wrap gap-2">
                {WEEKDAY_OPTIONS.map(([d, label]) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDaysOfWeek((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()))}
                    className={cx(
                      "rounded-md px-3 py-1.5 text-xs font-medium",
                      daysOfWeek.includes(d) ? "bg-primary-soft text-primary" : "border border-edge text-muted hover:bg-subtle",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {daysOfWeek.map((d) => <input key={d} type="hidden" name="daysOfWeek" value={d} />)}
            </div>
          ) : null}

          {["monthly", "quarterly", "semiannual", "annual"].includes(frequency) ? (
            <>
              <div>
                <label className={labelClass}>Día del mes (o -1 = último)</label>
                <input type="number" name="dayOfMonth" value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} className={inputClass} />
              </div>
              {frequency === "annual" ? (
                <div>
                  <label className={labelClass}>Mes del año</label>
                  <input type="number" name="monthOfYear" min={1} max={12} value={monthOfYear} onChange={(e) => setMonthOfYear(e.target.value)} className={inputClass} />
                </div>
              ) : null}
              <div>
                <label className={labelClass}>O: semana del mes (1–4, -1 = última)</label>
                <input type="number" name="weekOfMonth" value={weekOfMonth} onChange={(e) => setWeekOfMonth(e.target.value)} placeholder="opcional" className={inputClass} />
              </div>
            </>
          ) : null}

          <div>
            <label className={labelClass}>Fecha de inicio</label>
            <input type="date" name="startAt" required value={startAt} onChange={(e) => setStartAt(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Fecha de fin (opcional)</label>
            <input type="date" name="endAt" value={endAt} onChange={(e) => setEndAt(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Máximo de ocurrencias (opcional)</label>
            <input type="number" name="maxOccurrences" value={maxOccurrences} onChange={(e) => setMaxOccurrences(e.target.value)} className={inputClass} />
          </div>
        </div>
      </section>

      {/* Paso 5: Revisión */}
      <section className="space-y-3 rounded-lg border border-edge bg-subtle p-4">
        <h3 className="text-sm font-semibold text-fg">5. Revisión</h3>
        <p className="text-sm text-fg">{preview.scheduleText || "Configura la frecuencia para ver la regla."}</p>
        {templatePreview.title ? (
          <p className="text-sm text-muted">
            Vista previa del título: <span className="font-medium text-fg">{templatePreview.title}</span>
          </p>
        ) : null}
        {preview.locals.length > 0 ? (
          <div>
            <p className="text-xs font-medium text-muted">Próximas 5 ocurrencias:</p>
            <ul className="mt-1 flex flex-wrap gap-2">
              {preview.locals.map((l) => (
                <li key={l} className="rounded-md border border-edge bg-surface px-2 py-1 text-xs text-fg">{l}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {missing.length > 0 ? (
          <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-sm text-fg">
            <p className="font-medium">Campos faltantes o advertencias:</p>
            <ul className="mt-1 list-disc pl-5">
              {missing.map((m) => <li key={m}>{m}</li>)}
            </ul>
          </div>
        ) : null}
      </section>

      <div className="flex flex-wrap gap-3">
        <input type="hidden" name="activate" value="false" />
        <SubmitButton>{isEdit ? "Guardar cambios" : "Guardar borrador"}</SubmitButton>
        {!isEdit ? (
          <button
            type="submit"
            disabled={missing.length > 0}
            onClick={(e) => {
              const form = e.currentTarget.closest("form");
              const activateInput = form?.querySelector('input[name="activate"]') as HTMLInputElement | null;
              if (activateInput) activateInput.value = "true";
            }}
            className={cx(buttonSecondaryClass, missing.length > 0 && "cursor-not-allowed opacity-50")}
          >
            Guardar y activar
          </button>
        ) : null}
      </div>
    </form>
  );
}
