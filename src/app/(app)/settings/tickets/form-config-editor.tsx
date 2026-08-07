"use client";

import { useActionState } from "react";
import { FormProvider, useFieldArray, useForm, useFormContext } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { DragList } from "@/components/drag-list";
import { FormAlert } from "@/components/form-feedback";
import { SearchableSelect } from "@/components/searchable-select";
import { SubmitButton } from "@/components/submit-button";
import { buttonSecondaryClass, cx, inputClass, labelClass } from "@/components/ui";
import { z } from "zod";
import type { ActionState } from "@/lib/action-result";
import type { FormConfig } from "@/lib/settings";
import { saveOrganizationSetting } from "../actions";

export type AvailableField = { key: string; label: string; isCustomField: boolean };

/**
 * Same field names/rules as `formConfigSchema` (src/lib/settings.ts), but
 * without its `.default(...)`s or outer `jsonField` JSON-string
 * preprocessing: `useForm`'s `defaultValues` below always supplies every
 * field already, and zod's per-field `.default()` makes the schema's input
 * type diverge from its output type in a way `zodResolver` can't reconcile
 * against a single `FormConfig`-typed form. Server-side validation of the
 * saved payload still goes through the real `formConfigSchema`, unchanged.
 */
const clientFormFieldSchema = z.object({
  key: z.string(),
  visible: z.boolean(),
  required: z.boolean(),
  order: z.number(),
  defaultValue: z.string().optional(),
  isCustomField: z.boolean(),
});
const clientFormSectionSchema = z.object({
  key: z.string(),
  label: z.string().trim().min(1, "La sección necesita un nombre"),
  collapsed: z.boolean(),
  order: z.number(),
  fields: z.array(clientFormFieldSchema),
});
const clientFormConfigSchema = z.object({ sections: z.array(clientFormSectionSchema) });

/**
 * Part 5 (dynamic config 2026-07-20): no-code form layout editor. Migrated to
 * React Hook Form (nested `useFieldArray`: sections, and per-section fields)
 * — the same `formConfigSchema` the Server Action already validates with
 * (src/lib/settings.ts) now also gates the client via `zodResolver`, so bad
 * shape is caught before submit instead of only server-side. The submit path
 * is unchanged: `onValid` still builds a FormData and calls the existing
 * `saveOrganizationSetting` Server Action through the same `useActionState`
 * (settingKey "tickets.formConfig") — RHF only replaces the hand-rolled
 * add/remove/patch/reorder `useState` plumbing, nothing about persistence.
 */
export function FormConfigEditor({
  initial,
  availableFields,
}: {
  initial: FormConfig;
  availableFields: AvailableField[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(saveOrganizationSetting, null);
  const methods = useForm<FormConfig>({
    resolver: zodResolver(clientFormConfigSchema),
    defaultValues: {
      sections: initial.sections.length > 0 ? initial.sections : [{ key: "general", label: "General", collapsed: false, order: 0, fields: [] }],
    },
  });
  const { control, handleSubmit, watch, getValues } = methods;
  const { fields: sections, append: appendSection, remove: removeSection, replace: replaceSections } = useFieldArray({ control, name: "sections" });

  const watchedSections = watch("sections");
  const placedKeys = new Set(watchedSections.flatMap((s) => s.fields.map((f) => f.key)));
  const unplaced = availableFields.filter((f) => !placedKeys.has(f.key));

  function addSection() {
    appendSection({ key: `section_${Date.now()}`, label: "Nueva sección", collapsed: false, order: sections.length, fields: [] });
  }

  function handleSectionReorder(orderedIds: (number | string)[]) {
    const byKey = new Map(getValues("sections").map((s) => [s.key, s]));
    replaceSections(orderedIds.map((id) => byKey.get(String(id))!));
  }

  function onValid(values: FormConfig) {
    const fd = new FormData();
    fd.set("settingKey", "tickets.formConfig");
    fd.set("sections", JSON.stringify(values.sections.map((s, i) => ({ ...s, order: i }))));
    formAction(fd);
  }

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit(onValid)} className="space-y-4">
        <FormAlert state={state} />

        <div className="space-y-3">
          {sections.length === 0 ? (
            <p className="text-sm text-muted">Sin secciones — agrega la primera abajo.</p>
          ) : (
            <DragList
              items={sections.map((s) => ({ ...s, id: s.key }))}
              onReorder={handleSectionReorder}
              renderItem={(_section, index) => (
                <SectionEditor
                  index={index}
                  availableFields={availableFields}
                  unplaced={unplaced}
                  onRemoveSection={() => removeSection(index)}
                />
              )}
            />
          )}
        </div>

        <button type="button" onClick={addSection} className={cx(buttonSecondaryClass, "inline-flex items-center gap-1.5")}>
          <Plus className="size-4" /> Agregar sección
        </button>

        <div>
          <label className={labelClass}>&nbsp;</label>
          <SubmitButton pending={pending}>Guardar formulario</SubmitButton>
        </div>
      </form>
    </FormProvider>
  );
}

function SectionEditor({
  index,
  availableFields,
  unplaced,
  onRemoveSection,
}: {
  index: number;
  availableFields: AvailableField[];
  unplaced: AvailableField[];
  onRemoveSection: () => void;
}) {
  const {
    control,
    watch,
    setValue,
    formState: { errors },
  } = useFormContext<FormConfig>();
  const { fields, append, remove, replace } = useFieldArray({ control, name: `sections.${index}.fields` });
  const label = watch(`sections.${index}.label`);
  const collapsed = watch(`sections.${index}.collapsed`);
  const labelError = errors.sections?.[index]?.label?.message;

  const labelFor = (key: string) => availableFields.find((f) => f.key === key)?.label ?? key;

  function addField(fieldKey: string) {
    const field = availableFields.find((f) => f.key === fieldKey);
    if (!field) return;
    append({ key: field.key, visible: true, required: false, order: fields.length, isCustomField: field.isCustomField });
  }

  function handleFieldReorder(orderedIds: (number | string)[]) {
    const byKey = new Map(fields.map((f) => [f.key, f]));
    replace(orderedIds.map((id, i) => ({ ...byKey.get(String(id))!, order: i })));
  }

  return (
    <div className="rounded-lg border border-edge bg-surface">
      <div className="flex items-center gap-2 border-b border-edge px-3 py-2">
        <button type="button" onClick={() => setValue(`sections.${index}.collapsed`, !collapsed)} className="text-muted hover:text-fg">
          {collapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
        </button>
        <div className="max-w-xs flex-1">
          <input
            value={label}
            onChange={(e) => setValue(`sections.${index}.label`, e.target.value, { shouldValidate: true })}
            className={cx(inputClass, "h-8 text-sm", labelError && "border-danger")}
          />
          {labelError ? <p className="mt-1 text-xs text-danger">{labelError}</p> : null}
        </div>
        <button type="button" onClick={onRemoveSection} className="rounded-md p-1.5 text-muted hover:bg-subtle hover:text-danger">
          <Trash2 className="size-4" />
        </button>
      </div>
      {!collapsed ? (
        <div className="space-y-3 p-3">
          {fields.length === 0 ? (
            <p className="text-xs text-muted">Sin campos en esta sección.</p>
          ) : (
            <DragList
              items={fields.map((f) => ({ ...f, id: f.key }))}
              onReorder={handleFieldReorder}
              renderItem={(field, fi) => (
                <div className="flex flex-wrap items-center gap-3 rounded-md border border-edge bg-canvas px-2.5 py-1.5">
                  <span className="min-w-32 flex-1 truncate text-sm text-fg">
                    {labelFor(field.key)}
                    {field.isCustomField ? <span className="ml-1 text-[10px] text-faint">(personalizado)</span> : null}
                  </span>
                  <label className="flex items-center gap-1.5 text-xs text-muted">
                    <FieldCheckbox name={`sections.${index}.fields.${fi}.visible`} />
                    Visible
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-muted">
                    <FieldCheckbox name={`sections.${index}.fields.${fi}.required`} />
                    Obligatorio
                  </label>
                  <FieldTextInput name={`sections.${index}.fields.${fi}.defaultValue`} placeholder="Valor por defecto" />
                  <button type="button" onClick={() => remove(fi)} className="text-muted hover:text-danger">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              )}
            />
          )}
          {unplaced.length > 0 ? (
            <SearchableSelect
              value=""
              onValueChange={(v) => {
                if (v) addField(v);
              }}
              className="h-8 w-auto text-xs"
              options={[{ value: "", label: "+ Agregar campo…" }, ...unplaced.map((f) => ({ value: f.key, label: f.label }))]}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Thin `register()` wrappers — the field-row JSX above stays declarative instead of destructuring `{...register(...)}` inline for every input. */
function FieldCheckbox({ name }: { name: `sections.${number}.fields.${number}.visible` | `sections.${number}.fields.${number}.required` }) {
  const { register } = useFormContext<FormConfig>();
  return <input type="checkbox" {...register(name)} />;
}

function FieldTextInput({ name, placeholder }: { name: `sections.${number}.fields.${number}.defaultValue`; placeholder: string }) {
  const { register } = useFormContext<FormConfig>();
  return <input placeholder={placeholder} {...register(name)} className={cx(inputClass, "h-7 w-36 text-xs")} />;
}
