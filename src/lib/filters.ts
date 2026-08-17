import { and, eq, gt, gte, ilike, inArray, isNull, isNotNull, lt, lte, ne, notInArray, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { z } from "zod";
import {
  activities,
  clientServices,
  companies,
  contacts,
  contracts,
  customFieldValues,
  projectMembers,
  projects,
  recurrenceDefinitions,
  tickets,
  vendors,
  workItems,
} from "@/db/schema";
import { ACTIVITY_STATUSES } from "@/lib/activities";
import { activityStatusMeta, ticketPriorityMeta } from "@/lib/labels";

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
  // Independent from dueAt/SLA — when the client asked for the work to happen on a specific day, not a deadline.
  scheduledFor: { key: "scheduledFor", label: "Fecha agendada", type: "date", column: workItems.dueDate },
  updatedAt: { key: "updatedAt", label: "Actualizado", type: "date", column: workItems.updatedAt },
};

/** Projects field registry — "configuración por entidad" over the same engine, no new machinery. */
export const PROJECT_FIELDS: Record<string, FieldDefinition> = {
  status: { key: "status", label: "Estado", type: "select", column: projects.status },
  healthStatus: { key: "healthStatus", label: "Salud", type: "select", column: projects.healthStatus },
  priority: { key: "priority", label: "Prioridad", type: "select", column: projects.priority },
  companyId: { key: "companyId", label: "Empresa", type: "company", column: projects.companyId },
  projectManagerId: { key: "projectManagerId", label: "Project Manager", type: "user", column: projects.projectManagerId },
  targetDate: { key: "targetDate", label: "Objetivo", type: "date", column: projects.targetDate },
  createdAt: { key: "createdAt", label: "Creado", type: "date", column: projects.createdAt },
  updatedAt: { key: "updatedAt", label: "Actualizado", type: "date", column: projects.updatedAt },
};

/** Activities field registry — shares the workItems columns with Tickets (same underlying work item). */
export const ACTIVITY_FIELDS: Record<string, FieldDefinition> = {
  status: {
    key: "status",
    label: "Estado",
    type: "select",
    column: workItems.status,
    options: ACTIVITY_STATUSES.map((s) => ({ value: s, label: activityStatusMeta[s]?.label ?? s })),
  },
  priority: {
    key: "priority",
    label: "Prioridad",
    type: "select",
    column: workItems.priority,
    options: Object.entries(ticketPriorityMeta).map(([value, m]) => ({ value, label: m.label })),
  },
  activityType: { key: "activityType", label: "Tipo", type: "select", column: activities.activityType },
  companyId: { key: "companyId", label: "Cliente", type: "company", column: workItems.companyId },
  assigneeId: { key: "assigneeId", label: "Responsable", type: "user", column: workItems.assigneeId },
  dueDate: { key: "dueDate", label: "Vence", type: "date", column: workItems.dueDate },
  createdAt: { key: "createdAt", label: "Creado", type: "date", column: workItems.createdAt },
  updatedAt: { key: "updatedAt", label: "Actualizado", type: "date", column: workItems.updatedAt },
};

/** Recurring field registry — "configuración por entidad" over the same engine, no new machinery. */
export const RECURRENCE_FIELDS: Record<string, FieldDefinition> = {
  status: { key: "status", label: "Estado", type: "select", column: recurrenceDefinitions.status },
  targetType: { key: "targetType", label: "Tipo", type: "select", column: recurrenceDefinitions.targetType },
  frequency: { key: "frequency", label: "Frecuencia", type: "select", column: recurrenceDefinitions.frequency },
  companyId: { key: "companyId", label: "Empresa", type: "company", column: recurrenceDefinitions.companyId },
  projectId: { key: "projectId", label: "Proyecto", type: "text", column: recurrenceDefinitions.projectId },
  assigneeId: { key: "assigneeId", label: "Responsable", type: "user", column: recurrenceDefinitions.assigneeId },
  nextRunAt: { key: "nextRunAt", label: "Próxima ejecución", type: "date", column: recurrenceDefinitions.nextRunAt },
  createdAt: { key: "createdAt", label: "Creado", type: "date", column: recurrenceDefinitions.createdAt },
  updatedAt: { key: "updatedAt", label: "Actualizado", type: "date", column: recurrenceDefinitions.updatedAt },
};

/**
 * Companies' aggregate "columns" — correlated subqueries, not real table
 * columns. Exported so the Empresas list page's own select clause uses the
 * exact same expressions as the field registry below (one definition, not
 * two copies that could drift).
 */
export const COMPANY_OPEN_TICKETS_SQL = sql<number>`(select count(*)::int from ${workItems} w
  where w.company_id = ${companies.id} and w.type = 'ticket'
  and w.status in ('new','assigned','in_progress','waiting_customer','waiting_third_party','scheduled','reopened'))`;

export const COMPANY_PENDING_BILLING_SQL = sql<number>`(select count(*)::int from ${tickets} t
  join ${workItems} w on w.id = t.work_item_id
  where w.company_id = ${companies.id} and t.billing_status = 'pending_review')`;

export const COMPANY_ACTIVE_SERVICES_SQL = sql<number>`(select count(*)::int from ${clientServices} cs
  where cs.company_id = ${companies.id} and cs.status = 'active')`;

export const COMPANY_NEXT_RENEWAL_SQL = sql<string | null>`(select min(d) from (
  select cs.renewal_date as d from ${clientServices} cs
    where cs.company_id = ${companies.id} and cs.status = 'active' and cs.renewal_date is not null
  union all
  select ct.end_date from ${contracts} ct
    where ct.company_id = ${companies.id} and ct.status = 'active' and ct.end_date is not null
) r)`;

export const COMPANY_LAST_TOUCH_SQL = sql<Date | null>`(select max(w.updated_at) from ${workItems} w
  where w.company_id = ${companies.id})`;

/** Companies field registry. Aggregate fields (open tickets, pending billing, …) are correlated subqueries — see the exported SQL above. */
export const COMPANY_FIELDS: Record<string, FieldDefinition> = {
  status: { key: "status", label: "Estado", type: "select", column: companies.status },
  industry: { key: "industry", label: "Industria", type: "text", column: companies.industry },
  website: { key: "website", label: "Sitio web", type: "text", column: companies.website },
  email: { key: "email", label: "Correo", type: "text", column: companies.email },
  phone: { key: "phone", label: "Teléfono", type: "text", column: companies.phone },
  city: { key: "city", label: "Ciudad", type: "text", column: companies.city },
  state: { key: "state", label: "Estado/provincia", type: "text", column: companies.state },
  country: { key: "country", label: "País", type: "text", column: companies.country },
  accountOwnerId: { key: "accountOwnerId", label: "Responsable de cuenta", type: "user", column: companies.accountOwnerId },
  defaultTechnicianId: { key: "defaultTechnicianId", label: "Técnico por defecto", type: "user", column: companies.defaultTechnicianId },
  openTickets: { key: "openTickets", label: "Tickets abiertos", type: "number", column: COMPANY_OPEN_TICKETS_SQL },
  pendingBilling: { key: "pendingBilling", label: "Facturación pendiente", type: "number", column: COMPANY_PENDING_BILLING_SQL },
  activeServices: { key: "activeServices", label: "Servicios activos", type: "number", column: COMPANY_ACTIVE_SERVICES_SQL },
  nextRenewal: { key: "nextRenewal", label: "Próxima renovación", type: "date", column: COMPANY_NEXT_RENEWAL_SQL },
  lastTouchAt: { key: "lastTouchAt", label: "Último contacto", type: "date", column: COMPANY_LAST_TOUCH_SQL },
  createdAt: { key: "createdAt", label: "Creado", type: "date", column: companies.createdAt },
  updatedAt: { key: "updatedAt", label: "Actualizado", type: "date", column: companies.updatedAt },
};

/** Contacts' aggregate "column" — same one-definition-not-two rationale as the Companies aggregates above. */
export const CONTACT_OPEN_TICKETS_SQL = sql<number>`(select count(*)::int from ${workItems} w
  where w.contact_id = ${contacts.id} and w.type = 'ticket'
  and w.status in ('new','assigned','in_progress','waiting_customer','waiting_third_party','scheduled','reopened'))`;

/** Contacts field registry. */
export const CONTACT_FIELDS: Record<string, FieldDefinition> = {
  contactType: { key: "contactType", label: "Tipo", type: "select", column: contacts.contactType },
  isActive: { key: "isActive", label: "Activo", type: "boolean", column: contacts.isActive },
  isPrimary: { key: "isPrimary", label: "Principal", type: "boolean", column: contacts.isPrimary },
  companyId: { key: "companyId", label: "Empresa", type: "company", column: contacts.companyId },
  jobTitle: { key: "jobTitle", label: "Puesto", type: "text", column: contacts.jobTitle },
  department: { key: "department", label: "Departamento", type: "text", column: contacts.department },
  openTickets: { key: "openTickets", label: "Tickets abiertos", type: "number", column: CONTACT_OPEN_TICKETS_SQL },
  createdAt: { key: "createdAt", label: "Creado", type: "date", column: contacts.createdAt },
  updatedAt: { key: "updatedAt", label: "Actualizado", type: "date", column: contacts.updatedAt },
};

/** Vendors' aggregate "column" — same one-definition-not-two rationale as Companies' aggregates above. */
export const VENDOR_ACTIVE_PURCHASES_SQL = sql<number>`(select count(*)::int from ${clientServices} cs
  where cs.vendor_id = ${vendors.id} and cs.status = 'active')`;

/** Vendors field registry. */
export const VENDOR_FIELDS: Record<string, FieldDefinition> = {
  status: { key: "status", label: "Estado", type: "select", column: vendors.status },
  category: { key: "category", label: "Categoría", type: "text", column: vendors.category },
  website: { key: "website", label: "Sitio web", type: "text", column: vendors.website },
  email: { key: "email", label: "Correo", type: "text", column: vendors.email },
  phone: { key: "phone", label: "Teléfono", type: "text", column: vendors.phone },
  city: { key: "city", label: "Ciudad", type: "text", column: vendors.city },
  country: { key: "country", label: "País", type: "text", column: vendors.country },
  accountOwnerId: { key: "accountOwnerId", label: "Responsable", type: "user", column: vendors.accountOwnerId },
  activePurchases: { key: "activePurchases", label: "Compras activas", type: "number", column: VENDOR_ACTIVE_PURCHASES_SQL },
  createdAt: { key: "createdAt", label: "Creado", type: "date", column: vendors.createdAt },
  updatedAt: { key: "updatedAt", label: "Actualizado", type: "date", column: vendors.updatedAt },
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

/**
 * Quick filters: fixed, one-click starting points. Each module's set reads
 * columns specific to it (workItems.assigneeId / tickets.resolutionTargetAt
 * for Tickets, projects.projectManagerId / projectMembers for Projects), so
 * the key sets don't generalize into one shared list — but the mechanism
 * (a `quick` key resolved to SQL at query time, evaluated the same way as a
 * saved filter) is shared. Projects' three keys (mine/active/at_risk) are
 * exactly the ones its five seeded views need — no advanced AND/OR builder
 * or parallel machinery invented for it.
 */
export type TicketQuickFilterKey = "mine" | "unassigned" | "pending" | "overdue" | "closed_recent";
export const TICKET_QUICK_FILTERS: { key: TicketQuickFilterKey; label: string }[] = [
  { key: "mine", label: "Mis elementos" },
  { key: "unassigned", label: "Sin asignar" },
  { key: "pending", label: "Pendientes" },
  { key: "overdue", label: "Vencidos" },
  { key: "closed_recent", label: "Cerrados recientemente" },
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

/** Quick-filter SQL for Tickets. */
export function ticketQuickFilterSql(key: TicketQuickFilterKey, userId: number): SQL | undefined {
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
    default:
      return undefined;
  }
}

const TERMINAL_PROJECT_STATUSES = ["completed", "cancelled", "archived"] as const;

export type ProjectQuickFilterKey = "mine" | "active" | "at_risk";
export const PROJECT_QUICK_FILTERS: { key: ProjectQuickFilterKey; label: string }[] = [
  { key: "mine", label: "Mis proyectos" },
  { key: "active", label: "Activos" },
  { key: "at_risk", label: "En riesgo" },
];

/** Quick-filter SQL for Projects — mirrors ticketQuickFilterSql's shape for the shared FilterBar. */
export function projectQuickFilterSql(key: ProjectQuickFilterKey, userId: number): SQL | undefined {
  switch (key) {
    case "mine":
      return and(
        or(
          eq(projects.projectManagerId, userId),
          sql`exists (select 1 from ${projectMembers} pm where pm.project_id = ${projects.id}
            and pm.user_id = ${userId} and pm.is_active)`,
        ),
        notInArray(projects.status, [...TERMINAL_PROJECT_STATUSES]),
      );
    case "active":
      return notInArray(projects.status, [...TERMINAL_PROJECT_STATUSES]);
    case "at_risk":
      return or(eq(projects.status, "at_risk"), eq(projects.healthStatus, "at_risk"));
    default:
      return undefined;
  }
}

export type ActivityQuickFilterKey = "mine" | "unassigned" | "overdue" | "no_date" | "completed";
export const ACTIVITY_QUICK_FILTERS: { key: ActivityQuickFilterKey; label: string }[] = [
  { key: "mine", label: "Mis actividades" },
  { key: "unassigned", label: "Sin asignar" },
  { key: "overdue", label: "Vencidas" },
  { key: "no_date", label: "Sin fecha" },
  { key: "completed", label: "Completadas" },
];

/** Quick-filter SQL for Activities — reads the same workItems columns Tickets does (shared work item). */
export function activityQuickFilterSql(key: ActivityQuickFilterKey, userId: number): SQL | undefined {
  const today = new Date().toISOString().slice(0, 10);
  switch (key) {
    case "mine":
      return eq(workItems.assigneeId, userId);
    case "unassigned":
      return isNull(workItems.assigneeId);
    case "overdue":
      return and(isNotNull(workItems.dueDate), lt(workItems.dueDate, today), notInArray(workItems.status, ["completed", "cancelled"]));
    case "no_date":
      return isNull(workItems.dueDate);
    case "completed":
      return eq(workItems.status, "completed");
    default:
      return undefined;
  }
}

export type RecurrenceQuickFilterKey = "mine" | "upcoming" | "today" | "overdue" | "errors" | "paused";
export const RECURRENCE_QUICK_FILTERS: { key: RecurrenceQuickFilterKey; label: string }[] = [
  { key: "mine", label: "Mis recurrencias" },
  { key: "upcoming", label: "Próximas" },
  { key: "today", label: "Hoy" },
  { key: "overdue", label: "Vencidas por ejecutar" },
  { key: "errors", label: "Con errores" },
  { key: "paused", label: "Pausadas" },
];

export type CompanyQuickFilterKey = "mine" | "renewal" | "open_tickets" | "pending_billing";
export const COMPANY_QUICK_FILTERS: { key: CompanyQuickFilterKey; label: string }[] = [
  { key: "mine", label: "Mis cuentas" },
  { key: "renewal", label: "Renovación ≤ 30 días" },
  { key: "open_tickets", label: "Tickets abiertos" },
  { key: "pending_billing", label: "Facturación pendiente" },
];

/** Quick-filter SQL for Companies — the same three conditions the list already offered as fixed pills, plus "Mis cuentas". */
export function companyQuickFilterSql(key: CompanyQuickFilterKey, userId: number): SQL | undefined {
  switch (key) {
    case "mine":
      return eq(companies.accountOwnerId, userId);
    case "renewal":
      return sql`${COMPANY_NEXT_RENEWAL_SQL} <= current_date + 30`;
    case "open_tickets":
      return sql`${COMPANY_OPEN_TICKETS_SQL} > 0`;
    case "pending_billing":
      return sql`${COMPANY_PENDING_BILLING_SQL} > 0`;
    default:
      return undefined;
  }
}

export type VendorQuickFilterKey = "mine" | "active" | "with_purchases";
export const VENDOR_QUICK_FILTERS: { key: VendorQuickFilterKey; label: string }[] = [
  { key: "mine", label: "Mis proveedores" },
  { key: "active", label: "Activos" },
  { key: "with_purchases", label: "Con compras activas" },
];

/** Quick-filter SQL for Vendors. */
export function vendorQuickFilterSql(key: VendorQuickFilterKey, userId: number): SQL | undefined {
  switch (key) {
    case "mine":
      return eq(vendors.accountOwnerId, userId);
    case "active":
      return eq(vendors.status, "active");
    case "with_purchases":
      return sql`${VENDOR_ACTIVE_PURCHASES_SQL} > 0`;
    default:
      return undefined;
  }
}

export type ContactQuickFilterKey = "active" | "inactive" | "primary" | "open_tickets";
export const CONTACT_QUICK_FILTERS: { key: ContactQuickFilterKey; label: string }[] = [
  { key: "active", label: "Activos" },
  { key: "inactive", label: "Archivados" },
  { key: "primary", label: "Principales" },
  { key: "open_tickets", label: "Con tickets abiertos" },
];

/** Quick-filter SQL for Contacts. */
export function contactQuickFilterSql(key: ContactQuickFilterKey): SQL | undefined {
  switch (key) {
    case "active":
      return eq(contacts.isActive, true);
    case "inactive":
      return eq(contacts.isActive, false);
    case "primary":
      return eq(contacts.isPrimary, true);
    case "open_tickets":
      return sql`${CONTACT_OPEN_TICKETS_SQL} > 0`;
    default:
      return undefined;
  }
}

/** Quick-filter SQL for Recurring. */
export function recurrenceQuickFilterSql(key: RecurrenceQuickFilterKey, userId: number): SQL | undefined {
  const now = new Date();
  const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  switch (key) {
    case "mine":
      return eq(recurrenceDefinitions.assigneeId, userId);
    case "upcoming":
      return and(eq(recurrenceDefinitions.status, "active"), sql`${recurrenceDefinitions.nextRunAt} between ${now} and ${in7}`);
    case "today": {
      const startOfDay = new Date(now);
      startOfDay.setUTCHours(0, 0, 0, 0);
      const endOfDay = new Date(now);
      endOfDay.setUTCHours(23, 59, 59, 999);
      return and(eq(recurrenceDefinitions.status, "active"), sql`${recurrenceDefinitions.nextRunAt} between ${startOfDay} and ${endOfDay}`);
    }
    case "overdue":
      return and(eq(recurrenceDefinitions.status, "active"), lte(recurrenceDefinitions.nextRunAt, now));
    case "errors":
      return or(eq(recurrenceDefinitions.status, "error"), sql`${recurrenceDefinitions.failedCount} > 0`);
    case "paused":
      return eq(recurrenceDefinitions.status, "paused");
    default:
      return undefined;
  }
}
