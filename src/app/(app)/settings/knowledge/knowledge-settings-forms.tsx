"use client";

import { useActionState } from "react";
import { createCategory, toggleCategory } from "@/app/(app)/knowledge/actions";
import { FieldError, FormAlert } from "@/components/form-feedback";
import { SubmitButton } from "@/components/submit-button";
import { Badge, buttonSecondaryClass, cx, inputClass, labelClass } from "@/components/ui";
import type { ActionState } from "@/lib/action-result";

export function CategoryForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(createCategory, null);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  return (
    <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto_auto]">
      <FormAlert state={state} />
      <div>
        <label className={labelClass}>Nombre</label>
        <input name="name" required className={inputClass} />
        <FieldError errors={errors.name} />
      </div>
      <div>
        <label className={labelClass}>Descripción (opcional)</label>
        <input name="description" className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Color</label>
        <input name="color" type="color" defaultValue="#7c3aed" className="h-9 w-12 cursor-pointer rounded-lg border border-edge bg-surface p-1" />
      </div>
      <div className="flex items-end">
        <SubmitButton className="h-9">Agregar</SubmitButton>
      </div>
    </form>
  );
}

export function CategoryRow({
  category,
}: {
  category: { id: number; name: string; description: string | null; color: string | null; isActive: boolean };
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(toggleCategory, null);
  return (
    <li className={cx("flex items-center justify-between gap-3 px-5 py-3", !category.isActive && "opacity-60")}>
      <span className="flex items-center gap-2">
        {category.color ? (
          <span className="size-3 rounded-full" style={{ backgroundColor: category.color }} aria-hidden />
        ) : null}
        <span className="text-sm font-medium text-fg">{category.name}</span>
        {category.description ? <span className="text-sm text-muted">— {category.description}</span> : null}
        {!category.isActive ? <Badge tone="slate">Archivada</Badge> : null}
      </span>
      <form action={formAction}>
        <input type="hidden" name="id" value={category.id} />
        <button type="submit" className={cx(buttonSecondaryClass, "h-7 px-2 text-xs")}>
          {category.isActive ? "Archivar" : "Restaurar"}
        </button>
        {state && !state.ok ? <span className="ml-2 text-xs text-danger">{state.message}</span> : null}
      </form>
    </li>
  );
}
