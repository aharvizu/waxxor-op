"use client";

import { useActionState } from "react";
import { FieldError, FormAlert } from "@/components/form-feedback";
import { SubmitButton } from "@/components/submit-button";
import { DragList } from "@/components/drag-list";
import {
  Badge,
  buttonDangerClass,
  buttonSecondaryClass,
  cx,
  inputClass,
  labelClass,
} from "@/components/ui";
import type { ActionState } from "@/lib/action-result";
import type { CustomFieldDefinition, ConfigModule } from "@/lib/custom-fields";
import {
  createCustomField,
  deleteCustomField,
  reorderCustomFields,
  toggleCustomFieldActive,
  updateCustomField,
} from "./actions";

const FIELD_TYPE_LABELS: Record<string, string> = {
  text: "Texto",
  textarea: "Texto largo",
  number: "Número",
  decimal: "Decimal",
  currency: "Moneda",
  date: "Fecha",
  time: "Hora",
  datetime: "Fecha/Hora",
  checkbox: "Checkbox",
  select: "Lista",
  multiselect: "Lista múltiple",
  radio: "Radio",
  user: "Usuario",
  company: "Empresa",
  contact: "Contacto",
  email: "Email",
  phone: "Teléfono",
  url: "URL",
  color: "Color",
};

const OPTION_TYPES = new Set(["select", "multiselect", "radio"]);
const NUMERIC_TYPES = new Set(["number", "decimal", "currency"]);

function CheckboxWithFallback({ name, defaultChecked, label }: { name: string; defaultChecked: boolean; label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm text-fg">
      <input type="hidden" name={name} value="false" />
      <input type="checkbox" name={name} value="true" defaultChecked={defaultChecked} className="size-4 rounded border-edge" />
      {label}
    </label>
  );
}

export function CustomFieldCreateForm({ module }: { module: ConfigModule }) {
  const [state, formAction] = useActionState<ActionState, FormData>(createCustomField, null);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="module" value={module} />
      <FormAlert state={state} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Nombre</label>
          <input name="name" required className={inputClass} placeholder="Ej. Número de contrato" />
          <FieldError errors={errors.name} />
        </div>
        <div>
          <label className={labelClass}>Clave (identificador)</label>
          <input name="key" required className={inputClass} placeholder="ej. numero_contrato" />
          <FieldError errors={errors.key} />
        </div>
        <div>
          <label className={labelClass}>Tipo</label>
          <select name="fieldType" required className={inputClass}>
            {Object.entries(FIELD_TYPE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Grupo (sección)</label>
          <input name="groupName" className={inputClass} placeholder="Opcional" />
        </div>
      </div>
      <div>
        <label className={labelClass}>Descripción</label>
        <input name="description" className={inputClass} placeholder="Opcional" />
      </div>
      <div>
        <label className={labelClass}>Texto de ayuda</label>
        <input name="helpText" className={inputClass} placeholder="Se muestra bajo el campo, opcional" />
      </div>
      <div>
        <label className={labelClass}>Placeholder</label>
        <input name="placeholder" className={inputClass} placeholder="Opcional" />
      </div>
      <div>
        <label className={labelClass}>Opciones (una por línea: valor|etiqueta) — Lista/Lista múltiple/Radio</label>
        <textarea name="optionsText" rows={3} className={inputClass} placeholder={"alta|Alta\nmedia|Media\nbaja|Baja"} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className={labelClass}>Longitud máxima</label>
          <input name="maxLength" type="number" min={1} className={inputClass} placeholder="Opcional" />
        </div>
        <div>
          <label className={labelClass}>Valor mínimo</label>
          <input name="minValue" type="number" className={inputClass} placeholder="Opcional" />
        </div>
        <div>
          <label className={labelClass}>Valor máximo</label>
          <input name="maxValue" type="number" className={inputClass} placeholder="Opcional" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Color</label>
          <input name="color" type="color" defaultValue="#7c3aed" className="h-9 w-16 cursor-pointer rounded-lg border border-edge bg-surface p-1" />
        </div>
        <div>
          <label className={labelClass}>Ícono (nombre lucide, opcional)</label>
          <input name="icon" className={inputClass} placeholder="ej. Star" />
        </div>
      </div>
      <div className="flex flex-wrap gap-4">
        <CheckboxWithFallback name="required" defaultChecked={false} label="Obligatorio" />
        <CheckboxWithFallback name="visible" defaultChecked={true} label="Visible" />
        <CheckboxWithFallback name="editable" defaultChecked={true} label="Editable" />
      </div>
      <SubmitButton>Agregar campo</SubmitButton>
    </form>
  );
}

export function CustomFieldEditForm({ field, onDone }: { field: CustomFieldDefinition; onDone?: () => void }) {
  const [state, formAction] = useActionState<ActionState, FormData>(updateCustomField, null);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const options = (field.options ?? []) as { value: string; label: string }[];
  const optionsText = options.map((o) => `${o.value}|${o.label}`).join("\n");
  const validations = (field.validations ?? {}) as { min?: number; max?: number; regex?: string };
  return (
    <form action={formAction} className="space-y-3" onSubmit={() => onDone?.()}>
      <input type="hidden" name="id" value={field.id} />
      <FormAlert state={state} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Nombre</label>
          <input name="name" defaultValue={field.name} required className={inputClass} />
          <FieldError errors={errors.name} />
        </div>
        <div>
          <label className={labelClass}>Grupo (sección)</label>
          <input name="groupName" defaultValue={field.groupName ?? ""} className={inputClass} />
        </div>
      </div>
      <div>
        <label className={labelClass}>Descripción</label>
        <input name="description" defaultValue={field.description ?? ""} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Texto de ayuda</label>
        <input name="helpText" defaultValue={field.helpText ?? ""} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Placeholder</label>
        <input name="placeholder" defaultValue={field.placeholder ?? ""} className={inputClass} />
      </div>
      {OPTION_TYPES.has(field.fieldType) ? (
        <div>
          <label className={labelClass}>Opciones (una por línea: valor|etiqueta)</label>
          <textarea name="optionsText" rows={3} defaultValue={optionsText} className={inputClass} />
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className={labelClass}>Longitud máxima</label>
          <input name="maxLength" type="number" min={1} defaultValue={field.maxLength ?? ""} className={inputClass} />
        </div>
        {NUMERIC_TYPES.has(field.fieldType) ? (
          <>
            <div>
              <label className={labelClass}>Valor mínimo</label>
              <input name="minValue" type="number" defaultValue={validations.min ?? ""} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Valor máximo</label>
              <input name="maxValue" type="number" defaultValue={validations.max ?? ""} className={inputClass} />
            </div>
          </>
        ) : null}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Color</label>
          <input name="color" type="color" defaultValue={field.color ?? "#7c3aed"} className="h-9 w-16 cursor-pointer rounded-lg border border-edge bg-surface p-1" />
        </div>
        <div>
          <label className={labelClass}>Ícono (nombre lucide, opcional)</label>
          <input name="icon" defaultValue={field.icon ?? ""} className={inputClass} />
        </div>
      </div>
      <div className="flex flex-wrap gap-4">
        <CheckboxWithFallback name="required" defaultChecked={field.required} label="Obligatorio" />
        <CheckboxWithFallback name="visible" defaultChecked={field.visible} label="Visible" />
        <CheckboxWithFallback name="editable" defaultChecked={field.editable} label="Editable" />
      </div>
      <SubmitButton>Guardar cambios</SubmitButton>
    </form>
  );
}

function FieldRowActions({ field, canDelete }: { field: CustomFieldDefinition; canDelete: boolean }) {
  const [toggleState, toggleAction] = useActionState<ActionState, FormData>(toggleCustomFieldActive, null);
  const [deleteState, deleteAction] = useActionState<ActionState, FormData>(deleteCustomField, null);
  return (
    <span className="flex items-center gap-1.5">
      <form action={toggleAction}>
        <input type="hidden" name="id" value={field.id} />
        <button type="submit" className={cx(buttonSecondaryClass, "h-7 px-2 text-xs")}>
          {field.isActive ? "Archivar" : "Restaurar"}
        </button>
      </form>
      {canDelete ? (
        <form action={deleteAction}>
          <input type="hidden" name="id" value={field.id} />
          <button type="submit" className={cx(buttonDangerClass, "h-7 px-2 text-xs")}>
            Eliminar
          </button>
        </form>
      ) : null}
      {toggleState && !toggleState.ok ? <span className="text-xs text-danger">{toggleState.message}</span> : null}
      {deleteState && !deleteState.ok ? <span className="text-xs text-danger">{deleteState.message}</span> : null}
    </span>
  );
}

export function CustomFieldList({
  module,
  fields,
  canDelete,
}: {
  module: ConfigModule;
  fields: CustomFieldDefinition[];
  canDelete: boolean;
}) {
  const [, reorderAction] = useActionState<ActionState, FormData>(reorderCustomFields, null);

  function handleReorder(orderedIds: (number | string)[]) {
    const fd = new FormData();
    fd.set("module", module);
    fd.set("orderedIds", orderedIds.join(","));
    reorderAction(fd);
  }

  if (fields.length === 0) {
    return <p className="text-sm text-muted">Sin campos personalizados para este módulo todavía.</p>;
  }

  return (
    <DragList
      items={fields}
      onReorder={handleReorder}
      renderItem={(field) => (
        <details className="group rounded-lg border border-edge bg-surface px-3 py-2">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2">
              <span className={cx("truncate font-medium text-fg", !field.isActive && "opacity-50")}>{field.name}</span>
              <Badge tone="slate">{FIELD_TYPE_LABELS[field.fieldType] ?? field.fieldType}</Badge>
              {field.required ? <Badge tone="amber">Obligatorio</Badge> : null}
              {!field.visible ? <Badge tone="slate">Oculto</Badge> : null}
              {!field.editable ? <Badge tone="slate">Solo lectura</Badge> : null}
              {!field.isActive ? <Badge tone="slate">Archivado</Badge> : null}
            </span>
            <FieldRowActions field={field} canDelete={canDelete} />
          </summary>
          <div className="mt-3 border-t border-edge pt-3">
            <CustomFieldEditForm field={field} />
          </div>
        </details>
      )}
    />
  );
}
