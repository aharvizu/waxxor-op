"use client";

import { useActionState, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { buttonClass, inputClass, labelClass } from "@/components/ui";
import { FieldError, FormAlert } from "@/components/form-feedback";
import { Modal } from "@/components/modal";
import { SubmitButton } from "@/components/submit-button";
import type { ActionState } from "@/lib/action-result";
import { createClient } from "./actions";

type FieldName = "name" | "contactName" | "email" | "phone" | "notes";

/** Quick-add form used from the companies list — full profile editing lives in Client 360. */
export function CompanyForm({
  submitLabel,
  onSuccess,
}: {
  submitLabel: string;
  onSuccess?: () => void;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(createClient, null);

  useEffect(() => {
    if (state?.ok) onSuccess?.();
  }, [state, onSuccess]);

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

/** Trigger + modal used next to the search bar on /companies. */
export function NewCompanyButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClass}>
        <Plus className="size-4" />
        Agregar empresa
      </button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Agregar empresa"
        description="Una nueva cuenta de cliente."
      >
        <CompanyForm submitLabel="Agregar empresa" onSuccess={() => setOpen(false)} />
      </Modal>
    </>
  );
}
