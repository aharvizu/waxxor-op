"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  CONFIG_MODULES,
  CUSTOM_FIELD_TYPES,
  FieldInUseError,
  createFieldDefinition,
  customFieldDefinitionSchema,
  deleteFieldDefinition,
  reorderFieldDefinitions,
  toggleFieldActive,
  updateFieldDefinition,
} from "@/lib/custom-fields";
import { type ActionState, businessError, parseForm, success, unexpectedError } from "@/lib/action-result";
import { requireRole } from "@/lib/session";

const SETTINGS_ROLES = ["superadmin", "administrator"] as const;

function refresh() {
  revalidatePath("/settings/custom-fields");
}

function fail(err: unknown): ActionState {
  if (err instanceof FieldInUseError) return businessError(err.message);
  if (err instanceof Error) return businessError(err.message);
  return unexpectedError(err);
}

/** Options arrive from the form as newline-separated "value|label" pairs. */
const optionsTextSchema = z.string().optional().transform((raw) => {
  if (!raw?.trim()) return undefined;
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [value, label] = line.split("|").map((s) => s.trim());
      return { value: value || label, label: label || value };
    });
});

const createSchema = customFieldDefinitionSchema
  .omit({ options: true, validations: true })
  .extend({
    optionsText: optionsTextSchema,
    minValue: z.coerce.number().optional(),
    maxValue: z.coerce.number().optional(),
    regex: z.string().optional(),
  });

function buildValidations(data: { minValue?: number; maxValue?: number; regex?: string }) {
  if (data.minValue === undefined && data.maxValue === undefined && !data.regex) return undefined;
  return { min: data.minValue, max: data.maxValue, regex: data.regex || undefined };
}

export async function createCustomField(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireRole(...SETTINGS_ROLES);
    const { data, error } = parseForm(createSchema, formData);
    if (error) return error;
    await createFieldDefinition(user.organizationId, Number(user.id), {
      ...data,
      options: data.optionsText,
      validations: buildValidations(data),
    });
    refresh();
    return success("Campo personalizado creado.");
  } catch (err) {
    return fail(err);
  }
}

const updateSchema = createSchema.partial().extend({ id: z.coerce.number().int().positive() });

export async function updateCustomField(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireRole(...SETTINGS_ROLES);
    const { data, error } = parseForm(updateSchema, formData);
    if (error) return error;
    const { id, optionsText, minValue, maxValue, regex, ...rest } = data;
    await updateFieldDefinition(user.organizationId, Number(user.id), id, {
      ...rest,
      options: optionsText,
      validations: buildValidations({ minValue, maxValue, regex }),
    });
    refresh();
    return success("Campo personalizado actualizado.");
  } catch (err) {
    return fail(err);
  }
}

const idSchema = z.object({ id: z.coerce.number().int().positive() });

export async function toggleCustomFieldActive(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireRole(...SETTINGS_ROLES);
    const { data, error } = parseForm(idSchema, formData);
    if (error) return error;
    await toggleFieldActive(user.organizationId, Number(user.id), data.id);
    refresh();
    return success();
  } catch (err) {
    return fail(err);
  }
}

export async function deleteCustomField(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireRole("superadmin");
    const { data, error } = parseForm(idSchema, formData);
    if (error) return error;
    await deleteFieldDefinition(user.organizationId, Number(user.id), data.id);
    refresh();
    return success("Campo personalizado eliminado.");
  } catch (err) {
    return fail(err);
  }
}

const reorderSchema = z.object({
  module: z.enum(CONFIG_MODULES as [string, ...string[]]),
  orderedIds: z.string(), // comma-separated ids
});

export async function reorderCustomFields(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireRole(...SETTINGS_ROLES);
    const { data, error } = parseForm(reorderSchema, formData);
    if (error) return error;
    const ids = data.orderedIds.split(",").map(Number).filter((n) => Number.isInteger(n));
    await reorderFieldDefinitions(user.organizationId, data.module as (typeof CONFIG_MODULES)[number], ids);
    refresh();
    return success();
  } catch (err) {
    return fail(err);
  }
}

export { CONFIG_MODULES, CUSTOM_FIELD_TYPES };
