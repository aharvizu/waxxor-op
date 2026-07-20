import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type DbExecutor } from "@/db";
import { customFieldDefinitions, customFieldValues } from "@/db/schema";
import { diffFields, recordAudit } from "@/lib/audit";

/**
 * Custom Fields engine (Part 4, dynamic config 2026-07-20) — generic across
 * every module in config_module (only "tickets" has UI wired — pilot
 * module). Definitions describe the field; values are stored per (module,
 * entityId, fieldId), one jsonb value each. See
 * docs/features/dynamic-configuration.md.
 */

export const CUSTOM_FIELD_TYPES = customFieldDefinitions.fieldType.enumValues;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];
export const CONFIG_MODULES = customFieldDefinitions.module.enumValues;
export type ConfigModule = (typeof CONFIG_MODULES)[number];

export type CustomFieldDefinition = typeof customFieldDefinitions.$inferSelect;

const keySchema = z
  .string()
  .trim()
  .min(1, "Clave requerida.")
  .max(60)
  .regex(/^[a-z][a-z0-9_]*$/, "Usa minúsculas, números y guion bajo, iniciando con una letra.");

const optionSchema = z.object({
  value: z.string().trim().min(1),
  label: z.string().trim().min(1),
  color: z.string().optional(),
});

export const customFieldDefinitionSchema = z.object({
  module: z.enum(CONFIG_MODULES as [ConfigModule, ...ConfigModule[]]),
  key: keySchema,
  name: z.string().trim().min(1, "Nombre requerido.").max(120),
  description: z.string().trim().max(500).optional().nullable(),
  helpText: z.string().trim().max(300).optional().nullable(),
  fieldType: z.enum(CUSTOM_FIELD_TYPES as [CustomFieldType, ...CustomFieldType[]]),
  // Checkbox semantics: "on"/"true" -> true, anything else (including absent)
  // -> false. The forms always pair these with a hidden fallback input placed
  // before the checkbox, so an unchecked box still submits an explicit
  // "false" instead of omitting the key (see custom-field-forms.tsx).
  required: z.preprocess((v) => v === true || v === "on" || v === "true", z.boolean()),
  visible: z.preprocess((v) => v === true || v === "on" || v === "true", z.boolean()),
  editable: z.preprocess((v) => v === true || v === "on" || v === "true", z.boolean()),
  placeholder: z.string().trim().max(200).optional().nullable(),
  defaultValue: z.unknown().optional().nullable(),
  groupName: z.string().trim().max(80).optional().nullable(),
  maxLength: z.number().int().positive().max(10_000).optional().nullable(),
  validations: z.object({ min: z.number().optional(), max: z.number().optional(), regex: z.string().optional() }).optional().nullable(),
  options: z.array(optionSchema).optional().nullable(),
  color: z.string().trim().optional().nullable(),
  icon: z.string().trim().optional().nullable(),
});
export type CustomFieldDefinitionInput = z.input<typeof customFieldDefinitionSchema>;

export const CUSTOM_FIELD_AUDITED = [
  "name", "description", "helpText", "required", "visible", "editable",
  "placeholder", "defaultValue", "groupName", "maxLength", "validations", "options", "color", "icon",
] as const;

export async function getFieldDefinitions(
  orgId: number,
  module: ConfigModule,
  opts: { activeOnly?: boolean } = {},
): Promise<CustomFieldDefinition[]> {
  const conditions = [eq(customFieldDefinitions.organizationId, orgId), eq(customFieldDefinitions.module, module)];
  if (opts.activeOnly) conditions.push(eq(customFieldDefinitions.isActive, true));
  return db
    .select()
    .from(customFieldDefinitions)
    .where(and(...conditions))
    .orderBy(asc(customFieldDefinitions.sortOrder), asc(customFieldDefinitions.id));
}

async function loadDefinition(tx: DbExecutor, orgId: number, id: number): Promise<CustomFieldDefinition> {
  const [row] = await tx
    .select()
    .from(customFieldDefinitions)
    .where(and(eq(customFieldDefinitions.id, id), eq(customFieldDefinitions.organizationId, orgId)));
  if (!row) throw new Error("El campo personalizado ya no existe.");
  return row;
}

export async function createFieldDefinition(
  orgId: number,
  userId: number,
  input: CustomFieldDefinitionInput,
): Promise<CustomFieldDefinition> {
  const data = customFieldDefinitionSchema.parse(input);
  return db.transaction(async (tx) => {
    const [max] = await tx
      .select({ max: sql<number>`coalesce(max(${customFieldDefinitions.sortOrder}), -1)` })
      .from(customFieldDefinitions)
      .where(and(eq(customFieldDefinitions.organizationId, orgId), eq(customFieldDefinitions.module, data.module)));
    const [created] = await tx
      .insert(customFieldDefinitions)
      .values({ ...data, organizationId: orgId, sortOrder: Number(max?.max ?? -1) + 1, createdById: userId })
      .returning();
    await recordAudit(tx, {
      organizationId: orgId,
      userId,
      entityType: "custom_field_definition",
      entityId: created.id,
      action: "create",
      metadata: { values: { module: data.module, key: data.key, fieldType: data.fieldType, name: data.name } },
    });
    return created;
  });
}

export async function updateFieldDefinition(
  orgId: number,
  userId: number,
  id: number,
  input: Partial<CustomFieldDefinitionInput>,
): Promise<void> {
  const patch = customFieldDefinitionSchema.partial().parse(input);
  await db.transaction(async (tx) => {
    const before = await loadDefinition(tx, orgId, id);
    const changes = diffFields(
      { organizationId: orgId, userId, entityType: "custom_field_definition", entityId: id },
      before,
      patch,
      CUSTOM_FIELD_AUDITED,
    );
    if (changes.length === 0) return;
    await tx.update(customFieldDefinitions).set({ ...patch, updatedAt: new Date() }).where(eq(customFieldDefinitions.id, id));
    await recordAudit(tx, changes);
  });
}

export async function toggleFieldActive(orgId: number, userId: number, id: number): Promise<boolean> {
  return db.transaction(async (tx) => {
    const before = await loadDefinition(tx, orgId, id);
    const next = !before.isActive;
    await tx.update(customFieldDefinitions).set({ isActive: next, updatedAt: new Date() }).where(eq(customFieldDefinitions.id, id));
    await recordAudit(tx, {
      organizationId: orgId,
      userId,
      entityType: "custom_field_definition",
      entityId: id,
      action: "update",
      field: "isActive",
      oldValue: String(before.isActive),
      newValue: String(next),
      metadata: { event: next ? "field_restored" : "field_archived" },
    });
    return next;
  });
}

/** Hard delete only if never used — otherwise archive instead (same convention as catalog_items). */
export class FieldInUseError extends Error {}
export async function deleteFieldDefinition(orgId: number, userId: number, id: number): Promise<void> {
  await db.transaction(async (tx) => {
    const before = await loadDefinition(tx, orgId, id);
    const [used] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(customFieldValues)
      .where(and(eq(customFieldValues.fieldId, id), sql`${customFieldValues.value} is not null`));
    if (used.n > 0) {
      throw new FieldInUseError("Este campo tiene datos capturados — archívalo en lugar de eliminarlo.");
    }
    await tx.delete(customFieldDefinitions).where(eq(customFieldDefinitions.id, id));
    await recordAudit(tx, {
      organizationId: orgId,
      userId,
      entityType: "custom_field_definition",
      entityId: id,
      action: "delete",
      metadata: { values: { module: before.module, key: before.key, name: before.name } },
    });
  });
}

export async function reorderFieldDefinitions(orgId: number, module: ConfigModule, orderedIds: number[]): Promise<void> {
  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await tx
        .update(customFieldDefinitions)
        .set({ sortOrder: i, updatedAt: new Date() })
        .where(
          and(
            eq(customFieldDefinitions.id, orderedIds[i]),
            eq(customFieldDefinitions.organizationId, orgId),
            eq(customFieldDefinitions.module, module),
          ),
        );
    }
  });
}

/* --------------------------------------------------------------- values */

export async function getValuesForEntity(
  orgId: number,
  module: ConfigModule,
  entityId: number,
): Promise<Record<string, unknown>> {
  const rows = await db
    .select({ key: customFieldDefinitions.key, value: customFieldValues.value })
    .from(customFieldValues)
    .innerJoin(customFieldDefinitions, eq(customFieldDefinitions.id, customFieldValues.fieldId))
    .where(and(eq(customFieldValues.organizationId, orgId), eq(customFieldValues.module, module), eq(customFieldValues.entityId, entityId)));
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/** Batch loader for table/list views — avoids N+1 across a page of rows. */
export async function getValuesForEntities(
  orgId: number,
  module: ConfigModule,
  entityIds: number[],
): Promise<Map<number, Record<string, unknown>>> {
  const result = new Map<number, Record<string, unknown>>();
  if (entityIds.length === 0) return result;
  const rows = await db
    .select({ entityId: customFieldValues.entityId, key: customFieldDefinitions.key, value: customFieldValues.value })
    .from(customFieldValues)
    .innerJoin(customFieldDefinitions, eq(customFieldDefinitions.id, customFieldValues.fieldId))
    .where(and(eq(customFieldValues.organizationId, orgId), eq(customFieldValues.module, module), inArray(customFieldValues.entityId, entityIds)));
  for (const r of rows) {
    const bucket = result.get(r.entityId) ?? {};
    bucket[r.key] = r.value;
    result.set(r.entityId, bucket);
  }
  return result;
}

export class FieldValidationError extends Error {
  constructor(public readonly fieldKey: string, message: string) {
    super(message);
  }
}

/** Per-type validation. Returns the normalized value to store, or throws FieldValidationError. */
export function validateFieldValue(field: CustomFieldDefinition, raw: unknown): unknown {
  const empty = raw === undefined || raw === null || raw === "";
  if (empty) {
    if (field.required) throw new FieldValidationError(field.key, `"${field.name}" es obligatorio.`);
    return null;
  }
  const validations = (field.validations ?? {}) as { min?: number; max?: number; regex?: string };
  switch (field.fieldType) {
    case "text":
    case "textarea":
    case "email":
    case "phone":
    case "url": {
      const s = String(raw).trim();
      if (field.maxLength && s.length > field.maxLength) {
        throw new FieldValidationError(field.key, `"${field.name}" excede la longitud máxima (${field.maxLength}).`);
      }
      if (field.fieldType === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) {
        throw new FieldValidationError(field.key, `"${field.name}" no es un correo válido.`);
      }
      if (field.fieldType === "url" && !/^https?:\/\/.+/.test(s)) {
        throw new FieldValidationError(field.key, `"${field.name}" no es una URL válida.`);
      }
      if (validations.regex && !new RegExp(validations.regex).test(s)) {
        throw new FieldValidationError(field.key, `"${field.name}" tiene un formato inválido.`);
      }
      return s;
    }
    case "number":
    case "decimal":
    case "currency": {
      const n = Number(raw);
      if (Number.isNaN(n)) throw new FieldValidationError(field.key, `"${field.name}" debe ser numérico.`);
      if (validations.min !== undefined && n < validations.min) {
        throw new FieldValidationError(field.key, `"${field.name}" debe ser mayor o igual a ${validations.min}.`);
      }
      if (validations.max !== undefined && n > validations.max) {
        throw new FieldValidationError(field.key, `"${field.name}" debe ser menor o igual a ${validations.max}.`);
      }
      return n;
    }
    case "checkbox":
      return raw === true || raw === "true" || raw === "on";
    case "date":
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(raw))) throw new FieldValidationError(field.key, `"${field.name}" requiere una fecha válida (AAAA-MM-DD).`);
      return String(raw);
    case "time":
      if (!/^\d{2}:\d{2}$/.test(String(raw))) throw new FieldValidationError(field.key, `"${field.name}" requiere una hora válida (HH:MM).`);
      return String(raw);
    case "datetime": {
      const d = new Date(String(raw));
      if (Number.isNaN(d.getTime())) throw new FieldValidationError(field.key, `"${field.name}" requiere fecha y hora válidas.`);
      return d.toISOString();
    }
    case "color":
      if (!/^#[0-9a-fA-F]{6}$/.test(String(raw))) throw new FieldValidationError(field.key, `"${field.name}" debe ser un color hex (#RRGGBB).`);
      return String(raw);
    case "select":
    case "radio": {
      const options = (field.options ?? []) as { value: string }[];
      if (!options.some((o) => o.value === raw)) {
        throw new FieldValidationError(field.key, `"${field.name}" tiene un valor no válido.`);
      }
      return String(raw);
    }
    case "multiselect": {
      const options = (field.options ?? []) as { value: string }[];
      const values = Array.isArray(raw) ? raw : [raw];
      for (const v of values) {
        if (!options.some((o) => o.value === v)) {
          throw new FieldValidationError(field.key, `"${field.name}" tiene un valor no válido.`);
        }
      }
      return values;
    }
    case "user":
    case "company":
    case "contact": {
      const n = Number(raw);
      if (!Number.isInteger(n) || n <= 0) throw new FieldValidationError(field.key, `"${field.name}" requiere una selección válida.`);
      return n;
    }
    default:
      return raw;
  }
}

/**
 * Validates and upserts every provided (key -> raw value) pair for one
 * entity. `values` may be a partial set (only fields present in the
 * submitted form) — fields not present are left untouched. Enforces
 * `editable`/`required` per field.
 */
export async function setValues(
  orgId: number,
  module: ConfigModule,
  entityId: number,
  values: Record<string, unknown>,
): Promise<void> {
  const defs = await getFieldDefinitions(orgId, module, { activeOnly: true });
  const byKey = new Map(defs.map((d) => [d.key, d]));

  const toWrite: { fieldId: number; value: unknown }[] = [];
  for (const [key, raw] of Object.entries(values)) {
    const field = byKey.get(key);
    if (!field || !field.editable) continue;
    toWrite.push({ fieldId: field.id, value: validateFieldValue(field, raw) });
  }
  // required fields not present in `values` at all still need a home to fail against
  for (const field of defs) {
    if (field.required && field.editable && !(field.key in values)) {
      validateFieldValue(field, null); // throws — required field never submitted
    }
  }

  if (toWrite.length === 0) return;
  await db.transaction(async (tx) => {
    for (const { fieldId, value } of toWrite) {
      await tx
        .insert(customFieldValues)
        .values({ organizationId: orgId, module, entityId, fieldId, value })
        .onConflictDoUpdate({
          target: [customFieldValues.module, customFieldValues.entityId, customFieldValues.fieldId],
          set: { value, updatedAt: new Date() },
        });
    }
  });
}
