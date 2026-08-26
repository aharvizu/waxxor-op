"use client";

import { useActionState, useMemo } from "react";
import { Controller, useForm, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Trash2 } from "lucide-react";
import { FieldError, FormAlert } from "@/components/form-feedback";
import { SearchableSelect } from "@/components/searchable-select";
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
import { useLocale } from "@/components/locale-provider";
import { t, type Locale } from "@/lib/i18n";
import type { ActionState } from "@/lib/action-result";
import { CUSTOM_FIELD_TYPES, type CustomFieldDefinition, type ConfigModule } from "@/lib/custom-fields";
import {
  createCustomField,
  deleteCustomField,
  reorderCustomFields,
  toggleCustomFieldActive,
  updateCustomField,
} from "./actions";

function getFieldTypeLabels(locale: Locale): Record<string, string> {
  return {
    text: t("Texto", "Text", locale),
    textarea: t("Texto largo", "Long text", locale),
    number: t("Número", "Number", locale),
    decimal: t("Decimal", "Decimal", locale),
    currency: t("Moneda", "Currency", locale),
    date: t("Fecha", "Date", locale),
    time: t("Hora", "Time", locale),
    datetime: t("Fecha/Hora", "Date/Time", locale),
    checkbox: "Checkbox",
    select: t("Lista", "List", locale),
    multiselect: t("Lista múltiple", "Multi-select list", locale),
    radio: "Radio",
    user: t("Usuario", "User", locale),
    company: t("Empresa", "Company", locale),
    contact: t("Contacto", "Contact", locale),
    email: "Email",
    phone: t("Teléfono", "Phone", locale),
    url: "URL",
    color: t("Color", "Color", locale),
  };
}

const OPTION_TYPES = new Set(["select", "multiselect", "radio"]);
const NUMERIC_TYPES = new Set(["number", "decimal", "currency"]);

/**
 * Custom Fields (Part 4, dynamic config 2026-07-20) — Create/Edit migrated
 * to React Hook Form + zodResolver: the field list is genuinely dynamic
 * (add/remove option rows, replacing the old newline "value|label" textarea)
 * and the visible field set is genuinely configurable (numeric bounds only
 * for NUMERIC_TYPES, options only for OPTION_TYPES), reacting live to the
 * selected type instead of only on the next server round-trip. The submit
 * path is unchanged: `onValid` still builds a FormData with the exact same
 * field names and calls the existing `createCustomField`/`updateCustomField`
 * Server Actions through the same `useActionState`. `FieldRowActions` and
 * `CustomFieldList`'s drag-reorder are untouched — pure reorder-only actions
 * with no other fields to co-validate, so RHF wouldn't simplify them.
 */
type OptionRow = { value: string; label: string };

const numericRefine = (d: { minValue?: string; maxValue?: string }) => {
  if (!d.minValue || !d.maxValue) return true;
  return Number(d.minValue) <= Number(d.maxValue);
};
function getNumericRefineOpts(locale: Locale) {
  return {
    message: t(
      "El valor mínimo no puede ser mayor al máximo.",
      "The minimum value cannot be greater than the maximum.",
      locale,
    ),
    path: ["maxValue"],
  };
}

function getCreateFieldSchema(locale: Locale) {
  return z
    .object({
      name: z.string().trim().min(1, t("Nombre requerido.", "Name is required.", locale)).max(120),
      key: z
        .string()
        .trim()
        .min(1, t("Clave requerida.", "Key is required.", locale))
        .max(60)
        .regex(
          /^[a-z][a-z0-9_]*$/,
          t(
            "Usa minúsculas, números y guion bajo, iniciando con una letra.",
            "Use lowercase letters, numbers, and underscores, starting with a letter.",
            locale,
          ),
        ),
      fieldType: z.enum(CUSTOM_FIELD_TYPES as [string, ...string[]]),
      groupName: z.string().trim().optional(),
      description: z.string().trim().optional(),
      helpText: z.string().trim().optional(),
      placeholder: z.string().trim().optional(),
      options: z.array(
        z.object({
          value: z.string().trim().min(1, t("Requerido", "Required", locale)),
          label: z.string().trim().min(1, t("Requerido", "Required", locale)),
        }),
      ),
      maxLength: z.string().optional(),
      minValue: z.string().optional(),
      maxValue: z.string().optional(),
      color: z.string().optional(),
      icon: z.string().trim().optional(),
      required: z.boolean(),
      visible: z.boolean(),
      editable: z.boolean(),
    })
    .refine(numericRefine, getNumericRefineOpts(locale));
}
type CreateFormValues = z.infer<ReturnType<typeof getCreateFieldSchema>>;

function getEditFieldSchema(locale: Locale) {
  return z
    .object({
      name: z.string().trim().min(1, t("Nombre requerido.", "Name is required.", locale)).max(120),
      groupName: z.string().trim().optional(),
      description: z.string().trim().optional(),
      helpText: z.string().trim().optional(),
      placeholder: z.string().trim().optional(),
      options: z.array(
        z.object({
          value: z.string().trim().min(1, t("Requerido", "Required", locale)),
          label: z.string().trim().min(1, t("Requerido", "Required", locale)),
        }),
      ),
      maxLength: z.string().optional(),
      minValue: z.string().optional(),
      maxValue: z.string().optional(),
      color: z.string().optional(),
      icon: z.string().trim().optional(),
      required: z.boolean(),
      visible: z.boolean(),
      editable: z.boolean(),
    })
    .refine(numericRefine, getNumericRefineOpts(locale));
}
type EditFormValues = z.infer<ReturnType<typeof getEditFieldSchema>>;

function optionsFromField(field: Pick<CustomFieldDefinition, "options">): OptionRow[] {
  return ((field.options ?? []) as { value: string; label: string }[]).map((o) => ({ value: o.value, label: o.label }));
}

/** Fully-controlled array editor, wired via `Controller` — plain value/onChange props (no `useFieldArray`/`control` generics), so the same component drops into both the create and edit forms' distinct field-value types without fighting RHF's array-path typing. */
function OptionsEditor({ value, onChange }: { value: OptionRow[]; onChange: (next: OptionRow[]) => void }) {
  const locale = useLocale();
  function patch(i: number, patch: Partial<OptionRow>) {
    onChange(value.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
  }
  return (
    <div>
      <label className={labelClass}>{t("Opciones", "Options", locale)}</label>
      <div className="space-y-2">
        {value.map((o, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={o.value}
              onChange={(e) => patch(i, { value: e.target.value })}
              placeholder={t("valor", "value", locale)}
              className={cx(inputClass, "text-sm")}
            />
            <input
              value={o.label}
              onChange={(e) => patch(i, { label: e.target.value })}
              placeholder={t("Etiqueta", "Label", locale)}
              className={cx(inputClass, "text-sm")}
            />
            <button type="button" onClick={() => onChange(value.filter((_, idx) => idx !== i))} className="text-muted hover:text-danger">
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
        {value.length === 0 ? <p className="text-xs text-muted">{t("Sin opciones — agrega la primera.", "No options yet — add the first one.", locale)}</p> : null}
      </div>
      <button
        type="button"
        onClick={() => onChange([...value, { value: "", label: "" }])}
        className={cx(buttonSecondaryClass, "mt-2 inline-flex items-center gap-1.5 h-8 text-xs")}
      >
        <Plus className="size-3.5" /> {t("Agregar opción", "Add option", locale)}
      </button>
    </div>
  );
}

function NumericBoundsFields({ control }: { control: Control<CreateFormValues> | Control<EditFormValues> }) {
  const locale = useLocale();
  return (
    <>
      <div>
        <label className={labelClass}>{t("Valor mínimo", "Minimum value", locale)}</label>
        <Controller control={control as Control<EditFormValues>} name="minValue" render={({ field }) => <input {...field} type="number" className={inputClass} />} />
      </div>
      <div>
        <label className={labelClass}>{t("Valor máximo", "Maximum value", locale)}</label>
        <Controller control={control as Control<EditFormValues>} name="maxValue" render={({ field }) => <input {...field} type="number" className={inputClass} />} />
      </div>
    </>
  );
}

export function CustomFieldCreateForm({ module }: { module: ConfigModule }) {
  const locale = useLocale();
  const FIELD_TYPE_LABELS = useMemo(() => getFieldTypeLabels(locale), [locale]);
  const createFieldSchema = useMemo(() => getCreateFieldSchema(locale), [locale]);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createCustomField, null);
  const {
    control,
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<CreateFormValues>({
    resolver: zodResolver(createFieldSchema),
    defaultValues: {
      name: "",
      key: "",
      fieldType: Object.keys(FIELD_TYPE_LABELS)[0],
      groupName: "",
      description: "",
      helpText: "",
      placeholder: "",
      options: [],
      maxLength: "",
      minValue: "",
      maxValue: "",
      color: "#7c3aed",
      icon: "",
      required: false,
      visible: true,
      editable: true,
    },
  });
  const fieldType = watch("fieldType");

  function onValid(values: CreateFormValues) {
    const fd = new FormData();
    fd.set("module", module);
    fd.set("name", values.name);
    fd.set("key", values.key);
    fd.set("fieldType", values.fieldType);
    fd.set("groupName", values.groupName ?? "");
    fd.set("description", values.description ?? "");
    fd.set("helpText", values.helpText ?? "");
    fd.set("placeholder", values.placeholder ?? "");
    fd.set("optionsText", values.options.map((o) => `${o.value}|${o.label}`).join("\n"));
    fd.set("maxLength", values.maxLength ?? "");
    fd.set("minValue", values.minValue ?? "");
    fd.set("maxValue", values.maxValue ?? "");
    fd.set("color", values.color ?? "#7c3aed");
    fd.set("icon", values.icon ?? "");
    fd.set("required", values.required ? "true" : "false");
    fd.set("visible", values.visible ? "true" : "false");
    fd.set("editable", values.editable ? "true" : "false");
    formAction(fd);
  }

  return (
    <form onSubmit={handleSubmit(onValid)} className="space-y-3">
      <FormAlert state={state} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass}>{t("Nombre", "Name", locale)}</label>
          <input {...register("name")} className={inputClass} placeholder={t("Ej. Número de contrato", "E.g. Contract number", locale)} />
          <FieldError errors={errors.name?.message ? [errors.name.message] : undefined} />
        </div>
        <div>
          <label className={labelClass}>{t("Clave (identificador)", "Key (identifier)", locale)}</label>
          <input {...register("key")} className={inputClass} placeholder={t("ej. numero_contrato", "e.g. contract_number", locale)} />
          <FieldError errors={errors.key?.message ? [errors.key.message] : undefined} />
        </div>
        <div>
          <label className={labelClass}>{t("Tipo", "Type", locale)}</label>
          <Controller
            control={control}
            name="fieldType"
            render={({ field }) => (
              <SearchableSelect value={field.value} onValueChange={field.onChange} options={Object.entries(FIELD_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))} />
            )}
          />
        </div>
        <div>
          <label className={labelClass}>{t("Grupo (sección)", "Group (section)", locale)}</label>
          <input {...register("groupName")} className={inputClass} placeholder={t("Opcional", "Optional", locale)} />
        </div>
      </div>
      <div>
        <label className={labelClass}>{t("Descripción", "Description", locale)}</label>
        <input {...register("description")} className={inputClass} placeholder={t("Opcional", "Optional", locale)} />
      </div>
      <div>
        <label className={labelClass}>{t("Texto de ayuda", "Help text", locale)}</label>
        <input
          {...register("helpText")}
          className={inputClass}
          placeholder={t("Se muestra bajo el campo, opcional", "Shown under the field, optional", locale)}
        />
      </div>
      <div>
        <label className={labelClass}>Placeholder</label>
        <input {...register("placeholder")} className={inputClass} placeholder={t("Opcional", "Optional", locale)} />
      </div>
      {OPTION_TYPES.has(fieldType) ? (
        <Controller control={control} name="options" render={({ field }) => <OptionsEditor value={field.value} onChange={field.onChange} />} />
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className={labelClass}>{t("Longitud máxima", "Max length", locale)}</label>
          <input {...register("maxLength")} type="number" min={1} className={inputClass} placeholder={t("Opcional", "Optional", locale)} />
        </div>
        {NUMERIC_TYPES.has(fieldType) ? <NumericBoundsFields control={control} /> : null}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass}>{t("Color", "Color", locale)}</label>
          <input {...register("color")} type="color" className="h-9 w-16 cursor-pointer rounded-lg border border-edge bg-surface p-1" />
        </div>
        <div>
          <label className={labelClass}>{t("Ícono (nombre lucide, opcional)", "Icon (lucide name, optional)", locale)}</label>
          <input {...register("icon")} className={inputClass} placeholder={t("ej. Star", "e.g. Star", locale)} />
        </div>
      </div>
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm text-fg">
          <input type="checkbox" {...register("required")} className="size-4 rounded border-edge" /> {t("Obligatorio", "Required", locale)}
        </label>
        <label className="flex items-center gap-2 text-sm text-fg">
          <input type="checkbox" {...register("visible")} className="size-4 rounded border-edge" /> {t("Visible", "Visible", locale)}
        </label>
        <label className="flex items-center gap-2 text-sm text-fg">
          <input type="checkbox" {...register("editable")} className="size-4 rounded border-edge" /> {t("Editable", "Editable", locale)}
        </label>
      </div>
      <SubmitButton pending={pending}>{t("Agregar campo", "Add field", locale)}</SubmitButton>
    </form>
  );
}

export function CustomFieldEditForm({ field, onDone }: { field: CustomFieldDefinition; onDone?: () => void }) {
  const locale = useLocale();
  const editFieldSchema = useMemo(() => getEditFieldSchema(locale), [locale]);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updateCustomField, null);
  const validations = (field.validations ?? {}) as { min?: number; max?: number; regex?: string };
  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EditFormValues>({
    resolver: zodResolver(editFieldSchema),
    defaultValues: {
      name: field.name,
      groupName: field.groupName ?? "",
      description: field.description ?? "",
      helpText: field.helpText ?? "",
      placeholder: field.placeholder ?? "",
      options: optionsFromField(field),
      maxLength: field.maxLength != null ? String(field.maxLength) : "",
      minValue: validations.min != null ? String(validations.min) : "",
      maxValue: validations.max != null ? String(validations.max) : "",
      color: field.color ?? "#7c3aed",
      icon: field.icon ?? "",
      required: field.required,
      visible: field.visible,
      editable: field.editable,
    },
  });

  function onValid(values: EditFormValues) {
    const fd = new FormData();
    fd.set("id", String(field.id));
    fd.set("name", values.name);
    fd.set("groupName", values.groupName ?? "");
    fd.set("description", values.description ?? "");
    fd.set("helpText", values.helpText ?? "");
    fd.set("placeholder", values.placeholder ?? "");
    if (OPTION_TYPES.has(field.fieldType)) fd.set("optionsText", values.options.map((o) => `${o.value}|${o.label}`).join("\n"));
    fd.set("maxLength", values.maxLength ?? "");
    fd.set("minValue", values.minValue ?? "");
    fd.set("maxValue", values.maxValue ?? "");
    fd.set("color", values.color ?? "#7c3aed");
    fd.set("icon", values.icon ?? "");
    fd.set("required", values.required ? "true" : "false");
    fd.set("visible", values.visible ? "true" : "false");
    fd.set("editable", values.editable ? "true" : "false");
    formAction(fd);
    onDone?.();
  }

  return (
    <form onSubmit={handleSubmit(onValid)} className="space-y-3">
      <FormAlert state={state} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass}>{t("Nombre", "Name", locale)}</label>
          <input {...register("name")} className={inputClass} />
          <FieldError errors={errors.name?.message ? [errors.name.message] : undefined} />
        </div>
        <div>
          <label className={labelClass}>{t("Grupo (sección)", "Group (section)", locale)}</label>
          <input {...register("groupName")} className={inputClass} />
        </div>
      </div>
      <div>
        <label className={labelClass}>{t("Descripción", "Description", locale)}</label>
        <input {...register("description")} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>{t("Texto de ayuda", "Help text", locale)}</label>
        <input {...register("helpText")} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Placeholder</label>
        <input {...register("placeholder")} className={inputClass} />
      </div>
      {OPTION_TYPES.has(field.fieldType) ? (
        <Controller control={control} name="options" render={({ field: f }) => <OptionsEditor value={f.value} onChange={f.onChange} />} />
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className={labelClass}>{t("Longitud máxima", "Max length", locale)}</label>
          <input {...register("maxLength")} type="number" min={1} className={inputClass} />
        </div>
        {NUMERIC_TYPES.has(field.fieldType) ? <NumericBoundsFields control={control} /> : null}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass}>{t("Color", "Color", locale)}</label>
          <input {...register("color")} type="color" className="h-9 w-16 cursor-pointer rounded-lg border border-edge bg-surface p-1" />
        </div>
        <div>
          <label className={labelClass}>{t("Ícono (nombre lucide, opcional)", "Icon (lucide name, optional)", locale)}</label>
          <input {...register("icon")} className={inputClass} />
        </div>
      </div>
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm text-fg">
          <input type="checkbox" {...register("required")} className="size-4 rounded border-edge" /> {t("Obligatorio", "Required", locale)}
        </label>
        <label className="flex items-center gap-2 text-sm text-fg">
          <input type="checkbox" {...register("visible")} className="size-4 rounded border-edge" /> {t("Visible", "Visible", locale)}
        </label>
        <label className="flex items-center gap-2 text-sm text-fg">
          <input type="checkbox" {...register("editable")} className="size-4 rounded border-edge" /> {t("Editable", "Editable", locale)}
        </label>
      </div>
      <SubmitButton pending={pending}>{t("Guardar cambios", "Save changes", locale)}</SubmitButton>
    </form>
  );
}

function FieldRowActions({ field, canDelete }: { field: CustomFieldDefinition; canDelete: boolean }) {
  const locale = useLocale();
  const [toggleState, toggleAction] = useActionState<ActionState, FormData>(toggleCustomFieldActive, null);
  const [deleteState, deleteAction] = useActionState<ActionState, FormData>(deleteCustomField, null);
  return (
    <span className="flex items-center gap-1.5">
      <form action={toggleAction}>
        <input type="hidden" name="id" value={field.id} />
        <button type="submit" className={cx(buttonSecondaryClass, "h-7 px-2 text-xs")}>
          {field.isActive ? t("Archivar", "Archive", locale) : t("Restaurar", "Restore", locale)}
        </button>
      </form>
      {canDelete ? (
        <form action={deleteAction}>
          <input type="hidden" name="id" value={field.id} />
          <button type="submit" className={cx(buttonDangerClass, "h-7 px-2 text-xs")}>
            {t("Eliminar", "Delete", locale)}
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
  const locale = useLocale();
  const FIELD_TYPE_LABELS = useMemo(() => getFieldTypeLabels(locale), [locale]);
  const [, reorderAction] = useActionState<ActionState, FormData>(reorderCustomFields, null);

  function handleReorder(orderedIds: (number | string)[]) {
    const fd = new FormData();
    fd.set("module", module);
    fd.set("orderedIds", orderedIds.join(","));
    reorderAction(fd);
  }

  if (fields.length === 0) {
    return (
      <p className="text-sm text-muted">
        {t("Sin campos personalizados para este módulo todavía.", "No custom fields for this module yet.", locale)}
      </p>
    );
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
              {field.required ? <Badge tone="amber">{t("Obligatorio", "Required", locale)}</Badge> : null}
              {!field.visible ? <Badge tone="slate">{t("Oculto", "Hidden", locale)}</Badge> : null}
              {!field.editable ? <Badge tone="slate">{t("Solo lectura", "Read-only", locale)}</Badge> : null}
              {!field.isActive ? <Badge tone="slate">{t("Archivado", "Archived", locale)}</Badge> : null}
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
