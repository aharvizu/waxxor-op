"use client";

import { Fragment, useActionState, useEffect, useId, useState } from "react";
import Link from "next/link";
import * as Popover from "@radix-ui/react-popover";
import { AlertTriangle, Pencil, Plus, X } from "lucide-react";
import {
  Badge,
  buttonClass,
  buttonGhostClass,
  buttonSecondaryClass,
  Card,
  cx,
  inputClass,
  labelClass,
  THead,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { FieldError, FormAlert } from "@/components/form-feedback";
import { Modal } from "@/components/modal";
import { SearchableSelect } from "@/components/searchable-select";
import { SubmitButton } from "@/components/submit-button";
import type { ActionState } from "@/lib/action-result";
import { fmtDate, fmtMoney } from "@/lib/format";
import {
  CLIENT_STATUSES,
  CONTACT_TYPES,
  CLIENT_SERVICE_TYPES,
  CONTRACT_STATUSES,
  CONTRACT_TYPES,
  SUPPORT_COVERAGES,
  type ClientAlert,
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

function useForm(action: Action, defaults?: Record<string, unknown>, onSuccess?: () => void) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, null);
  useEffect(() => {
    if (state?.ok) onSuccess?.();
  }, [state, onSuccess]);
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
    <SearchableSelect
      id={name}
      name={name}
      defaultValue={value(name)}
      options={[
        ...(allowEmpty !== undefined ? [{ value: "", label: allowEmpty }] : []),
        ...options,
      ]}
    />
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

/**
 * Compact bell instead of an always-expanded list of banners (was pushing
 * the whole page down and never went away, since these are recomputed live
 * from real data — not stored events — so a plain click-to-navigate never
 * "cleared" them). Dismiss is per-session (component stays mounted across
 * `?tab=` navigations on this page): clicking a row — or its × — hides it
 * here without pretending the underlying condition was resolved. Reappears
 * on a fresh visit if it's still true, same as before (2026-07-28).
 */
export function CompanyAlerts({ alerts }: { alerts: ClientAlert[] }) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const visible = alerts.filter((a) => !dismissed.has(a.key));
  const dismiss = (key: string) => setDismissed((prev) => new Set(prev).add(key));

  if (visible.length === 0) return null;
  const highCount = visible.filter((a) => a.severity === "high").length;

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cx(
            buttonSecondaryClass,
            "mb-6 h-9 gap-1.5",
            highCount > 0
              ? "border-red-600/30 text-red-700 dark:text-red-300"
              : "border-amber-600/30 text-amber-700 dark:text-amber-300",
          )}
        >
          <AlertTriangle className="size-4" />
          {visible.length} {visible.length === 1 ? "alerta" : "alertas"}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={8}
          avoidCollisions
          className="z-20 w-96 max-w-[calc(100vw-2rem)] max-h-[min(28rem,80vh)] overflow-y-auto rounded-xl border border-edge bg-surface p-2 shadow-overlay outline-none"
        >
          <ul className="space-y-1">
            {visible.map((a) => (
              <li key={a.key} className="flex items-start gap-1">
                <Link
                  href={a.href}
                  onClick={() => dismiss(a.key)}
                  className={cx(
                    "flex-1 rounded-lg border px-3 py-2 text-sm transition-colors",
                    a.severity === "high"
                      ? "border-red-600/20 bg-red-50 text-red-800 hover:bg-red-100 dark:bg-red-400/10 dark:text-red-300"
                      : a.severity === "medium"
                        ? "border-amber-600/20 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:bg-amber-400/10 dark:text-amber-300"
                        : "border-edge bg-subtle text-muted hover:bg-subtle/70",
                  )}
                >
                  <span className="block font-medium">{a.title}</span>
                  <span className="block text-xs opacity-80">{a.detail}</span>
                </Link>
                <button
                  type="button"
                  aria-label="Descartar alerta"
                  onClick={() => dismiss(a.key)}
                  className="mt-0.5 shrink-0 rounded-md p-1.5 text-faint transition-colors hover:bg-subtle hover:text-fg"
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
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
  onSuccess,
}: {
  companyId: number;
  contact?: ContactDefaults;
  onSuccess?: () => void;
}) {
  const { state, formAction, errors, value } = useForm(
    contact ? updateContact : createContact,
    contact,
    onSuccess,
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

/** Short trigger + modal — editing lives on the contact's own page (`/contacts/[id]`), not here. */
export function AddContactButton({ companyId }: { companyId: number }) {
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
        description="Un nuevo contacto de esta empresa."
      >
        <ContactForm companyId={companyId} onSuccess={() => setOpen(false)} />
      </Modal>
    </>
  );
}

/* --------------------------------------------------------- client service */

export type ServiceCatalogEntry = { id: number; name: string; variants: { id: number; name: string }[] };

export type ClientServiceDefaults = {
  id: number;
  serviceId: number;
  variantId: number | null;
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
  onSuccess,
}: {
  companyId: number;
  servicesCatalog: ServiceCatalogEntry[];
  clientService?: ClientServiceDefaults;
  onSuccess?: () => void;
}) {
  const { state, formAction, errors, value } = useForm(
    clientService ? updateClientService : addClientService,
    clientService,
    onSuccess,
  );
  const [serviceId, setServiceId] = useState(value("serviceId"));
  const variants = servicesCatalog.find((s) => String(s.id) === serviceId)?.variants ?? [];
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="companyId" value={companyId} />
      {clientService ? <input type="hidden" name="id" value={clientService.id} /> : null}
      <FormAlert state={state} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Servicio del catálogo" name="serviceId" errors={errors}>
          <SearchableSelect
            name="serviceId"
            value={serviceId}
            onValueChange={setServiceId}
            options={[{ value: "", label: "— Selecciona —" }, ...servicesCatalog.map((s) => ({ value: String(s.id), label: s.name }))]}
          />
        </Field>
        <Field label="Variante (opcional)" name="variantId" errors={errors}>
          <SearchableSelect
            key={serviceId}
            name="variantId"
            defaultValue={value("variantId")}
            options={[
              { value: "", label: variants.length > 0 ? "— Ninguna —" : "Este servicio no tiene variantes" },
              ...variants.map((v) => ({ value: String(v.id), label: v.name })),
            ]}
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
        {/* Opcional a propósito: licenciamientos/renovaciones no siempre tienen tarifa fija. */}
        <Field label="Costo interno (opcional)" name="cost" errors={errors}>
          <TextInput name="cost" value={value} errors={errors} />
        </Field>
        <Field label="Precio al cliente (opcional)" name="clientPrice" errors={errors}>
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

/** Short trigger + modal. The Services/Variants catalog itself is managed in Configuración → Empresas (2026-08-03) — this only picks from it. */
export function AddServiceButton({
  companyId,
  servicesCatalog,
}: {
  companyId: number;
  servicesCatalog: ServiceCatalogEntry[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClass}>
        <Plus className="size-4" />
        Contratar servicio
      </button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Contratar servicio"
        description="Servicio administrado, licenciamiento o renovación para esta empresa."
      >
        {servicesCatalog.length === 0 ? (
          <p className="text-sm text-muted">
            Aún no hay servicios en el catálogo de la organización.{" "}
            <Link href="/settings/companies" className="text-primary hover:underline">
              Créalos en Configuración → Empresas
            </Link>
            .
          </p>
        ) : (
          <ClientServiceForm
            companyId={companyId}
            servicesCatalog={servicesCatalog}
            onSuccess={() => setOpen(false)}
          />
        )}
      </Modal>
    </>
  );
}

export type ServiceListRow = {
  cs: ClientServiceDefaults;
  serviceName: string;
  variantName: string | null;
  derivedStatus: "active" | "expiring" | "expired" | "cancelled" | "archived";
};

/** Row-level edit via a Pencil icon — the edit form expands inline, right below its own row. */
export function ServicesTable({
  companyId,
  servicesCatalog,
  rows,
}: {
  companyId: number;
  servicesCatalog: ServiceCatalogEntry[];
  rows: ServiceListRow[];
}) {
  const [editingId, setEditingId] = useState<number | null>(null);
  return (
    <Card className="overflow-visible">
      <Table>
        <THead>
          <tr>
            <Th>Servicio</Th>
            <Th>Tipo</Th>
            <Th>Estado</Th>
            <Th>Cobertura</Th>
            <Th>Proveedor</Th>
            <Th>Precio</Th>
            <Th>Renovación</Th>
            <Th>Acciones</Th>
          </tr>
        </THead>
        <tbody className="divide-y divide-edge">
          {rows.map(({ cs, serviceName, variantName, derivedStatus }) => (
            <Fragment key={cs.id}>
              <tr>
                <Td className="font-medium text-fg">
                  {serviceName}
                  {variantName ? <span className="ml-1.5 font-normal text-muted">· {variantName}</span> : null}
                </Td>
                <Td>
                  <Badge tone={clientServiceTypeMeta[cs.serviceType]?.tone ?? "slate"}>
                    {clientServiceTypeMeta[cs.serviceType]?.label ?? cs.serviceType}
                  </Badge>
                </Td>
                <Td>
                  <Badge tone={clientServiceStatusMeta[derivedStatus]?.tone ?? "slate"}>
                    {clientServiceStatusMeta[derivedStatus]?.label ?? derivedStatus}
                  </Badge>
                </Td>
                <Td>
                  <Badge tone={supportCoverageMeta[cs.supportCoverage]?.tone ?? "slate"}>
                    {supportCoverageMeta[cs.supportCoverage]?.label ?? cs.supportCoverage}
                  </Badge>
                </Td>
                <Td className="text-muted">{cs.provider ?? "—"}</Td>
                <Td className="tabular-nums text-muted">{cs.clientPrice ? fmtMoney(cs.clientPrice) : "—"}</Td>
                <Td className="text-muted">{cs.renewalDate ? fmtDate(cs.renewalDate) : "—"}</Td>
                <Td>
                  <button
                    type="button"
                    aria-label="Editar servicio"
                    onClick={() => setEditingId((id) => (id === cs.id ? null : cs.id))}
                    className={cx(
                      "flex size-7 items-center justify-center rounded-md transition-colors",
                      editingId === cs.id ? "bg-primary-soft text-primary" : "text-faint hover:bg-subtle hover:text-fg",
                    )}
                  >
                    <Pencil className="size-3.5" />
                  </button>
                </Td>
              </tr>
              {editingId === cs.id ? (
                <tr>
                  <td colSpan={8} className="border-t border-edge bg-subtle/40 p-4">
                    <ClientServiceForm
                      companyId={companyId}
                      servicesCatalog={servicesCatalog}
                      clientService={cs}
                      onSuccess={() => setEditingId(null)}
                    />
                  </td>
                </tr>
              ) : null}
            </Fragment>
          ))}
        </tbody>
      </Table>
    </Card>
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
