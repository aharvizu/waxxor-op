"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { FormAlert } from "@/components/form-feedback";
import { SearchableSelect } from "@/components/searchable-select";
import { SubmitButton } from "@/components/submit-button";
import { Card, buttonSecondaryClass, cx, inputClass, labelClass } from "@/components/ui";
import type { ActionState } from "@/lib/action-result";
import { ALL_QUESTIONS, ASSESSMENT_SECTIONS, type Answers, type Question } from "@/lib/assessments/questionnaire";
import { saveAssessment } from "./actions";

export type AssessmentFormInitial = {
  id: number | null;
  companyId: number | null;
  clientName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  conductedOn: string;
  status: "draft" | "completed";
  notes: string;
  answers: Answers;
};

/**
 * Formulario del levantamiento, generado desde el cuestionario en código.
 * Pensado para llenarse durante la visita: secciones cortas, opciones
 * cerradas y nada obligatorio salvo a quién se le hace.
 */
export function AssessmentForm({
  initial,
  companies,
}: {
  initial: AssessmentFormInitial;
  companies: { id: number; name: string }[];
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(saveAssessment, null);
  const [companyId, setCompanyId] = useState(initial.companyId === null ? "" : String(initial.companyId));
  const [clientName, setClientName] = useState(initial.clientName);
  const [answers, setAnswers] = useState<Answers>(initial.answers);

  const setAnswer = (key: string, value: string | string[]) =>
    setAnswers((prev) => {
      const next = { ...prev };
      if (value === "" || (Array.isArray(value) && value.length === 0)) delete next[key];
      else next[key] = value;
      return next;
    });

  function changeCompany(value: string) {
    const previous = companies.find((c) => String(c.id) === companyId)?.name ?? "";
    const chosen = companies.find((c) => String(c.id) === value)?.name ?? "";
    setCompanyId(value);
    if (chosen && (clientName.trim() === "" || clientName === previous)) setClientName(chosen);
  }

  const answered = ALL_QUESTIONS.filter((q) => answers[q.key] !== undefined).length;

  return (
    <form action={formAction} className="space-y-6">
      <FormAlert state={state} />
      {initial.id !== null ? <input type="hidden" name="id" value={initial.id} /> : null}
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="answers" value={JSON.stringify(answers)} />

      <Card className="space-y-4 p-5">
        <h2 className="text-sm font-semibold text-fg">¿A quién se le hace?</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="company" className={labelClass}>Empresa</label>
            <SearchableSelect
              id="company"
              value={companyId}
              onValueChange={changeCompany}
              options={[{ value: "", label: "Prospecto (sin empresa registrada)" }, ...companies.map((c) => ({ value: String(c.id), label: c.name }))]}
            />
          </div>
          <div>
            <label htmlFor="clientName" className={labelClass}>Nombre de la empresa o prospecto</label>
            <input id="clientName" name="clientName" className={inputClass} value={clientName} required maxLength={120} onChange={(e) => setClientName(e.target.value)} />
          </div>
          <div>
            <label htmlFor="contactName" className={labelClass}>Persona que respondió</label>
            <input id="contactName" name="contactName" className={inputClass} defaultValue={initial.contactName} maxLength={120} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="contactEmail" className={labelClass}>Correo</label>
              <input id="contactEmail" name="contactEmail" type="email" className={inputClass} defaultValue={initial.contactEmail} maxLength={160} />
            </div>
            <div>
              <label htmlFor="contactPhone" className={labelClass}>Teléfono</label>
              <input id="contactPhone" name="contactPhone" className={inputClass} defaultValue={initial.contactPhone} maxLength={40} />
            </div>
          </div>
          <div>
            <label htmlFor="conductedOn" className={labelClass}>Fecha del levantamiento</label>
            <input id="conductedOn" name="conductedOn" type="date" className={inputClass} defaultValue={initial.conductedOn} required />
          </div>
          <div>
            <label htmlFor="status" className={labelClass}>Estado</label>
            <select id="status" name="status" className={inputClass} defaultValue={initial.status}>
              <option value="draft">En proceso</option>
              <option value="completed">Completado</option>
            </select>
          </div>
        </div>
      </Card>

      {ASSESSMENT_SECTIONS.map((section) => (
        <Card key={section.key} className="space-y-4 p-5">
          <div>
            <h2 className="text-sm font-semibold text-fg">{section.title}</h2>
            <p className="mt-1 text-xs text-muted">{section.intro}</p>
          </div>
          <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
            {section.questions.map((q) => (
              <QuestionField key={q.key} question={q} value={answers[q.key]} onChange={(v) => setAnswer(q.key, v)} />
            ))}
          </div>
        </Card>
      ))}

      <Card className="space-y-2 p-5">
        <label htmlFor="notes" className="text-sm font-semibold text-fg">Notas generales</label>
        <textarea id="notes" name="notes" rows={4} className={inputClass} defaultValue={initial.notes} maxLength={4000} placeholder="Lo que no cupo en las preguntas: contexto, acuerdos, siguientes pasos." />
      </Card>

      <div className="flex items-center justify-end gap-3">
        <span className="mr-auto text-xs text-muted tabular-nums">
          {answered} de {ALL_QUESTIONS.length} preguntas contestadas
        </span>
        <Link href={initial.id !== null ? `/assessments/${initial.id}` : "/assessments"} className={buttonSecondaryClass}>
          Cancelar
        </Link>
        <SubmitButton>Guardar levantamiento</SubmitButton>
      </div>
    </form>
  );
}

function QuestionField({
  question: q,
  value,
  onChange,
}: {
  question: Question;
  value: string | string[] | undefined;
  onChange: (value: string | string[]) => void;
}) {
  const id = `q-${q.key}`;
  const text = typeof value === "string" ? value : "";
  const wide = q.type === "textarea" || q.type === "multi";

  return (
    <div className={cx(wide && "sm:col-span-2")}>
      {q.type === "multi" ? (
        <fieldset>
          <legend className={labelClass}>{q.label}</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {q.options.map((o) => {
              const selected = Array.isArray(value) ? value : [];
              return (
                <label key={o.value} className="flex items-center gap-2 text-sm text-fg">
                  <input
                    type="checkbox"
                    checked={selected.includes(o.value)}
                    onChange={(e) => onChange(e.target.checked ? [...selected, o.value] : selected.filter((v) => v !== o.value))}
                  />
                  {o.label}
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : (
        <>
          <label htmlFor={id} className={labelClass}>{q.label}</label>
          {q.type === "select" ? (
            <select id={id} className={inputClass} value={text} onChange={(e) => onChange(e.target.value)}>
              <option value="">Sin responder</option>
              {q.options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          ) : q.type === "textarea" ? (
            <textarea id={id} rows={3} className={inputClass} value={text} maxLength={2000} onChange={(e) => onChange(e.target.value)} />
          ) : (
            <input
              id={id}
              type={q.type === "number" ? "number" : q.type === "date" ? "date" : "text"}
              min={q.type === "number" ? 0 : undefined}
              step={q.type === "number" ? "any" : undefined}
              className={inputClass}
              value={text}
              maxLength={q.type === "text" ? 200 : undefined}
              onChange={(e) => onChange(e.target.value)}
            />
          )}
        </>
      )}
      {q.help ? <p className="mt-1.5 text-xs text-muted">{q.help}</p> : null}
    </div>
  );
}
