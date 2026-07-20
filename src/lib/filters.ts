import { and, eq, gt, gte, ilike, inArray, isNull, isNotNull, lt, lte, ne, notInArray, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { z } from "zod";
import { customFieldValues, tickets, workItems } from "@/db/schema";

/**
 * Generic AND/OR filter engine (Part 2, dynamic config 2026-07-20). Field
 * registries are per-module (only "tickets" wired for the pilot — see
 * docs/features/dynamic-configuration.md); the condition tree, operators and
 * quick-filter mechanism are module-agnostic and reusable as-is.
 */

export const FILTER_OPERATORS = [
  "eq",
  "ne",
  "gt",
  "gte",
  "lt",
  "lte",
  "contains",
  "not_contains",
  "in",
  "not_in",
  "is_empty",
  "is_not_empty",
] as const;
export type FilterOperator = (typeof FILTER_OPERATORS)[number];

export type FieldType = "text" | "number" | "date" | "select" | "boolean" | "user" | "company" | "contact";

const filterConditionSchema = z.object({
  field: z.string().trim().min(1),
  operator: z.enum(FILTER_OPERATORS),
  value: z.unknown().optional(),
});
export type FilterCondition = z.output<typeof filterConditionSchema>;

export type FilterGroup = {
  logic: "AND" | "OR";
  conditions: (FilterCondition | FilterGroup)[];
};

export const filterGroupSchema: z.ZodType<FilterGroup> = z.lazy(() =>
  z.object({
    logic: z.enum(["AND", "OR"]),
    conditions: z.array(z.union([filterConditionSchema, filterGroupSchema])).default([]),
  }),
);

function isGroup(c: FilterCondition | FilterGroup): c is FilterGroup {
  return "logic" in c;
}

/** A module's filterable fields: key -> column + type (+ options for selects). */
export type FieldDefinition = {
  key: string;
  label: string;
  type: FieldType;
  column: AnyPgColumn | SQL;
  options?: { value: string; label: string }[];
};

/** Client-safe view of a field registry — drops the raw Drizzle column (has
 * circular table<->column references; crashes RSC serialization if it ever
 * crosses the server/client boundary as a prop). UI components only need
 * key/label/type/options. */
export type PublicFieldDefinition = Omit<FieldDefinition, "column">;
export function toPublicFields(registry: Record<string, FieldDefinition>): Record<string, PublicFieldDefinition> {
  const out: Record<string, PublicFieldDefinition> = {};
  for (const [key, f] of Object.entries(registry)) {
    out[key] = { key: f.key, label: f.label, type: f.type, options: f.options };
  }
  return out;
}

/** Tickets field registry — the pilot module. Custom fields are appended at call time (see buildFieldRegistry). */
export const TICKET_FIELDS: Record<string, FieldDefinition> = {
  status: { key: "status", label: "Estado", type: "select", column: workItems.status },
  priority: { key: "priority", label: "Prioridad", type: "select", column: workItems.priority },
  category: { key: "category", label: "Categoría", type: "text", column: tickets.category },
  subcategory: { key: "subcategory", label: "Subcategoría", type: "text", column: tickets.subcategory },
  billingStatus: { key: "billingStatus", label: "Estatus de cobro", type: "select", column: tickets.billingStatus },
  channel: { key: "channel", label: "Canal", type: "text", column: tickets.channel },
  companyId: { key: "companyId", label: "Empresa", type: "company", column: workItems.companyId },
  contactId: { key: "contactId", label: "Contacto", type: "contact", column: workItems.contactId },
  assigneeId: { key: "assigneeId", label: "Responsable", type: "user", column: workItems.assigneeId },
  createdAt: { key: "createdAt", label: "Creado", type: "date", column: workItems.createdAt },
  dueAt: { key: "dueAt", label: "Vence", type: "date", column: tickets.resolutionTargetAt },
  updatedAt: { key: "updatedAt", label: "Actualizado", type: "date", column: workItems.updatedAt },
};

/** Loads a module's field registry with its active custom fields appended as filterable "select"/"text"/etc fields. */
export async function buildFieldRegistry(
  base: Record<string, FieldDefinition>,
  customFields: { key: string; name: string; fieldType: string; options?: unknown }[],
): Promise<Record<string, FieldDefinition>> {
  const registry = { ...base };
  for (const f of customFields) {
    const type: FieldType =
      f.fieldType === "number" || f.fieldType === "decimal" || f.fieldType === "currency"
        ? "number"
        : f.fieldType === "date" || f.fieldType === "datetime" || f.fieldType === "time"
          ? "date"
          : f.fieldType === "checkbox"
            ? "boolean"
            : f.fieldType === "user"
              ? "user"
              : f.fieldType === "company"
                ? "company"
                : f.fieldType === "contact"
                  ? "contact"
                  : f.fieldType === "select" || f.fieldType === "multiselect" || f.fieldType === "radio"
                    ? "select"
                    : "text";
    const options = Array.isArray(f.options)
      ? (f.options as { value: string; label: string }[])
      : undefined;
    registry[`cf_${f.key}`] = {
      key: `cf_${f.key}`,
      label: f.name,
      type,
      // custom field conditions are resolved specially in conditionToSql (EXISTS against custom_field_values)
      column: sql`__custom_field__`,
      options,
    };
  }
  return registry;
}

function customFieldCondition(
  module: string,
  entityIdColumn: AnyPgColumn,
  fieldKey: string,
  operator: FilterOperator,
  value: unknown,
): SQL {
  const key = fieldKey.slice(3); // strip "cf_"
  const existsBase = sql`exists (
    select 1 from ${customFieldValues} cfv
    inner join custom_field_definitions cfd on cfd.id = cfv.field_id
    where cfv.module = ${module}
      and cfv.entity_id = ${entityIdColumn}
      and cfd.key = ${key}`;
  switch (operator) {
    case "is_empty":
      return sql`not exists (
        select 1 from ${customFieldValues} cfv2
        inner join custom_field_definitions cfd2 on cfd2.id = cfv2.field_id
        where cfv2.module = ${module} and cfv2.entity_id = ${entityIdColumn} and cfd2.key = ${key}
          and cfv2.value is not null)`;
    case "is_not_empty":
      return sql`${existsBase} and cfv.value is not null)`;
    case "eq":
      return sql`${existsBase} and cfv.value = ${JSON.stringify(value)}::jsonb)`;
    case "ne":
      return sql`${existsBase} and cfv.value != ${JSON.stringify(value)}::jsonb)`;
    case "contains":
      return sql`${existsBase} and cfv.value::text ilike ${`%${String(value)}%`})`;
    default:
      return sql`${existsBase})`;
  }
}

/** Translates one leaf condition into a drizzle SQL predicate for the given field registry. */
function conditionToSql(
  c: FilterCondition,
  registry: Record<string, FieldDefinition>,
  module: string,
  entityIdColumn: AnyPgColumn,
): SQL | undefined {
  const field = registry[c.field];
  if (!field) return undefined;

  if (field.key.startsWith("cf_")) {
    return customFieldCondition(module, entityIdColumn, field.key, c.operator, c.value);
  }

  const col = field.column as (typeof workItems)["status"];
  switch (c.operator) {
    case "eq":
      return eq(col, c.value as never);
    case "ne":
      return ne(col, c.value as never);
    case "gt":
      return gt(col, c.value as never);
    case "gte":
      return gte(col, c.value as never);
    case "lt":
      return lt(col, c.value as never);
    case "lte":
      return lte(col, c.value as never);
    case "contains":
      return ilike(col, `%${String(c.value)}%`);
    case "not_contains":
      return sql`${col} not ilike ${`%${String(c.value)}%`}`;
    case "in":
      return Array.isArray(c.value) && c.value.length > 0 ? inArray(col, c.value as never[]) : undefined;
    case "not_in":
      return Array.isArray(c.value) && c.value.length > 0 ? notInArray(col, c.value as never[]) : undefined;
    case "is_empty":
      return isNull(col);
    case "is_not_empty":
      return isNotNull(col);
    default:
      return undefined;
  }
}

/** Recursively builds a single SQL predicate from a filter tree (or undefined if the tree is empty). */
export function buildFilterSql(
  group: FilterGroup | null | undefined,
  registry: Record<string, FieldDefinition>,
  module: string,
  entityIdColumn: AnyPgColumn,
): SQL | undefined {
  if (!group || group.conditions.length === 0) return undefined;
  const parts = group.conditions
    .map((c) => (isGroup(c) ? buildFilterSql(c, registry, module, entityIdColumn) : conditionToSql(c, registry, module, entityIdColumn)))
    .filter((s): s is SQL => s !== undefined);
  if (parts.length === 0) return undefined;
  return group.logic === "OR" ? or(...parts) : and(...parts);
}

/** Quick filters (Part 2): fixed, one-click starting points. Evaluated the same way as a saved filter. */
export type QuickFilterKey = "mine" | "unassigned" | "pending" | "overdue" | "closed_recent" | "favorites";
export const QUICK_FILTERS: { key: QuickFilterKey; label: string }[] = [
  { key: "mine", label: "Mis elementos" },
  { key: "unassigned", label: "Sin asignar" },
  { key: "pending", label: "Pendientes" },
  { key: "overdue", label: "Vencidos" },
  { key: "closed_recent", label: "Cerrados recientemente" },
  { key: "favorites", label: "Favoritos" },
];

const ACTIVE_TICKET_STATUSES = [
  "new",
  "assigned",
  "in_progress",
  "waiting_customer",
  "waiting_third_party",
  "scheduled",
  "reopened",
  "pending_confirmation",
] as const;

/** Quick-filter SQL for Tickets. `favorites` needs a caller-supplied set of favorited ticket IDs (see helpdesk actions). */
export function quickFilterSql(
  key: QuickFilterKey,
  userId: number,
  favoriteIds: number[] = [],
): SQL | undefined {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  switch (key) {
    case "mine":
      return eq(workItems.assigneeId, userId);
    case "unassigned":
      return and(isNull(workItems.assigneeId), inArray(workItems.status, [...ACTIVE_TICKET_STATUSES]));
    case "pending":
      return inArray(workItems.status, [...ACTIVE_TICKET_STATUSES]);
    case "overdue":
      return and(
        inArray(workItems.status, [...ACTIVE_TICKET_STATUSES]),
        isNotNull(tickets.resolutionTargetAt),
        lt(tickets.resolutionTargetAt, now),
      );
    case "closed_recent":
      return and(inArray(workItems.status, ["closed", "cancelled"]), gte(workItems.updatedAt, weekAgo));
    case "favorites":
      return favoriteIds.length > 0 ? inArray(tickets.id, favoriteIds) : sql`false`;
    default:
      return undefined;
  }
}
