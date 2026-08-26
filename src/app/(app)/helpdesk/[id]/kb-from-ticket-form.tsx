"use client";

import { useActionState, useState } from "react";
import { createArticleFromTicket } from "@/app/(app)/knowledge/actions";
import { FieldError, FormAlert } from "@/components/form-feedback";
import { SubmitButton } from "@/components/submit-button";
import { buttonSecondaryClass, inputClass, labelClass } from "@/components/ui";
import type { ActionState } from "@/lib/action-result";
import { useLocale } from "@/components/locale-provider";
import { t } from "@/lib/i18n";

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
  const locale = useLocale();

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={buttonSecondaryClass}>
        {t("Crear artículo de conocimiento", "Create knowledge article", locale)}
      </button>
    );
  }

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-dashed border-edge-strong p-4">
      <FormAlert state={state} />
      <input type="hidden" name="ticketId" value={ticketId} />
      <div>
        <label className={labelClass}>{t("Título", "Title", locale)}</label>
        <input name="title" required defaultValue={defaultTitle} className={inputClass} />
        <FieldError errors={errors.title} />
      </div>
      <div>
        <label className={labelClass}>{t("Problema", "Problem", locale)}</label>
        <textarea name="problem" rows={2} defaultValue={defaultProblem ?? ""} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>{t("Causa", "Cause", locale)}</label>
        <textarea name="cause" rows={2} className={inputClass} placeholder={t("¿Qué la originó?", "What caused it?", locale)} />
      </div>
      <div>
        <label className={labelClass}>{t("Solución", "Solution", locale)}</label>
        <textarea name="solution" rows={4} defaultValue={defaultSolution ?? ""} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>{t("Pasos (uno por línea, opcional)", "Steps (one per line, optional)", locale)}</label>
        <textarea name="steps" rows={3} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>{t("Notas (opcional)", "Notes (optional)", locale)}</label>
        <textarea name="notes" rows={2} className={inputClass} />
      </div>
      <input type="hidden" name="categoryId" value="" />
      {defaultCategory ? (
        <p className="text-xs text-faint">
          {t(
            `Categoría del ticket: ${defaultCategory} (asigna una categoría de KB al editar el artículo).`,
            `Ticket category: ${defaultCategory} (assign a KB category when editing the article).`,
            locale,
          )}
        </p>
      ) : null}
      <label className="flex items-center gap-2 text-sm text-fg">
        <input type="checkbox" name="anonymize" value="true" className="size-4" />
        {t("Anonimizar nombre del cliente y contacto", "Anonymize client and contact name", locale)}
      </label>
      <p className="text-xs text-muted">
        {t(
          "Nunca se incluyen notas internas, datos de cobro ni secretos — solo problema/causa/solución/pasos/notas que escribas aquí. Se crea como",
          "Internal notes, billing data, and secrets are never included — only the problem/cause/solution/steps/notes you write here. It's created as a",
          locale,
        )}{" "}
        <strong>{t("borrador", "draft", locale)}</strong>
        {t(", nunca se publica automáticamente.", ", never published automatically.", locale)}
      </p>
      <div className="flex gap-2">
        <SubmitButton>{t("Crear borrador", "Create draft", locale)}</SubmitButton>
        <button type="button" onClick={() => setOpen(false)} className={buttonSecondaryClass}>
          {t("Cancelar", "Cancel", locale)}
        </button>
      </div>
    </form>
  );
}
