"use client";

import { useActionState, useState } from "react";
import { buttonSecondaryClass, cx, inputClass, labelClass } from "@/components/ui";
import { FieldError, FormAlert } from "@/components/form-feedback";
import { SubmitButton } from "@/components/submit-button";
import type { ActionState } from "@/lib/action-result";
import { reportTypeMeta } from "@/lib/labels";
import { PERIOD_RULES, REPORT_TYPES } from "@/lib/reports";
import {
  approveReport,
  archiveReport,
  createReport,
  deleteReport,
  duplicateReport,
  generateReportAction,
  markReportSent,
  requestReportChanges,
  restoreReport,
  setIndicatorThreshold,
  updateReportNarrative,
} from "./actions";

type Option = { id: number; name: string };

const PERIOD_LABELS: Record<string, string> = {
  current_week: "Semana actual",
  previous_week: "Semana anterior",
  current_month: "Mes actual",
  previous_month: "Mes anterior",
  current_quarter: "Trimestre actual",
  previous_quarter: "Trimestre anterior",
  current_year: "Año actual",
  custom: "Personalizado",
};

/* ----------------------------------------------------------- row actions */

const rowActions = {
  generateReportAction,
  approveReport,
  archiveReport,
  restoreReport,
  duplicateReport,
  deleteReport,
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

/* --------------------------------------------------------------- creation */

export function CreateReportForm({
  clients,
  projects,
  templates,
  internalUsers,
  defaults,
}: {
  clients: Option[];
  projects: Option[];
  templates: { id: number; name: string; reportType: string }[];
  internalUsers: Option[];
  defaults?: { clientId?: number; projectId?: number; reportType?: string };
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(createReport, null);
  const failed = state && !state.ok ? state : null;
  const errors = failed?.fieldErrors ?? {};
  const [reportType, setReportType] = useState(defaults?.reportType ?? "monthly_service");
  const [periodRule, setPeriodRule] = useState("previous_month");
  const clientRequired = ["monthly_service", "operational_summary", "executive_summary", "sla_report", "billing_support"].includes(reportType);

  return (
    <form action={formAction} className="space-y-4">
      <FormAlert state={state} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="reportType" className={labelClass}>Tipo</label>
          <select id="reportType" name="reportType" value={reportType} onChange={(e) => setReportType(e.target.value)} className={inputClass}>
            {REPORT_TYPES.map((t) => (
              <option key={t} value={t}>{reportTypeMeta[t]?.label ?? t}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="title" className={labelClass}>Nombre</label>
          <input id="title" name="title" required className={inputClass} aria-invalid={errors.title ? true : undefined} />
          <FieldError id="title-error" errors={errors.title} />
        </div>
        <div>
          <label htmlFor="clientId" className={labelClass}>Cliente{clientRequired ? " (requerido)" : " (opcional)"}</label>
          <select id="clientId" name="clientId" defaultValue={defaults?.clientId ? String(defaults.clientId) : ""} className={inputClass}>
            <option value="">— Sin cliente —</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="projectId" className={labelClass}>Proyecto{reportType === "project_report" ? " (requerido)" : " (opcional)"}</label>
          <select id="projectId" name="projectId" defaultValue={defaults?.projectId ? String(defaults.projectId) : ""} className={inputClass}>
            <option value="">— Sin proyecto —</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="periodRule" className={labelClass}>Periodo</label>
          <select id="periodRule" name="periodRule" value={periodRule} onChange={(e) => setPeriodRule(e.target.value)} className={inputClass}>
            {PERIOD_RULES.map((r) => <option key={r} value={r}>{PERIOD_LABELS[r] ?? r}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="templateId" className={labelClass}>Plantilla</label>
          <select id="templateId" name="templateId" className={inputClass}>
            <option value="">— Secciones por defecto —</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        {periodRule === "custom" ? (
          <>
            <div>
              <label htmlFor="periodStart" className={labelClass}>Inicio</label>
              <input type="date" id="periodStart" name="periodStart" className={inputClass} />
            </div>
            <div>
              <label htmlFor="periodEnd" className={labelClass}>Fin</label>
              <input type="date" id="periodEnd" name="periodEnd" className={inputClass} />
            </div>
          </>
        ) : null}
        <div>
          <label htmlFor="responsibleUserId" className={labelClass}>Responsable</label>
          <select id="responsibleUserId" name="responsibleUserId" className={inputClass}>
            <option value="">— Yo —</option>
            {internalUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="deliveryChannel" className={labelClass}>Canal previsto (opcional)</label>
          <select id="deliveryChannel" name="deliveryChannel" defaultValue="" className={inputClass}>
            <option value="">—</option>
            {["email", "whatsapp", "reunión", "portal", "impreso"].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-fg">
        <input type="checkbox" name="generateNow" /> Generar contenido inmediatamente
      </label>
      <SubmitButton>Crear reporte</SubmitButton>
    </form>
  );
}

/* -------------------------------------------------------------- narrative */

export function NarrativeForm({
  report,
}: {
  report: {
    id: number;
    title: string;
    content: string;
    executiveSummary: string | null;
    conclusions: string | null;
    recommendations: string | null;
    internalNotes: string | null;
    subject: string | null;
  };
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(updateReportNarrative, null);
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={report.id} />
      <FormAlert state={state} />
      <div>
        <label htmlFor="title" className={labelClass}>Nombre</label>
        <input id="title" name="title" defaultValue={report.title} required className={inputClass} />
      </div>
      <div>
        <label htmlFor="subject" className={labelClass}>Asunto (para el envío)</label>
        <input id="subject" name="subject" defaultValue={report.subject ?? ""} className={inputClass} />
      </div>
      <div>
        <label htmlFor="content" className={labelClass}>
          Narrativa <span className="font-normal text-muted">(editable — la línea base determinística se conserva en la versión)</span>
        </label>
        <textarea id="content" name="content" rows={4} defaultValue={report.content} className={inputClass} />
      </div>
      <div>
        <label htmlFor="executiveSummary" className={labelClass}>Resumen ejecutivo</label>
        <textarea id="executiveSummary" name="executiveSummary" rows={3} defaultValue={report.executiveSummary ?? ""} className={inputClass} />
      </div>
      <div>
        <label htmlFor="conclusions" className={labelClass}>Conclusiones</label>
        <textarea id="conclusions" name="conclusions" rows={3} defaultValue={report.conclusions ?? ""} className={inputClass} />
      </div>
      <div>
        <label htmlFor="recommendations" className={labelClass}>Recomendaciones</label>
        <textarea id="recommendations" name="recommendations" rows={3} defaultValue={report.recommendations ?? ""} className={inputClass} />
      </div>
      <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
        <label htmlFor="internalNotes" className={labelClass}>
          Notas internas <span className="font-normal text-muted">(nunca aparecen en la salida externa ni en el PDF)</span>
        </label>
        <textarea id="internalNotes" name="internalNotes" rows={2} defaultValue={report.internalNotes ?? ""} className={inputClass} />
      </div>
      <SubmitButton>Guardar cambios</SubmitButton>
    </form>
  );
}

/* --------------------------------------------------------------- workflow */

export function RequestChangesForm({ id }: { id: number }) {
  const [state, formAction] = useActionState<ActionState, FormData>(requestReportChanges, null);
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <FormAlert state={state} />
      <textarea name="reason" rows={2} placeholder="Qué debe corregirse…" className={inputClass} />
      <SubmitButton>Solicitar cambios</SubmitButton>
    </form>
  );
}

export function MarkSentForm({
  id,
  approved,
  contacts,
}: {
  id: number;
  approved: boolean;
  contacts: Option[];
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(markReportSent, null);
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <FormAlert state={state} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Canal</label>
          <select name="deliveryChannel" required className={inputClass}>
            {["email", "whatsapp", "reunión", "portal", "impreso"].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Fecha de envío</label>
          <input type="date" name="sentDate" required defaultValue={new Date().toISOString().slice(0, 10)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Contacto destinatario</label>
          <select name="recipientContactId" className={inputClass}>
            <option value="">—</option>
            {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Notas</label>
          <input name="notes" className={inputClass} />
        </div>
      </div>
      {!approved ? (
        <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
          <label className={labelClass}>Motivo de excepción (el reporte no está aprobado)</label>
          <input name="exceptionReason" required className={inputClass} />
        </div>
      ) : null}
      <p className="text-xs text-muted">Solo registra el envío — Watson no envía correo ni WhatsApp reales.</p>
      <SubmitButton>Marcar enviado</SubmitButton>
    </form>
  );
}

/* -------------------------------------------------------------- thresholds */

export function ThresholdForm({
  thresholdKey,
  label,
  unit,
  current,
}: {
  thresholdKey: string;
  label: string;
  unit: string;
  current: number;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(setIndicatorThreshold, null);
  return (
    <form action={formAction} className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <input type="hidden" name="key" value={thresholdKey} />
      <span className="text-fg">{label}</span>
      <span className="flex items-center gap-2">
        <input type="number" name="value" defaultValue={current} step="1" className={cx(inputClass, "h-8 w-24 text-right")} />
        <span className="text-xs text-muted">{unit}</span>
        <button type="submit" className={cx(buttonSecondaryClass, "h-8 px-2 text-xs")}>Guardar</button>
      </span>
      {state && !state.ok ? <span className="w-full text-xs text-danger">{state.message}</span> : null}
      {state && state.ok ? <span className="w-full text-xs text-success">Guardado.</span> : null}
    </form>
  );
}
