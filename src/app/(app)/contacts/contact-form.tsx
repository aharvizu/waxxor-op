"use client";

import { useActionState, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { buttonClass, inputClass, labelClass } from "@/components/ui";
import { FieldError, FormAlert } from "@/components/form-feedback";
import { Modal } from "@/components/modal";
import { SearchableSelect } from "@/components/searchable-select";
import { SubmitButton } from "@/components/submit-button";
import type { ActionState } from "@/lib/action-result";
import { CONTACT_TYPES } from "@/lib/company360";
import { contactTypeMeta } from "@/lib/labels";
import { createContact } from "../companies/company360-actions";

/** Standalone contact creation form for /contacts — unlike the Company 360
 * variant (fixed companyId), this one lets the user pick the empresa
 * principal from a dropdown since there is no company context on this page. */
export function ContactCreateForm({
  companies,
  onSuccess,
}: {
  companies: { id: number; name: string }[];
  onSuccess?: () => void;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(createContact, null);

  useEffect(() => {
    if (state?.ok) onSuccess?.();
  }, [state, onSuccess]);

  const failed = state && !state.ok ? state : null;
  const errors = failed?.fieldErrors ?? {};
  const value = (name: string) => (failed?.values?.[name] ? String(failed.values[name]) : "");

  return (
    <form action={formAction} className="space-y-4">
      <FormAlert state={state} />
      <div>
        <label htmlFor="companyId" className={labelClass}>Empresa principal</label>
        <SearchableSelect
          id="companyId"
          name="companyId"
          defaultValue={value("companyId")}
          required
          options={[{ value: "", label: "Selecciona una empresa…" }, ...companies.map((c) => ({ value: String(c.id), label: c.name }))]}
        />
        <FieldError id="companyId-error" errors={errors.companyId} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="firstName" className={labelClass}>Nombre</label>
          <input id="firstName" name="firstName" defaultValue={value("firstName")} className={inputClass} required />
          <FieldError id="firstName-error" errors={errors.firstName} />
        </div>
        <div>
          <label htmlFor="lastName" className={labelClass}>Apellido</label>
          <input id="lastName" name="lastName" defaultValue={value("lastName")} className={inputClass} required />
          <FieldError id="lastName-error" errors={errors.lastName} />
        </div>
        <div>
          <label htmlFor="jobTitle" className={labelClass}>Puesto</label>
          <input id="jobTitle" name="jobTitle" defaultValue={value("jobTitle")} className={inputClass} />
        </div>
        <div>
          <label htmlFor="department" className={labelClass}>Departamento</label>
          <input id="department" name="department" defaultValue={value("department")} className={inputClass} />
        </div>
        <div>
          <label htmlFor="contactType" className={labelClass}>Tipo</label>
          <SearchableSelect
            id="contactType"
            name="contactType"
            defaultValue={value("contactType")}
            options={CONTACT_TYPES.map((t) => ({ value: t, label: contactTypeMeta[t]?.label ?? t }))}
          />
        </div>
        <div>
          <label htmlFor="email" className={labelClass}>Correo</label>
          <input id="email" name="email" type="email" defaultValue={value("email")} className={inputClass} />
        </div>
        <div>
          <label htmlFor="phone" className={labelClass}>Teléfono</label>
          <input id="phone" name="phone" defaultValue={value("phone")} className={inputClass} />
        </div>
        <div>
          <label htmlFor="mobile" className={labelClass}>Celular</label>
          <input id="mobile" name="mobile" defaultValue={value("mobile")} className={inputClass} />
        </div>
      </div>
      <div>
        <label htmlFor="notes" className={labelClass}>Notas</label>
        <textarea id="notes" name="notes" rows={2} defaultValue={value("notes")} className={inputClass} />
      </div>
      <SubmitButton>Agregar contacto</SubmitButton>
    </form>
  );
}

/** Trigger + modal used next to the search bar on /contacts. */
export function NewContactButton({ companies }: { companies: { id: number; name: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClass}>
        <Plus className="size-4" />
        Agregar contacto
      </button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Agregar contacto"
        description="Una nueva persona de contacto."
      >
        <ContactCreateForm companies={companies} onSuccess={() => setOpen(false)} />
      </Modal>
    </>
  );
}
