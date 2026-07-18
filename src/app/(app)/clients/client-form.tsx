"use client";

import { useActionState } from "react";
import { inputClass, labelClass } from "@/components/ui";
import { FieldError, FormAlert } from "@/components/form-feedback";
import { SubmitButton } from "@/components/submit-button";
import type { ActionState } from "@/lib/action-result";
import { createClient } from "./actions";

type FieldName = "name" | "contactName" | "email" | "phone" | "notes";

/** Quick-add form used from the clients list — full profile editing lives in Client 360. */
export function ClientForm({ submitLabel }: { submitLabel: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(createClient, null);

  const failed = state && !state.ok ? state : null;
  const errors = failed?.fieldErrors ?? {};
  const value = (name: FieldName) => failed?.values?.[name] ?? "";

  const field = (name: FieldName) => ({
    id: name,
    name,
    defaultValue: value(name),
    className: inputClass,
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? `${name}-error` : undefined,
  });

  return (
    <form action={formAction} className="space-y-4">
      <FormAlert state={state} />
      <div>
        <label htmlFor="name" className={labelClass}>
          Company name
        </label>
        <input required {...field("name")} />
        <FieldError id="name-error" errors={errors.name} />
      </div>
      <div>
        <label htmlFor="contactName" className={labelClass}>
          Contact person
        </label>
        <input {...field("contactName")} />
        <FieldError id="contactName-error" errors={errors.contactName} />
      </div>
      <div>
        <label htmlFor="email" className={labelClass}>
          Email
        </label>
        <input type="email" {...field("email")} />
        <FieldError id="email-error" errors={errors.email} />
      </div>
      <div>
        <label htmlFor="phone" className={labelClass}>
          Phone
        </label>
        <input {...field("phone")} />
        <FieldError id="phone-error" errors={errors.phone} />
      </div>
      <div>
        <label htmlFor="notes" className={labelClass}>
          Notes
        </label>
        <textarea rows={3} {...field("notes")} />
        <FieldError id="notes-error" errors={errors.notes} />
      </div>
      <SubmitButton>{submitLabel}</SubmitButton>
    </form>
  );
}
