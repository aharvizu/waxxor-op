"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { Fragment } from "react";
import { buttonClass, Card, cx, inputClass, labelClass, THead, Table, Td, Th } from "@/components/ui";
import { FieldError, FormAlert } from "@/components/form-feedback";
import { Modal } from "@/components/modal";
import { SearchableSelect } from "@/components/searchable-select";
import { SubmitButton } from "@/components/submit-button";
import type { ActionState } from "@/lib/action-result";
import { VENDOR_CONTACT_TYPES, VENDOR_STATUSES } from "@/lib/vendors";
import { getLabels } from "@/lib/labels";
import { useLocale } from "@/components/locale-provider";
import {
  createVendorContact,
  deleteVendor,
  deleteVendorContact,
  linkVendorProduct,
  setPrimaryVendorContact,
  toggleVendorContactActive,
  unlinkVendorProduct,
  updateVendorContact,
  updateVendorProfile,
} from "./vendor360-actions";

type Option = { id: number; name: string };
type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/* ----------------------------------------------------------- primitives */
/* Same small private helpers every 360 form file defines locally (company360-forms.tsx has its own copy too — not shared in this codebase). */

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

function Field({ label, name, errors, children }: { label: string; name: string; errors: Record<string, string[]>; children: React.ReactNode }) {
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
      options={[...(allowEmpty !== undefined ? [{ value: "", label: allowEmpty }] : []), ...options]}
    />
  );
}

const metaOptions = (values: readonly string[], meta: Record<string, { label: string }>) =>
  values.map((v) => ({ value: v, label: meta[v]?.label ?? v }));

/** Small inline form for row actions (set primary, archive, delete…). */
export function VendorRowAction({
  action,
  fields,
  label,
  confirm,
  danger,
  redirectTo,
}: {
  action: "setPrimaryVendorContact" | "toggleVendorContactActive" | "deleteVendorContact" | "deleteVendor" | "unlinkVendorProduct";
  fields: Record<string, string | number>;
  label: string;
  confirm?: string;
  danger?: boolean;
  redirectTo?: string;
}) {
  const actions: Record<string, Action> = {
    setPrimaryVendorContact,
    toggleVendorContactActive,
    deleteVendorContact,
    deleteVendor,
    unlinkVendorProduct,
  };
  const router = useRouter();
  const [state, formAction] = useActionState<ActionState, FormData>(actions[action], null);
  useEffect(() => {
    if (state?.ok && redirectTo) router.push(redirectTo);
  }, [state, redirectTo, router]);
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
      {state && !state.ok ? <span className="ml-2 text-xs text-danger">{state.message}</span> : null}
    </form>
  );
}

/* --------------------------------------------------------------- profile */

export type VendorProfileDefaults = {
  id: number;
  name: string;
  legalName: string | null;
  taxId: string | null;
  category: string | null;
  website: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  status: string;
  accountOwnerId: number | null;
  notes: string | null;
};

export function VendorProfileForm({
  vendor,
  internalUsers,
  categoryOptions,
}: {
  vendor: VendorProfileDefaults;
  internalUsers: Option[];
  categoryOptions: string[];
}) {
  const { state, formAction, errors, value } = useForm(updateVendorProfile, vendor);
  const userOptions = internalUsers.map((u) => ({ value: String(u.id), label: u.name }));
  const { vendorStatusMeta } = getLabels(useLocale());
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={vendor.id} />
      <FormAlert state={state} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Nombre comercial" name="name" errors={errors}>
          <TextInput name="name" value={value} errors={errors} required />
        </Field>
        <Field label="Razón social" name="legalName" errors={errors}>
          <TextInput name="legalName" value={value} errors={errors} />
        </Field>
        <Field label="RFC / Tax ID" name="taxId" errors={errors}>
          <TextInput name="taxId" value={value} errors={errors} />
        </Field>
        <Field label="Categoría" name="category" errors={errors}>
          <SelectInput
            name="category"
            value={value}
            allowEmpty="— Sin categoría —"
            options={[
              ...(vendor.category && !categoryOptions.includes(vendor.category) ? [{ value: vendor.category, label: vendor.category }] : []),
              ...categoryOptions.map((c) => ({ value: c, label: c })),
            ]}
          />
        </Field>
        <Field label="Sitio web" name="website" errors={errors}>
          <TextInput name="website" value={value} errors={errors} />
        </Field>
        <Field label="Estado" name="status" errors={errors}>
          <SelectInput name="status" value={value} options={metaOptions(VENDOR_STATUSES, vendorStatusMeta)} />
        </Field>
        <Field label="Persona de contacto" name="contactName" errors={errors}>
          <TextInput name="contactName" value={value} errors={errors} />
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
        <Field label="Responsable interno" name="accountOwnerId" errors={errors}>
          <SelectInput name="accountOwnerId" value={value} options={userOptions} allowEmpty="— Sin asignar —" />
        </Field>
      </div>
      <Field label="Notas generales" name="notes" errors={errors}>
        <textarea id="notes" name="notes" rows={3} defaultValue={value("notes")} className={inputClass} />
      </Field>
      <div className="flex items-center justify-between">
        <SubmitButton>Guardar cambios</SubmitButton>
        <VendorRowAction
          action="deleteVendor"
          fields={{ id: vendor.id }}
          label="Eliminar proveedor"
          danger
          redirectTo="/vendors"
          confirm="¿Eliminar este proveedor permanentemente? Esta acción no se puede deshacer."
        />
      </div>
    </form>
  );
}

/* --------------------------------------------------------------- contacts */

export type VendorContactDefaults = {
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
  isActive: boolean;
  notes: string | null;
};

export function VendorContactForm({
  vendorId,
  contact,
  onSuccess,
}: {
  vendorId: number;
  contact?: VendorContactDefaults;
  onSuccess?: () => void;
}) {
  const { state, formAction, errors, value } = useForm(contact ? updateVendorContact : createVendorContact, contact, onSuccess);
  const { contactTypeMeta } = getLabels(useLocale());
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="vendorId" value={vendorId} />
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
          <SelectInput name="contactType" value={value} options={metaOptions(VENDOR_CONTACT_TYPES, contactTypeMeta)} />
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

export function AddVendorContactButton({ vendorId }: { vendorId: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClass}>
        <Plus className="size-4" />
        Agregar contacto
      </button>
      <Modal open={open} onOpenChange={setOpen} title="Agregar contacto" description="Un nuevo contacto de este proveedor.">
        <VendorContactForm vendorId={vendorId} onSuccess={() => setOpen(false)} />
      </Modal>
    </>
  );
}

export function VendorContactsTable({ vendorId, contacts }: { vendorId: number; contacts: VendorContactDefaults[] }) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const { contactTypeMeta } = getLabels(useLocale());
  return (
    <Card className="overflow-visible">
      <Table>
        <THead>
          <tr>
            <Th>Nombre</Th>
            <Th>Puesto</Th>
            <Th>Tipo</Th>
            <Th>Email</Th>
            <Th>Teléfono</Th>
            <Th>Acciones</Th>
          </tr>
        </THead>
        <tbody className="divide-y divide-edge-strong">
          {contacts.map((c) => (
            <Fragment key={c.id}>
              <tr className={cx(!c.isActive && "opacity-60")}>
                <Td className="font-medium text-fg">
                  {c.firstName} {c.lastName}
                  {c.isPrimary ? <span className="ml-1.5 text-xs text-primary">· Principal</span> : null}
                </Td>
                <Td className="text-muted">{c.jobTitle ?? "—"}</Td>
                <Td className="text-muted">{contactTypeMeta[c.contactType]?.label ?? c.contactType}</Td>
                <Td className="text-muted">{c.email ?? "—"}</Td>
                <Td className="text-muted">{c.phone ?? "—"}</Td>
                <Td>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label="Editar contacto"
                      onClick={() => setEditingId((id) => (id === c.id ? null : c.id))}
                      className={cx(
                        "flex size-7 items-center justify-center rounded-md transition-colors",
                        editingId === c.id ? "bg-primary-soft text-primary" : "text-faint hover:bg-subtle hover:text-fg",
                      )}
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    {!c.isPrimary && c.isActive ? (
                      <VendorRowAction action="setPrimaryVendorContact" fields={{ id: c.id }} label="Hacer principal" />
                    ) : null}
                    <VendorRowAction
                      action="toggleVendorContactActive"
                      fields={{ id: c.id }}
                      label={c.isActive ? "Archivar" : "Restaurar"}
                    />
                    <VendorRowAction
                      action="deleteVendorContact"
                      fields={{ id: c.id }}
                      label="Eliminar"
                      danger
                      confirm="¿Eliminar este contacto permanentemente?"
                    />
                  </div>
                </Td>
              </tr>
              {editingId === c.id ? (
                <tr>
                  <td colSpan={6} className="border-t border-edge bg-subtle/40 p-4">
                    <VendorContactForm vendorId={vendorId} contact={c} onSuccess={() => setEditingId(null)} />
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

/* --------------------------------------------------------------- products */

/** "Servicio del catálogo" picker, same source Empresas → Servicios already uses — links a catalog Service to this vendor as its default supplier. */
export function AddVendorProductForm({ vendorId, serviceOptions }: { vendorId: number; serviceOptions: Option[] }) {
  const [state, formAction] = useActionState<ActionState, FormData>(linkVendorProduct, null);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="vendorId" value={vendorId} />
      <div className="w-64">
        <label htmlFor="serviceId" className={labelClass}>
          Servicio del catálogo
        </label>
        <SearchableSelect
          id="serviceId"
          name="serviceId"
          defaultValue=""
          options={[{ value: "", label: "— Selecciona —" }, ...serviceOptions.map((s) => ({ value: String(s.id), label: s.name }))]}
        />
        <FieldError id="serviceId-error" errors={errors.serviceId} />
      </div>
      <SubmitButton>
        <Plus className="size-4" /> Agregar producto
      </SubmitButton>
      {state && !state.ok ? <FormAlert state={state} className="w-full" /> : null}
    </form>
  );
}

export type VendorProductRow = { id: number; name: string; category: string | null };

export function VendorProductsList({ vendorId, rows }: { vendorId: number; rows: VendorProductRow[] }) {
  return (
    <Card className="overflow-visible">
      <Table>
        <THead>
          <tr>
            <Th>Servicio</Th>
            <Th>Categoría</Th>
            <Th>Acciones</Th>
          </tr>
        </THead>
        <tbody className="divide-y divide-edge-strong">
          {rows.map((s) => (
            <tr key={s.id}>
              <Td className="font-medium text-fg">{s.name}</Td>
              <Td className="text-muted">{s.category ?? "—"}</Td>
              <Td>
                <VendorRowAction action="unlinkVendorProduct" fields={{ serviceId: s.id, vendorId }} label="Quitar" danger />
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

