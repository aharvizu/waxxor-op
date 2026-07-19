"use client";

import { useActionState, useId } from "react";
import { buttonGhostClass, buttonSecondaryClass, cx, inputClass, labelClass } from "@/components/ui";
import { FieldError, FormAlert } from "@/components/form-feedback";
import { SubmitButton } from "@/components/submit-button";
import type { ActionState } from "@/lib/action-result";
import {
  CLIENT_STATUSES,
  CONTACT_TYPES,
  CLIENT_SERVICE_TYPES,
  CONTRACT_STATUSES,
  CONTRACT_TYPES,
  SERVICE_CATEGORIES,
  SUPPORT_COVERAGES,
} from "@/lib/company360";
import {
  clientServiceStatusMeta,
  clientServiceTypeMeta,
  companyStatusMeta,
  contactTypeMeta,
  contractStatusMeta,
  contractTypeMeta,
  supportCoverageMeta,
} from "@/lib/labels";
import {
  addClientNote,
  addClientService,
  createContact,
  createContract,
  createService,
  deleteClient,
  deleteContact,
  deleteContract,
  editOwnClientNote,
  setPrimaryContact,
  toggleContactActive,
  updateClientProfile,
  updateClientService,
  updateContact,
  updateContract,
  updateRenewal,
} from "./company360-actions";

type Option = { id: number; name: string };
type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/* ----------------------------------------------------------- primitives */

function useForm(action: Action, defaults?: Record<string, unknown>) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, null);
  const failed = state && !state.ok ? state : null;
  const errors = failed?.fieldErrors ?? {};
  const value = (name: string) => {
    const v = failed?.values?.[name] ?? defaults?.[name];
    return v === null || v === undefined ? "" : String(v);
  };
  return { state, formAction, errors, value };
}

function Field({
  label,
  name,
  errors,
  children,
}: {
  label: string;
  name: string;
  errors: Record<string, string[]>;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={name} className={labelClass}>
        {label}
      </label>
      {children}
      <FieldError id={`${name}-error`} errors={errors[name]} />
    </div>
  );
}

function TextInput({
  name,
  value,
  errors,
  type = "text",
  required,
}: {
  name: string;
  value: (n: string) => string;
  errors: Record<string, string[]>;
  type?: string;
  required?: boolean;
}) {
  return (
    <input
      id={name}
      name={name}
      type={type}
      required={required}
      defaultValue={value(name)}
      className={inputClass}
      aria-invalid={errors[name] ? true : undefined}
    />
  );
}

function SelectInput({
  name,
  value,
  options,
  allowEmpty,
}: {
  name: string;
  value: (n: string) => string;
  options: { value: string; label: string }[];
  allowEmpty?: string;
}) {
  return (
    <select id={name} name={name} defaultValue={value(name)} className={inputClass}>
      {allowEmpty !== undefined ? <option value="">{allowEmpty}</option> : null}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

const metaOptions = (values: readonly string[], meta: Record<string, { label: string }>) =>
  values.map((v) => ({ value: v, label: meta[v]?.label ?? v }));

/** Small inline form for row actions (set primary, archive, delete…). */
export function RowAction({
  action,
  fields,
  label,
  confirm,
  danger,
}: {
  action:
    | "setPrimaryContact"
    | "toggleContactActive"
    | "deleteContact"
    | "deleteContract"
    | "deleteClient";
  fields: Record<string, string | number>;
  label: string;
  confirm?: string;
  danger?: boolean;
}) {
  const actions: Record<string, Action> = {
    setPrimaryContact,
    toggleContactActive,
    deleteContact,
    deleteContract,
    deleteClient,
  };
  const [state, formAction] = useActionState<ActionState, FormData>(actions[action], null);
  return (
    <form
      action={formAction}
      className="inline"
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <button
        type="submit"
        className={cx(
          "rounded-md px-2 py-1 text-xs font-medium transition-colors",
          danger ? "text-danger hover:bg-danger-soft" : "text-muted hover:bg-subtle hover:text-fg",
        )}
      >
        {label}
      </button>
      {state && !state.ok ? (
        <span className="ml-2 text-xs text-danger">{state.message}</span>
      ) : null}
    </form>
  );
}

/** <details> disclosure so creation forms behave like a lightweight drawer. */
export function Disclosure({ label, children }: { label: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <details className="group rounded-lg border border-edge" id={id}>
      <summary className={cx(buttonSecondaryClass, "cursor-pointer list-none border-0 select-none")}>
        {label}
      </summary>
      <div className="border-t border-edge p-4">{children}</div>
    </details>
  );
}

/* --------------------------------------------------------- client profile */

export type ClientProfileDefaults = {
  id: number;
  name: string;
  legalName: string | null;
  ownerName: string | null;
  industry: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  status: string;
  accountOwnerId: number | null;
  defaultTechnicianId: number | null;
  notes: string | null;
};

export function CompanyProfileForm({
  client,
  internalUsers,
}: {
  client: ClientProfileDefaults;
  internalUsers: Option[];
}) {
  const { state, formAction, errors, value } = useForm(updateClientProfile, client);
  const userOptions = internalUsers.map((u) => ({ value: String(u.id), label: u.name }));
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={client.id} />
      <FormAlert state={state} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Nombre comercial" name="name" errors={errors}>
          <TextInput name="name" value={value} errors={errors} required />
        </Field>
        <Field label="Razón social" name="legalName" errors={errors}>
          <TextInput name="legalName" value={value} errors={errors} />
        </Field>
        <Field label="Dueño / responsable del negocio" name="ownerName" errors={errors}>
          <TextInput name="ownerName" value={value} errors={errors} />
        </Field>
        <Field label="Industria" name="industry" errors={errors}>
          <TextInput name="industry" value={value} errors={errors} />
        </Field>
        <Field label="Sitio web" name="website" errors={errors}>
          <TextInput name="website" value={value} errors={errors} />
        </Field>
        <Field label="Estado" name="status" errors={errors}>
          <SelectInput name="status" value={value} options={metaOptions(CLIENT_STATUSES, companyStatusMeta)} />
        </Field>
        <Field label="Email" name="email" errors={errors}>
          <TextInput name="email" value={value} errors={errors} type="email" />
        </Field>
        <Field label="Teléfono" name="phone" errors={errors}>
          <TextInput name="phone" value={value} errors={errors} />
        </Field>
        <Field label="Dirección" name="address" errors={errors}>
          <TextInput name="address" value={value} errors={errors} />
        </Field>
        <Field label="Ciudad" name="city" errors={errors}>
          <TextInput name="city" value={value} errors={errors} />
        </Field>
        <Field label="Estado / provincia" name="state" errors={errors}>
          <TextInput name="state" value={value} errors={errors} />
        </Field>
        <Field label="País" name="country" errors={errors}>
          <TextInput name="country" value={value} errors={errors} />
        </Field>
        <Field label="Responsable de cuenta" name="accountOwnerId" errors={errors}>
          <SelectInput name="accountOwnerId" value={value} options={userOptions} allowEmpty="— Sin asignar —" />
        </Field>
        <Field label="Técnico por defecto" name="defaultTechnicianId" errors={errors}>
          <SelectInput name="defaultTechnicianId" value={value} options={userOptions} allowEmpty="— Sin asignar —" />
        </Field>
      </div>
      <Field label="Notas generales" name="notes" errors={errors}>
        <textarea id="notes" name="notes" rows={3} defaultValue={value("notes")} className={inputClass} />
      </Field>
      <SubmitButton>Guardar cambios</SubmitButton>
    </form>
  );
}

/* --------------------------------------------------------------- contacts */

export type ContactDefaults = {
  id: number;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
  department: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  whatsappNumber: string | null;
  contactType: string;
  isPrimary: boolean;
  notes: string | null;
};

export function ContactForm({
  companyId,
  contact,
}: {
  companyId: number;
  contact?: ContactDefaults;
}) {
  const { state, formAction, errors, value } = useForm(
    contact ? updateContact : createContact,
    contact,
  );
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="companyId" value={companyId} />
      {contact ? <input type="hidden" name="id" value={contact.id} /> : null}
      <FormAlert state={state} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Nombre" name="firstName" errors={errors}>
          <TextInput name="firstName" value={value} errors={errors} required />
        </Field>
        <Field label="Apellido" name="lastName" errors={errors}>
          <TextInput name="lastName" value={value} errors={errors} required />
        </Field>
        <Field label="Puesto" name="jobTitle" errors={errors}>
          <TextInput name="jobTitle" value={value} errors={errors} />
        </Field>
        <Field label="Departamento" name="department" errors={errors}>
          <TextInput name="department" value={value} errors={errors} />
        </Field>
        <Field label="Tipo" name="contactType" errors={errors}>
          <SelectInput name="contactType" value={value} options={metaOptions(CONTACT_TYPES, contactTypeMeta)} />
        </Field>
        <Field label="Email" name="email" errors={errors}>
          <TextInput name="email" value={value} errors={errors} type="email" />
        </Field>
        <Field label="Teléfono" name="phone" errors={errors}>
          <TextInput name="phone" value={value} errors={errors} />
        </Field>
        <Field label="Celular" name="mobile" errors={errors}>
          <TextInput name="mobile" value={value} errors={errors} />
        </Field>
        <Field label="WhatsApp" name="whatsappNumber" errors={errors}>
          <TextInput name="whatsappNumber" value={value} errors={errors} />
        </Field>
      </div>
      <Field label="Notas" name="notes" errors={errors}>
        <textarea id="notes" name="notes" rows={2} defaultValue={value("notes")} className={inputClass} />
      </Field>
      <label className="flex items-center gap-2 text-sm text-fg">
        <input type="checkbox" name="isPrimary" defaultChecked={contact?.isPrimary ?? false} />
        Contacto principal
      </label>
      <SubmitButton>{contact ? "Guardar contacto" : "Agregar contacto"}</SubmitButton>
    </form>
  );
}

/* -------------------------------------------------------- service catalog */

export function ServiceCatalogForm() {
  const { state, formAction, errors, value } = useForm(createService);
  return (
    <form action={formAction} className="space-y-4">
      <FormAlert state={state} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Nombre del servicio" name="name" errors={errors}>
          <TextInput name="name" value={value} errors={errors} required />
        </Field>
        <Field label="Categoría" name="category" errors={errors}>
          <SelectInput
            name="category"
            value={value}
            options={SERVICE_CATEGORIES.map((c) => ({ value: c, label: c }))}
          />
        </Field>
        <Field label="Tarifa remota por defecto" name="defaultRemoteRate" errors={errors}>
          <TextInput name="defaultRemoteRate" value={value} errors={errors} />
        </Field>
        <Field label="Tarifa en sitio por defecto" name="defaultOnsiteRate" errors={errors}>
          <TextInput name="defaultOnsiteRate" value={value} errors={errors} />
        </Field>
      </div>
      <Field label="Descripción" name="description" errors={errors}>
        <textarea id="description" name="description" rows={2} defaultValue={value("description")} className={inputClass} />
      </Field>
      <Field label="Alcance (qué incluye / qué no)" name="scope" errors={errors}>
        <textarea id="scope" name="scope" rows={2} defaultValue={value("scope")} className={inputClass} />
      </Field>
      <label className="flex items-center gap-2 text-sm text-fg">
        <input type="checkbox" name="isRenewable" /> Es renovable
      </label>
      <SubmitButton>Agregar al catálogo</SubmitButton>
    </form>
  );
}

/* --------------------------------------------------------- client service */

export type ClientServiceDefaults = {
  id: number;
  serviceId: number;
  serviceType: string;
  status: string;
  quantity: number | null;
  provider: string | null;
  billingCycle: string | null;
  cost: string | null;
  clientPrice: string | null;
  startDate: string;
  endDate: string | null;
  renewalDate: string | null;
  supportCoverage: string;
  includedHours: number | null;
  notes: string | null;
};

export function ClientServiceForm({
  companyId,
  servicesCatalog,
  clientService,
  license,
}: {
  companyId: number;
  servicesCatalog: Option[];
  clientService?: ClientServiceDefaults;
  /** Preselect the license type for the "Agregar licenciamiento" entry point. */
  license?: boolean;
}) {
  const { state, formAction, errors, value } = useForm(
    clientService ? updateClientService : addClientService,
    clientService ?? (license ? { serviceType: "license" } : undefined),
  );
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="companyId" value={companyId} />
      {clientService ? <input type="hidden" name="id" value={clientService.id} /> : null}
      <FormAlert state={state} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Servicio del catálogo" name="serviceId" errors={errors}>
          <SelectInput
            name="serviceId"
            value={value}
            options={servicesCatalog.map((s) => ({ value: String(s.id), label: s.name }))}
            allowEmpty="— Selecciona —"
          />
        </Field>
        <Field label="Tipo" name="serviceType" errors={errors}>
          <SelectInput
            name="serviceType"
            value={value}
            options={metaOptions(CLIENT_SERVICE_TYPES, clientServiceTypeMeta)}
          />
        </Field>
        {clientService ? (
          <Field label="Estado" name="status" errors={errors}>
            <SelectInput
              name="status"
              value={value}
              options={metaOptions(["active", "cancelled", "archived"], clientServiceStatusMeta)}
            />
          </Field>
        ) : null}
        <Field label="Cantidad (licencias / unidades)" name="quantity" errors={errors}>
          <TextInput name="quantity" value={value} errors={errors} type="number" />
        </Field>
        <Field label="Proveedor" name="provider" errors={errors}>
          <TextInput name="provider" value={value} errors={errors} />
        </Field>
        <Field label="Ciclo de facturación" name="billingCycle" errors={errors}>
          <TextInput name="billingCycle" value={value} errors={errors} />
        </Field>
        <Field label="Costo (interno)" name="cost" errors={errors}>
          <TextInput name="cost" value={value} errors={errors} />
        </Field>
        <Field label="Precio al cliente" name="clientPrice" errors={errors}>
          <TextInput name="clientPrice" value={value} errors={errors} />
        </Field>
        <Field label="Inicio" name="startDate" errors={errors}>
          <TextInput name="startDate" value={value} errors={errors} type="date" required />
        </Field>
        <Field label="Fin" name="endDate" errors={errors}>
          <TextInput name="endDate" value={value} errors={errors} type="date" />
        </Field>
        <Field label="Fecha de renovación" name="renewalDate" errors={errors}>
          <TextInput name="renewalDate" value={value} errors={errors} type="date" />
        </Field>
        <Field label="Cobertura de soporte" name="supportCoverage" errors={errors}>
          <SelectInput
            name="supportCoverage"
            value={value}
            options={metaOptions(SUPPORT_COVERAGES, supportCoverageMeta)}
          />
        </Field>
        <Field label="Horas incluidas" name="includedHours" errors={errors}>
          <TextInput name="includedHours" value={value} errors={errors} type="number" />
        </Field>
      </div>
      <Field label="Notas / condiciones" name="notes" errors={errors}>
        <textarea id="notes" name="notes" rows={2} defaultValue={value("notes")} className={inputClass} />
      </Field>
      <SubmitButton>{clientService ? "Guardar servicio" : "Registrar servicio"}</SubmitButton>
    </form>
  );
}

/* ---------------------------------------------------------------- contract */

export type ContractDefaults = {
  id: number;
  name: string;
  contractType: string;
  status: string;
  startDate: string;
  endDate: string | null;
  autoRenew: boolean;
  includedHours: number | null;
  monthlyAmount: string | null;
  notes: string | null;
};

export function ContractForm({
  companyId,
  contract,
}: {
  companyId: number;
  contract?: ContractDefaults;
}) {
  const { state, formAction, errors, value } = useForm(
    contract ? updateContract : createContract,
    contract,
  );
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="companyId" value={companyId} />
      {contract ? <input type="hidden" name="id" value={contract.id} /> : null}
      <FormAlert state={state} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Nombre del contrato" name="name" errors={errors}>
          <TextInput name="name" value={value} errors={errors} required />
        </Field>
        <Field label="Tipo" name="contractType" errors={errors}>
          <SelectInput name="contractType" value={value} options={metaOptions(CONTRACT_TYPES, contractTypeMeta)} />
        </Field>
        <Field label="Estado" name="status" errors={errors}>
          <SelectInput name="status" value={value} options={metaOptions(CONTRACT_STATUSES, contractStatusMeta)} />
        </Field>
        <Field label="Monto mensual" name="monthlyAmount" errors={errors}>
          <TextInput name="monthlyAmount" value={value} errors={errors} />
        </Field>
        <Field label="Inicio" name="startDate" errors={errors}>
          <TextInput name="startDate" value={value} errors={errors} type="date" required />
        </Field>
        <Field label="Fin / renovación" name="endDate" errors={errors}>
          <TextInput name="endDate" value={value} errors={errors} type="date" />
        </Field>
        <Field label="Horas incluidas" name="includedHours" errors={errors}>
          <TextInput name="includedHours" value={value} errors={errors} type="number" />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-fg">
        <input type="checkbox" name="autoRenew" defaultChecked={contract?.autoRenew ?? false} />
        Renovación automática
      </label>
      <Field label="Notas / condiciones" name="notes" errors={errors}>
        <textarea id="notes" name="notes" rows={2} defaultValue={value("notes")} className={inputClass} />
      </Field>
      <SubmitButton>{contract ? "Guardar contrato" : "Registrar contrato"}</SubmitButton>
    </form>
  );
}

/* ---------------------------------------------------------------- renewals */

export function RenewalInlineForm({
  source,
  sourceId,
  companyId,
  currentDate,
}: {
  source: "client_service" | "contract";
  sourceId: number;
  companyId: number;
  currentDate: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(updateRenewal, null);
  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="source" value={source} />
      <input type="hidden" name="sourceId" value={sourceId} />
      <input type="hidden" name="companyId" value={companyId} />
      <input
        type="date"
        name="newDate"
        defaultValue={currentDate}
        className={cx(inputClass, "w-auto py-1 text-xs")}
        aria-label="Nueva fecha de renovación"
      />
      <button type="submit" className={cx(buttonGhostClass, "px-2 py-1 text-xs")}>
        Actualizar
      </button>
      {state && !state.ok ? <span className="text-xs text-danger">{state.message}</span> : null}
    </form>
  );
}

/* ------------------------------------------------------------------- notes */

export function NoteComposer({ companyId }: { companyId: number }) {
  const { state, formAction, errors, value } = useForm(addClientNote);
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="companyId" value={companyId} />
      <FormAlert state={state} />
      <Field label="Nueva nota" name="body" errors={errors}>
        <textarea
          id="body"
          name="body"
          rows={3}
          required
          defaultValue={value("body")}
          className={inputClass}
          placeholder="Acuerdos, contexto operativo, seguimiento…"
        />
      </Field>
      <SubmitButton>Agregar nota</SubmitButton>
    </form>
  );
}

export function NoteEditor({
  companyId,
  noteId,
  body,
}: {
  companyId: number;
  noteId: number;
  body: string;
}) {
  const { state, formAction, errors, value } = useForm(editOwnClientNote, { body });
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-xs text-muted hover:text-fg">Editar</summary>
      <form action={formAction} className="mt-2 space-y-2">
        <input type="hidden" name="companyId" value={companyId} />
        <input type="hidden" name="id" value={noteId} />
        <FormAlert state={state} />
        <textarea
          name="body"
          rows={3}
          required
          defaultValue={value("body")}
          className={inputClass}
          aria-label="Editar nota"
        />
        <FieldError id="body-error" errors={errors.body} />
        <SubmitButton>Guardar nota</SubmitButton>
      </form>
    </details>
  );
}
