"use client";

import { useActionState } from "react";
import { FieldError, FormAlert } from "@/components/form-feedback";
import { SubmitButton } from "@/components/submit-button";
import { inputClass, labelClass } from "@/components/ui";
import type { ActionState } from "@/lib/action-result";
import { acceptInvitation } from "./actions";

export function InviteForm({ token }: { token: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(acceptInvitation, null);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <form action={formAction} className="space-y-4">
      <FormAlert state={state} />
      <input type="hidden" name="token" value={token} />
      <div>
        <label htmlFor="invite-password" className={labelClass}>
          Contraseña
        </label>
        <input
          id="invite-password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={inputClass}
        />
        <FieldError errors={errors.password} />
      </div>
      <div>
        <label htmlFor="invite-confirm" className={labelClass}>
          Confirmar contraseña
        </label>
        <input
          id="invite-confirm"
          name="confirm"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={inputClass}
        />
        <FieldError errors={errors.confirm} />
      </div>
      <SubmitButton className="w-full">Activar mi cuenta</SubmitButton>
    </form>
  );
}
