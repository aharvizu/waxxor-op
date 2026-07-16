"use client";

import { useActionState } from "react";
import { inputClass, labelClass } from "@/components/ui";
import { FieldError, FormAlert } from "@/components/form-feedback";
import { SubmitButton } from "@/components/submit-button";
import type { ActionState } from "@/lib/action-result";
import { createClient, updateClient } from "./actions";

type ClientDefaults = {
  id: number;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
};

type FieldName = keyof Omit<ClientDefaults, "id">;

/** Create form when `client` is omitted; edit form when it is provided. */
export function ClientForm({
  client,
  submitLabel,
}: {
  client?: ClientDefaults;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    client ? updateClient : createClient,
    null,
  );

  const failed = state && !state.ok ? state : null;
  const errors = failed?.fieldErrors ?? {};
  // After a failed submit, echo what the user typed; otherwise show saved data.
  const value = (name: FieldName) => failed?.values?.[name] ?? client?.[name] ?? "";

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
      {client ? <input type="hidden" name="id" value={client.id} /> : null}
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
        <textarea rows={client ? 4 : 3} {...field("notes")} />
        <FieldError id="notes-error" errors={errors.notes} />
      </div>
      <SubmitButton>{submitLabel}</SubmitButton>
    </form>
  );
}
