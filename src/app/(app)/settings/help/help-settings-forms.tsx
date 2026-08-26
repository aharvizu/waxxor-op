"use client";

import { useActionState } from "react";
import { buttonSecondaryClass, cx } from "@/components/ui";
import type { ActionState } from "@/lib/action-result";
import { useLocale } from "@/components/locale-provider";
import { t } from "@/lib/i18n";
import { toggleTutorialActive } from "./actions";

export function ToggleTutorialButton({ id, isActive }: { id: number; isActive: boolean }) {
  const locale = useLocale();
  const [state, formAction] = useActionState<ActionState, FormData>(toggleTutorialActive, null);
  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <button type="submit" className={cx(buttonSecondaryClass, "h-7 px-2 text-xs")}>
        {isActive ? t("Desactivar", "Deactivate", locale) : t("Activar", "Activate", locale)}
      </button>
      {state && !state.ok ? <span className="text-xs text-danger">{state.message}</span> : null}
    </form>
  );
}
