"use client";

import { useActionState } from "react";
import { createCategory, toggleCategory } from "@/app/(app)/knowledge/actions";
import { FieldError, FormAlert } from "@/components/form-feedback";
import { SubmitButton } from "@/components/submit-button";
import { Badge, buttonSecondaryClass, cx, inputClass, labelClass } from "@/components/ui";
import type { ActionState } from "@/lib/action-result";
import { useLocale } from "@/components/locale-provider";
import { t } from "@/lib/i18n";

export function CategoryForm() {
  const locale = useLocale();
  const [state, formAction] = useActionState<ActionState, FormData>(createCategory, null);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  return (
    <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto_auto]">
      <FormAlert state={state} />
      <div>
        <label className={labelClass}>{t("Nombre", "Name", locale)}</label>
        <input name="name" required className={inputClass} />
        <FieldError errors={errors.name} />
      </div>
      <div>
        <label className={labelClass}>{t("Descripción (opcional)", "Description (optional)", locale)}</label>
        <input name="description" className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>{t("Color", "Color", locale)}</label>
        <input name="color" type="color" defaultValue="#7c3aed" className="h-9 w-12 cursor-pointer rounded-lg border border-edge bg-surface p-1" />
      </div>
      <div className="flex items-end">
        <SubmitButton className="h-9">{t("Agregar", "Add", locale)}</SubmitButton>
      </div>
    </form>
  );
}

export function CategoryRow({
  category,
}: {
  category: { id: number; name: string; description: string | null; color: string | null; isActive: boolean };
}) {
  const locale = useLocale();
  const [state, formAction] = useActionState<ActionState, FormData>(toggleCategory, null);
  return (
    <li className={cx("flex items-center justify-between gap-3 px-5 py-3", !category.isActive && "opacity-60")}>
      <span className="flex items-center gap-2">
        {category.color ? (
          <span className="size-3 rounded-full" style={{ backgroundColor: category.color }} aria-hidden />
        ) : null}
        <span className="text-sm font-medium text-fg">{category.name}</span>
        {category.description ? <span className="text-sm text-muted">— {category.description}</span> : null}
        {!category.isActive ? <Badge tone="slate">{t("Archivada", "Archived", locale)}</Badge> : null}
      </span>
      <form action={formAction}>
        <input type="hidden" name="id" value={category.id} />
        <button type="submit" className={cx(buttonSecondaryClass, "h-7 px-2 text-xs")}>
          {category.isActive ? t("Archivar", "Archive", locale) : t("Restaurar", "Restore", locale)}
        </button>
        {state && !state.ok ? <span className="ml-2 text-xs text-danger">{state.message}</span> : null}
      </form>
    </li>
  );
}
