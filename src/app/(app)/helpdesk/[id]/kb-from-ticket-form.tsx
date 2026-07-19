"use client";

import { useActionState, useState } from "react";
import { createArticleFromTicket } from "@/app/(app)/knowledge/actions";
import { FieldError, FormAlert } from "@/components/form-feedback";
import { SubmitButton } from "@/components/submit-button";
import { buttonSecondaryClass, inputClass, labelClass } from "@/components/ui";
import type { ActionState } from "@/lib/action-result";

export function CreateKbArticleForm({
  ticketId,
  defaultTitle,
  defaultProblem,
  defaultSolution,
  defaultCategory,
}: {
  ticketId: number;
  defaultTitle: string;
  defaultProblem: string | null;
  defaultSolution: string | null;
  defaultCategory: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ActionState, FormData>(createArticleFromTicket, null);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={buttonSecondaryClass}>
        Crear artículo de conocimiento
      </button>
    );
  }

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-dashed border-edge-strong p-4">
      <FormAlert state={state} />
      <input type="hidden" name="ticketId" value={ticketId} />
      <div>
        <label className={labelClass}>Título</label>
        <input name="title" required defaultValue={defaultTitle} className={inputClass} />
        <FieldError errors={errors.title} />
      </div>
      <div>
        <label className={labelClass}>Problema</label>
        <textarea name="problem" rows={2} defaultValue={defaultProblem ?? ""} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Causa</label>
        <textarea name="cause" rows={2} className={inputClass} placeholder="¿Qué la originó?" />
      </div>
      <div>
        <label className={labelClass}>Solución</label>
        <textarea name="solution" rows={4} defaultValue={defaultSolution ?? ""} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Pasos (uno por línea, opcional)</label>
        <textarea name="steps" rows={3} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Notas (opcional)</label>
        <textarea name="notes" rows={2} className={inputClass} />
      </div>
      <input type="hidden" name="categoryId" value="" />
      {defaultCategory ? <p className="text-xs text-faint">Categoría del ticket: {defaultCategory} (asigna una categoría de KB al editar el artículo).</p> : null}
      <label className="flex items-center gap-2 text-sm text-fg">
        <input type="checkbox" name="anonymize" value="true" className="size-4" />
        Anonimizar nombre del cliente y contacto
      </label>
      <p className="text-xs text-muted">
        Nunca se incluyen notas internas, datos de cobro ni secretos — solo problema/causa/solución/pasos/notas que escribas aquí. Se crea como <strong>borrador</strong>, nunca se publica automáticamente.
      </p>
      <div className="flex gap-2">
        <SubmitButton>Crear borrador</SubmitButton>
        <button type="button" onClick={() => setOpen(false)} className={buttonSecondaryClass}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
