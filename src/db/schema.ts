import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  date,
  index,
  uniqueIndex,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const organizationStatus = pgEnum("organization_status", [
  "active",
  "inactive",
]);
export const userRole = pgEnum("user_role", [
  "superadmin",
  "administrator",
  "director",
  "project_manager",
  "technician",
  "client",
]);
export const workItemType = pgEnum("work_item_type", [
  "activity",
  "ticket",
  "project_activity",
]);
// Shared across specializations. Tickets use the first five, activities the
// rest (+ in_progress) — each module validates with its own Zod subset.
// Order is append-only (Postgres enum). "open" and "waiting_on_customer" are
// legacy ticket values migrated to "new"/"waiting_customer" in drizzle/0011.
export const workItemStatus = pgEnum("work_item_status", [
  "open",
  "in_progress",
  "waiting_on_customer",
  "waiting_third_party",
  "resolved",
  "closed",
  "pending",
  "waiting",
  "blocked",
  "completed",
  "cancelled",
  "archived",
  "new",
  "assigned",
  "waiting_customer",
  "scheduled",
  "pending_confirmation",
  "reopened",
]);
export const activityType = pgEnum("activity_type", [
  "general",
  "follow_up",
  "meeting",
  "research",
  "documentation",
  "training",
  "review",
  "implementation",
  "preventive",
  "administrative",
  "commercial",
  "reminder",
]);
export const workItemPriority = pgEnum("work_item_priority", [
  "low",
  "medium",
  "high",
  "critical",
]);
// Append-only: at_risk/archived added for the Projects feature (2026-07-17).
export const projectStatus = pgEnum("project_status", [
  "planning",
  "active",
  "on_hold",
  "completed",
  "cancelled",
  "at_risk",
  "archived",
]);
export const projectPriority = pgEnum("project_priority", [
  "low",
  "normal",
  "high",
  "urgent",
]);
export const projectHealth = pgEnum("project_health", [
  "on_track",
  "attention",
  "at_risk",
  "blocked",
  "completed",
  "not_set",
]);
export const projectMemberRole = pgEnum("project_member_role", [
  "manager",
  "coordinator",
  "contributor",
  "observer",
]);
export const projectListStatus = pgEnum("project_list_status", [
  "planned",
  "active",
  "completed",
  "archived",
]);
export const milestoneStatus = pgEnum("milestone_status", [
  "pending",
  "in_progress",
  "completed",
  "delayed",
  "cancelled",
]);
export const riskProbability = pgEnum("risk_probability", ["low", "medium", "high"]);
export const riskImpact = pgEnum("risk_impact", ["low", "medium", "high", "critical"]);
export const riskStatus = pgEnum("risk_status", [
  "open",
  "monitoring",
  "mitigated",
  "occurred",
  "closed",
]);
export const taskStatus = pgEnum("task_status", ["todo", "in_progress", "done"]);
export const quoteStatus = pgEnum("quote_status", [
  "draft",
  "sent",
  "accepted",
  "rejected",
  "expired",
]);
// Append-only: workflow states added for Reportes e Indicadores (2026-07-18).
export const reportStatus = pgEnum("report_status", [
  "draft",
  "sent",
  "generating",
  "ready_for_review",
  "changes_requested",
  "approved",
  "failed",
  "archived",
]);
export const reportType = pgEnum("report_type", [
  "monthly_service",
  "operational_summary",
  "executive_summary",
  "sla_report",
  "time_report",
  "project_report",
  "billing_support",
  "custom_internal",
]);
export const reportTemplateStatus = pgEnum("report_template_status", [
  "active",
  "inactive",
  "archived",
]);
export const confirmationType = pgEnum("confirmation_type", [
  "whatsapp",
  "phone",
  "email",
  "verbal",
  "no_response",
  "not_required",
]);
export const ticketBillingStatus = pgEnum("ticket_billing_status", [
  "pending_review",
  "included_in_contract",
  "billable",
  "contract_overage",
  "fixed_price",
  "no_charge",
  "included_in_monthly_charge",
  "charged",
]);
export const ticketBillingModality = pgEnum("ticket_billing_modality", [
  "remote",
  "onsite",
  "fixed_price",
  "not_applicable",
]);
export const conversationChannel = pgEnum("conversation_channel", [
  "manual",
  "whatsapp",
  "email",
  "phone",
  "portal",
  "internal",
  // Append-only: added for the Inbox feature (2026-07-18). No external
  // integration exists — see src/lib/channels.ts for adapter status.
  "teams",
  "api",
]);
export const messageDirection = pgEnum("message_direction", [
  "inbound",
  "outbound",
  "internal",
  // Append-only: system events (status changes, links) — Inbox 2026-07-18.
  "system",
]);
export const companyStatus = pgEnum("company_status", [
  "active",
  "inactive",
  "prospect_legacy",
  "archived",
]);
export const contactType = pgEnum("contact_type", [
  "owner",
  "primary",
  "technical",
  "administrative",
  "billing",
  "management",
  "requester",
  "other",
]);
export const serviceStatus = pgEnum("service_status", ["active", "inactive"]);
export const clientServiceType = pgEnum("client_service_type", [
  "recurring_service",
  "license",
  "support_contract",
  "one_time_service",
  "managed_service",
]);
export const supportCoverage = pgEnum("support_coverage", [
  "included",
  "incident_based",
  "hourly_bundle",
  "fixed_price",
  "not_applicable",
]);
export const clientServiceStatus = pgEnum("client_service_status", [
  "active",
  "cancelled",
  "archived",
]);
export const contractType = pgEnum("contract_type", [
  "support",
  "managed_service",
  "licensing",
  "consulting",
  "maintenance",
  "other",
]);
export const contractStatus = pgEnum("contract_status", [
  "draft",
  "active",
  "cancelled",
  "archived",
]);
export const reminderMarkStatus = pgEnum("reminder_mark_status", [
  "snoozed",
  "dismissed",
  "resolved",
]);
export const slaDefinitionStatus = pgEnum("sla_definition_status", [
  "active",
  "inactive",
]);
export const timeType = pgEnum("time_type", [
  "technical_work",
  "remote_support",
  "onsite_support",
  "travel",
  "waiting_customer",
  "waiting_provider",
  "research",
  "documentation",
  "meeting",
  "training",
  "administration",
  "commercial",
]);
export const billingStatus = pgEnum("billing_status", [
  "billable",
  "non_billable",
  "included_in_contract",
  "pending_review",
]);
export const timeModality = pgEnum("time_modality", [
  "remote",
  "onsite",
  "not_applicable",
]);

export const organizations = pgTable("organizations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  status: organizationStatus("status").notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizations.id),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: userRole("role").notNull().default("technician"),
  title: text("title"),
  phone: text("phone"),
  isActive: boolean("is_active").notNull().default(true),
  invitationToken: text("invitation_token").unique(),
  invitedAt: timestamp("invited_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * Company (formerly "Client"). Base entity for the future CRM's account
 * hierarchy — see docs/features/companies-contacts.md for the naming
 * convention (Company/Contact in code + APIs, "Empresa"/"Contacto" in UI)
 * and the Lead/Opportunity/Account preparation notes (2026-07-20).
 */
export const companies = pgTable("companies", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizations.id),
  name: text("name").notNull(),
  legalName: text("legal_name"),
  taxId: text("tax_id"),
  ownerName: text("owner_name"),
  industry: text("industry"),
  website: text("website"),
  contactName: text("contact_name"),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  country: text("country"),
  status: companyStatus("status").notNull().default("active"),
  tags: jsonb("tags").notNull().default([]),
  // no FK: contacts is defined after companies (circular) — validated in actions
  primaryContactId: integer("primary_contact_id"),
  accountOwnerId: integer("account_owner_id").references(() => users.id),
  defaultTechnicianId: integer("default_technician_id").references(() => users.id),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/** Contact — belongs to one primary Company today (1:N); see companyContacts below for N:M prep. */
export const contacts = pgTable(
  "contacts",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    jobTitle: text("job_title"),
    department: text("department"),
    email: text("email"),
    phone: text("phone"),
    mobile: text("mobile"),
    whatsappNumber: text("whatsapp_number"),
    contactType: contactType("contact_type").notNull().default("other"),
    isPrimary: boolean("is_primary").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("contacts_company_idx").on(table.organizationId, table.companyId)],
);

/**
 * N:M preparation (spec 2026-07-20): a contact belongs to one primary
 * company via contacts.companyId today, but a contact may need to relate to
 * several companies in the future without breaking that column. This table
 * is populated in lockstep with contacts.companyId (one row, isPrimary=true)
 * — no UI reads from it yet; it exists so the future many-to-many surface
 * has real historical data instead of a cold start.
 */
export const companyContacts = pgTable(
  "company_contacts",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    contactId: integer("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("company_contacts_unique_idx").on(table.companyId, table.contactId),
    index("company_contacts_contact_idx").on(table.contactId),
  ],
);

/** Global per-org service catalog (Microsoft 365, backup, soporte, …). */
export const services = pgTable("services", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizations.id),
  name: text("name").notNull(),
  category: text("category").notNull().default("general"),
  description: text("description"),
  scope: text("scope"),
  defaultRemoteRate: numeric("default_remote_rate", { precision: 12, scale: 2 }),
  defaultOnsiteRate: numeric("default_onsite_rate", { precision: 12, scale: 2 }),
  defaultFixedPrice: numeric("default_fixed_price", { precision: 12, scale: 2 }),
  defaultSlaDefinitionId: integer("default_sla_definition_id").references(
    () => slaDefinitions.id,
  ),
  isRenewable: boolean("is_renewable").notNull().default(false),
  status: serviceStatus("status").notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * A service contracted by a client. Licenses are rows with type "license"
 * (provider/cost/cycle columns) — no separate entity needed. The same service
 * can appear multiple times with different conditions (e.g. M365 with and
 * without support policy). "expiring"/"expired" are DERIVED from dates.
 */
export const clientServices = pgTable(
  "client_services",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    serviceId: integer("service_id")
      .notNull()
      .references(() => services.id),
    serviceType: clientServiceType("service_type").notNull().default("recurring_service"),
    status: clientServiceStatus("status").notNull().default("active"),
    quantity: integer("quantity"),
    provider: text("provider"),
    billingCycle: text("billing_cycle"),
    cost: numeric("cost", { precision: 12, scale: 2 }),
    clientPrice: numeric("client_price", { precision: 12, scale: 2 }),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    renewalDate: date("renewal_date"),
    supportCoverage: supportCoverage("support_coverage").notNull().default("not_applicable"),
    includedHours: integer("included_hours"),
    remoteRate: numeric("remote_rate", { precision: 12, scale: 2 }),
    onsiteRate: numeric("onsite_rate", { precision: 12, scale: 2 }),
    fixedPrice: numeric("fixed_price", { precision: 12, scale: 2 }),
    slaDefinitionId: integer("sla_definition_id").references(() => slaDefinitions.id),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("client_services_client_idx").on(table.organizationId, table.companyId),
    index("client_services_renewal_idx").on(table.renewalDate),
  ],
);

export const contracts = pgTable(
  "contracts",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    contractType: contractType("contract_type").notNull().default("support"),
    status: contractStatus("status").notNull().default("draft"),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    autoRenew: boolean("auto_renew").notNull().default(false),
    includedHours: integer("included_hours"),
    monthlyAmount: numeric("monthly_amount", { precision: 12, scale: 2 }),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("contracts_client_idx").on(table.organizationId, table.companyId),
    index("contracts_end_idx").on(table.endDate),
  ],
);

/** Internal client notes (author-editable, audited). */
export const clientNotes = pgTable(
  "client_notes",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    authorId: integer("author_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull(),
    editedAt: timestamp("edited_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("client_notes_client_idx").on(table.organizationId, table.companyId)],
);

export const workItems = pgTable(
  "work_items",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id),
    type: workItemType("type").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    status: workItemStatus("status").notNull().default("open"),
    priority: workItemPriority("priority").notNull().default("medium"),
    companyId: integer("company_id").references(() => companies.id),
    // New (2026-07-20): a specific contact on the company, distinct from the
    // legacy free-text tickets.contact — see docs/features/companies-contacts.md.
    // Nullable, additive; the old text field is never dropped.
    contactId: integer("contact_id").references(() => contacts.id),
    assigneeId: integer("assignee_id").references(() => users.id),
    // nullable so deleting a user is still blocked/allowed exactly as before
    createdById: integer("created_by_id").references(() => users.id),
    startDate: date("start_date"),
    dueDate: date("due_date"),
    completedAt: timestamp("completed_at"),
    estimatedMinutes: integer("estimated_minutes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("work_items_org_idx").on(table.organizationId),
    index("work_items_type_idx").on(table.type),
    index("work_items_status_idx").on(table.status),
    index("work_items_priority_idx").on(table.priority),
    index("work_items_client_idx").on(table.companyId),
    index("work_items_contact_idx").on(table.contactId),
    index("work_items_assignee_idx").on(table.assigneeId),
    index("work_items_due_date_idx").on(table.dueDate),
  ],
);

/**
 * Configurable SLA policies. Assignment snapshots into the ticket, so editing
 * a definition never retroactively changes existing tickets.
 */
export const slaDefinitions = pgTable(
  "sla_definitions",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    description: text("description"),
    priority: workItemPriority("priority").notNull(),
    firstResponseMinutes: integer("first_response_minutes").notNull(),
    resolutionMinutes: integer("resolution_minutes").notNull(),
    businessHoursOnly: boolean("business_hours_only").notNull().default(false),
    isDefault: boolean("is_default").notNull().default(false),
    status: slaDefinitionStatus("status").notNull().default("active"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("sla_definitions_org_idx").on(table.organizationId),
    index("sla_definitions_priority_idx").on(table.priority),
    index("sla_definitions_status_idx").on(table.status),
    index("sla_definitions_default_idx").on(table.isDefault),
  ],
);

/**
 * One simple work calendar per organization (MVP). work_days: ISO weekday
 * numbers (1=Mon…7=Sun); start/end as minutes from midnight in `timezone`.
 * holidays is prepared for the future and not evaluated yet.
 */
export const businessCalendars = pgTable("business_calendars", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .unique()
    .references(() => organizations.id),
  timezone: text("timezone").notNull().default("America/Mexico_City"),
  workDays: jsonb("work_days").notNull().default([1, 2, 3, 4, 5]),
  workStartMinute: integer("work_start_minute").notNull().default(540),
  workEndMinute: integer("work_end_minute").notNull().default(1080),
  holidays: jsonb("holidays").notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Helpdesk specialization, 1:1 with a work_items row (type "ticket").
 * tickets.id stays the visible ticket number (#id). Category/subcategory/
 * channel/SLA/billing/confirmation columns are deferred until their business
 * rules exist (OQ-03/OQ-09) — see docs/architecture/work-item-model.md.
 */
export const tickets = pgTable(
  "tickets",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id),
    workItemId: integer("work_item_id")
      .notNull()
      .unique()
      .references(() => workItems.id),
    // Immutable, sequence-generated inside the creating transaction (ticket_folio_seq).
    folio: text("folio").notNull().unique(),
    // Provisional free-text/select values until catalogs exist (OQ-09).
    category: text("category"),
    subcategory: text("subcategory"),
    channel: text("channel"),
    modality: text("modality"),
    contact: text("contact"),
    firstResponseAt: timestamp("first_response_at"),
    resolvedAt: timestamp("resolved_at"),
    closedAt: timestamp("closed_at"),
    // --- SLA snapshot: frozen at assignment; definition edits never leak back.
    slaDefinitionId: integer("sla_definition_id").references(() => slaDefinitions.id),
    slaName: text("sla_name"),
    slaFirstResponseMinutes: integer("sla_first_response_minutes"),
    slaResolutionMinutes: integer("sla_resolution_minutes"),
    slaBusinessHoursOnly: boolean("sla_business_hours_only"),
    slaTimezone: text("sla_timezone"),
    slaCalendar: jsonb("sla_calendar"),
    firstResponseTargetAt: timestamp("first_response_target_at"),
    resolutionTargetAt: timestamp("resolution_target_at"),
    // Pause accounting: a single open-pause column makes concurrent pauses impossible.
    slaPausedMinutes: integer("sla_paused_minutes").notNull().default(0),
    slaPausedAt: timestamp("sla_paused_at"),
    // Resolution & closure
    resolution: text("resolution"),
    // Confirmation (confirmed_by_contact_id is prepared: no Contact entity yet)
    confirmationType: confirmationType("confirmation_type"),
    confirmationAt: timestamp("confirmation_at"),
    confirmedByContactId: integer("confirmed_by_contact_id"),
    confirmationNotes: text("confirmation_notes"),
    confirmationChannel: text("confirmation_channel"),
    lastContactAttemptAt: timestamp("last_contact_attempt_at"),
    // Reopen tracking (full history lives in audit_logs)
    reopenCount: integer("reopen_count").notNull().default(0),
    lastReopenedAt: timestamp("last_reopened_at"),
    lastReopenReason: text("last_reopen_reason"),
    // Closing without time requires an audited exception
    timeExceptionReason: text("time_exception_reason"),
    timeExceptionById: integer("time_exception_by_id").references(() => users.id),
    timeExceptionAt: timestamp("time_exception_at"),
    // Final SLA compliance, frozen at close
    slaFirstResponseMet: boolean("sla_first_response_met"),
    slaResolutionMet: boolean("sla_resolution_met"),
    // Operational billing classification (no invoicing)
    billingStatus: ticketBillingStatus("billing_status").notNull().default("pending_review"),
    billingModality: ticketBillingModality("billing_modality").notNull().default("not_applicable"),
    hourlyRate: numeric("hourly_rate", { precision: 12, scale: 2 }),
    fixedAmount: numeric("fixed_amount", { precision: 12, scale: 2 }),
    calculatedAmount: numeric("calculated_amount", { precision: 12, scale: 2 }),
    billingPeriod: text("billing_period"),
    externalReference: text("external_reference"),
    billingNotes: text("billing_notes"),
    billingDeterminedById: integer("billing_determined_by_id").references(() => users.id),
    billingDeterminedAt: timestamp("billing_determined_at"),
  },
  (table) => [
    index("tickets_first_response_target_idx").on(table.firstResponseTargetAt),
    index("tickets_resolution_target_idx").on(table.resolutionTargetAt),
    index("tickets_billing_status_idx").on(table.billingStatus),
  ],
);

/**
 * Standalone-activity specialization, 1:1 with a work_items row (type "activity").
 * recurrence_template_id is unused: E-10 (Recurrences, 2026-07-18) shipped a
 * different model (recurrenceDefinitions) and tracks generated activities via
 * audit_logs.metadata.generatedByRecurrenceId instead — no FK back onto this column.
 */
export const activities = pgTable("activities", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizations.id),
  workItemId: integer("work_item_id")
    .notNull()
    .unique()
    .references(() => workItems.id),
  activityType: activityType("activity_type").notNull().default("general"),
  recurrenceTemplateId: integer("recurrence_template_id"),
  archivedAt: timestamp("archived_at"),
  // Conversion tombstone: set when this activity became a ticket. The row is
  // kept (deactivated) so old activity links can redirect to the ticket.
  convertedTicketId: integer("converted_ticket_id").references(() => tickets.id),
  convertedAt: timestamp("converted_at"),
  // Related-activity link: this activity supports the given ticket (PRD R3
  // keeps tickets out of projects; activities linked here can't join projects).
  parentTicketId: integer("parent_ticket_id").references(() => tickets.id),
  // Project membership (2026-07-17): a project activity always has BOTH
  // projectId and projectListId; mutually exclusive with parentTicketId.
  projectId: integer("project_id").references(() => projects.id),
  projectListId: integer("project_list_id").references(() => projectLists.id),
  // Subactivity: max two levels — a parent activity can never itself have a parent.
  parentActivityId: integer("parent_activity_id").references(
    (): AnyPgColumn => activities.id,
  ),
});

/**
 * Manual time sessions against any work item (activity or ticket). One row per
 * technician; multi-tech sessions create one row each. Voiding (voided_at)
 * replaces deletion; only SuperAdmin may hard-delete. Totals are always
 * computed with SUM — never stored elsewhere.
 */
export const timeEntries = pgTable(
  "time_entries",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id),
    workItemId: integer("work_item_id")
      .notNull()
      .references(() => workItems.id),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    date: date("date").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    timeType: timeType("time_type").notNull().default("technical_work"),
    billingStatus: billingStatus("billing_status").notNull().default("pending_review"),
    modality: timeModality("modality").notNull().default("not_applicable"),
    description: text("description").notNull(),
    result: text("result"),
    hourlyRate: numeric("hourly_rate", { precision: 12, scale: 2 }),
    internalHourlyCost: numeric("internal_hourly_cost", { precision: 12, scale: 2 }),
    calculatedAmount: numeric("calculated_amount", { precision: 12, scale: 2 }),
    calculatedInternalCost: numeric("calculated_internal_cost", {
      precision: 12,
      scale: 2,
    }),
    voidedAt: timestamp("voided_at"),
    createdById: integer("created_by_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("time_entries_org_idx").on(table.organizationId),
    index("time_entries_work_item_idx").on(table.workItemId),
    index("time_entries_user_idx").on(table.userId),
    index("time_entries_date_idx").on(table.date),
    index("time_entries_billing_idx").on(table.billingStatus),
    index("time_entries_type_idx").on(table.timeType),
  ],
);

/**
 * One conversation thread per ticket (MVP: manual logging only — nothing is
 * sent externally; the model is channel-ready for WhatsApp/email later).
 * contact_id columns are prepared: the Contact entity doesn't exist yet.
 */
export const conversations = pgTable(
  "conversations",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id),
    companyId: integer("company_id").references(() => companies.id),
    // Real FK since 2026-07-20 (was prepared-but-unconstrained before Contact existed).
    contactId: integer("contact_id").references(() => contacts.id),
    /**
     * Optional since Inbox (2026-07-18): a conversation may relate to a
     * ticket, an activity (workItemId), a company and/or a project. A ticket
     * still has at most ONE conversation (unique holds on non-null values).
     */
    ticketId: integer("ticket_id")
      .unique()
      .references(() => tickets.id, { onDelete: "cascade" }),
    workItemId: integer("work_item_id").references(() => workItems.id),
    projectId: integer("project_id").references(() => projects.id),
    subject: text("subject"),
    channel: conversationChannel("channel").notNull().default("manual"),
    /** open | pending | closed | archived (legacy "attended" migrated to closed). */
    status: text("status").notNull().default("open"),
    createdById: integer("created_by_id").references(() => users.id),
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("conversations_org_idx").on(table.organizationId),
    index("conversations_org_status_idx").on(table.organizationId, table.status),
    index("conversations_client_idx").on(table.companyId),
    index("conversations_project_idx").on(table.projectId),
    index("conversations_work_item_idx").on(table.workItemId),
  ],
);

/**
 * Per-user state of a conversation: read cursor, pin and favorite. Child table
 * (no organization_id) — every access goes through its conversation, which is
 * org-scoped. Rows are created lazily on first interaction.
 */
export const conversationParticipants = pgTable(
  "conversation_participants",
  {
    id: serial("id").primaryKey(),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lastReadAt: timestamp("last_read_at"),
    pinnedAt: timestamp("pinned_at"),
    favoriteAt: timestamp("favorite_at"),
    addedById: integer("added_by_id").references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("conversation_participants_unique_idx").on(table.conversationId, table.userId),
    index("conversation_participants_user_idx").on(table.userId),
  ],
);

/**
 * Explicit user mentions inside a message (selected in the composer, never
 * parsed heuristically). Feeds the "Menciones" filter and Today.
 */
export const messageMentions = pgTable(
  "message_mentions",
  {
    id: serial("id").primaryKey(),
    messageId: integer("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("message_mentions_unique_idx").on(table.messageId, table.userId),
    index("message_mentions_user_idx").on(table.userId, table.readAt),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    direction: messageDirection("direction").notNull(),
    authorUserId: integer("author_user_id").references(() => users.id),
    // Real FK since 2026-07-20 (was prepared-but-unconstrained before Contact existed).
    contactId: integer("contact_id").references(() => contacts.id),
    body: text("body").notNull(),
    channel: conversationChannel("channel").notNull().default("manual"),
    occurredAt: timestamp("occurred_at").notNull().defaultNow(),
    editedAt: timestamp("edited_at"),
    /** Logical delete (Inbox): body hidden in UI, row and audit preserved. */
    deletedAt: timestamp("deleted_at"),
    deletedById: integer("deleted_by_id").references(() => users.id),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("messages_conversation_idx").on(table.conversationId),
    index("messages_occurred_idx").on(table.occurredAt),
  ],
);

/**
 * Attachment metadata only — blobs live outside Postgres. MVP storage is a
 * local-disk adapter (src/lib/attachments.ts); productive storage pending.
 */
export const attachments = pgTable(
  "attachments",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id),
    workItemId: integer("work_item_id").references(() => workItems.id),
    messageId: integer("message_id").references(() => messages.id),
    projectId: integer("project_id").references(() => projects.id),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    storageKey: text("storage_key").notNull().unique(),
    uploadedById: integer("uploaded_by_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("attachments_work_item_idx").on(table.workItemId)],
);

/**
 * Operational projects: Project → Lists → Activities → Subactivities.
 * Tickets NEVER belong to projects (PRD R3). companyId optional — internal
 * projects exist without a client. targetDate/budgetAmount map onto the
 * pre-existing due_date/budget columns (no destructive rename).
 */
export const projects = pgTable(
  "projects",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id),
    folio: text("folio").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    companyId: integer("company_id").references(() => companies.id),
    status: projectStatus("status").notNull().default("planning"),
    priority: projectPriority("priority").notNull().default("normal"),
    healthStatus: projectHealth("health_status").notNull().default("not_set"),
    projectManagerId: integer("project_manager_id").references(() => users.id),
    ownerId: integer("owner_id").references(() => users.id),
    startDate: date("start_date"),
    targetDate: date("due_date"),
    completedAt: timestamp("completed_at"),
    archivedAt: timestamp("archived_at"),
    estimatedMinutes: integer("estimated_minutes"),
    budgetAmount: numeric("budget", { precision: 12, scale: 2 }),
    billingType: text("billing_type"),
    color: text("color"),
    icon: text("icon"),
    createdById: integer("created_by_id").references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("projects_org_folio_idx").on(table.organizationId, table.folio),
    index("projects_org_idx").on(table.organizationId),
    index("projects_client_idx").on(table.companyId),
    index("projects_status_idx").on(table.status),
    index("projects_pm_idx").on(table.projectManagerId),
    index("projects_target_idx").on(table.targetDate),
  ],
);

export const projectMembers = pgTable(
  "project_members",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    role: projectMemberRole("role").notNull().default("contributor"),
    isActive: boolean("is_active").notNull().default(true),
    joinedAt: timestamp("joined_at").notNull().defaultNow(),
    removedAt: timestamp("removed_at"),
  },
  (table) => [
    uniqueIndex("project_members_unique_idx").on(table.projectId, table.userId),
    index("project_members_user_idx").on(table.userId),
  ],
);

/** Lists group activities inside a project (stages, areas, deliverables…). */
export const projectLists = pgTable(
  "project_lists",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    position: integer("position").notNull().default(0),
    status: projectListStatus("status").notNull().default("active"),
    startDate: date("start_date"),
    targetDate: date("target_date"),
    color: text("color"),
    createdById: integer("created_by_id").references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    archivedAt: timestamp("archived_at"),
  },
  (table) => [index("project_lists_project_idx").on(table.projectId)],
);

export const projectMilestones = pgTable(
  "project_milestones",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    targetDate: date("target_date").notNull(),
    status: milestoneStatus("status").notNull().default("pending"),
    completedAt: timestamp("completed_at"),
    ownerId: integer("owner_id").references(() => users.id),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("project_milestones_project_idx").on(table.projectId),
    index("project_milestones_target_idx").on(table.targetDate),
  ],
);

/** Optional link milestone ↔ activity (completing activities never auto-completes it). */
export const milestoneActivities = pgTable(
  "milestone_activities",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id),
    milestoneId: integer("milestone_id")
      .notNull()
      .references(() => projectMilestones.id, { onDelete: "cascade" }),
    activityId: integer("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("milestone_activities_unique_idx").on(table.milestoneId, table.activityId),
  ],
);

export const projectRisks = pgTable(
  "project_risks",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    probability: riskProbability("probability").notNull().default("medium"),
    impact: riskImpact("impact").notNull().default("medium"),
    // severity is DERIVED (riskSeverity in src/lib/projects.ts) — never stored
    status: riskStatus("status").notNull().default("open"),
    ownerId: integer("owner_id").references(() => users.id),
    mitigationPlan: text("mitigation_plan"),
    dueDate: date("due_date"),
    resolvedAt: timestamp("resolved_at"),
    createdById: integer("created_by_id").references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("project_risks_project_idx").on(table.projectId),
    index("project_risks_status_idx").on(table.status),
  ],
);

/**
 * Directed dependency between work items: blocker blocks blocked.
 * "blocks" and "blocked_by" are the two ends of the same row.
 */
export const workItemDependencies = pgTable(
  "work_item_dependencies",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id),
    blockerWorkItemId: integer("blocker_work_item_id")
      .notNull()
      .references(() => workItems.id, { onDelete: "cascade" }),
    blockedWorkItemId: integer("blocked_work_item_id")
      .notNull()
      .references(() => workItems.id, { onDelete: "cascade" }),
    createdById: integer("created_by_id").references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("work_item_dependencies_unique_idx").on(
      table.blockerWorkItemId,
      table.blockedWorkItemId,
    ),
    index("work_item_dependencies_blocked_idx").on(table.blockedWorkItemId),
  ],
);

/** Project-level comments (work-item comments stay on their work item). */
export const projectComments = pgTable(
  "project_comments",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    authorId: integer("author_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull(),
    editedAt: timestamp("edited_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("project_comments_project_idx").on(table.projectId)],
);

export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizations.id),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  status: taskStatus("status").notNull().default("todo"),
  assigneeId: integer("assignee_id").references(() => users.id),
  dueDate: date("due_date"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const quotes = pgTable("quotes", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizations.id),
  title: text("title").notNull(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companies.id),
  status: quoteStatus("status").notNull().default("draft"),
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),
  taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  validUntil: date("valid_until"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const quoteItems = pgTable("quote_items", {
  id: serial("id").primaryKey(),
  quoteId: integer("quote_id")
    .notNull()
    .references(() => quotes.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull().default("1"),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull().default("0"),
  sortOrder: integer("sort_order").notNull().default(0),
});

/**
 * Report templates. Extended 2026-07-18 for operational reports: `sections`
 * (jsonb array of { key, title, enabled, intro? }) drives what a generated
 * report includes; the legacy free-text `content` column stays for the two
 * seeded document-style templates (kept as-is, see docs/features/report-templates.md).
 */
export const reportTemplates = pgTable("report_templates", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizations.id),
  name: text("name").notNull(),
  description: text("description"),
  content: text("content").notNull().default(""),
  reportType: reportType("report_type").notNull().default("monthly_service"),
  /** [{ key, title, enabled, intro? }] in display order */
  sections: jsonb("sections"),
  defaultPeriodRule: text("default_period_rule"),
  includeLogo: boolean("include_logo").notNull().default(true),
  includeCover: boolean("include_cover").notNull().default(true),
  includeExecutiveSummary: boolean("include_executive_summary").notNull().default(true),
  includeConclusions: boolean("include_conclusions").notNull().default(true),
  includeRecommendations: boolean("include_recommendations").notNull().default(false),
  status: reportTemplateStatus("status").notNull().default("active"),
  createdById: integer("created_by_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  archivedAt: timestamp("archived_at"),
});

/**
 * Operational reports (extended 2026-07-18). `content` holds the deterministic,
 * editable narrative; contentSnapshot/metricsSnapshot freeze the generated data
 * so history never changes when operational data changes later. Full workflow:
 * draft → generating → ready_for_review → approved → sent (+ changes_requested,
 * failed, archived). See docs/features/reports.md.
 */
export const reports = pgTable(
  "reports",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id),
    title: text("title").notNull(),
    content: text("content").notNull().default(""),
    status: reportStatus("status").notNull().default("draft"),
    templateId: integer("template_id").references(() => reportTemplates.id, {
      onDelete: "set null",
    }),
    companyId: integer("company_id").references(() => companies.id),
    projectId: integer("project_id").references(() => projects.id),
    reportType: reportType("report_type").notNull().default("custom_internal"),
    description: text("description"),
    periodStart: date("period_start"),
    periodEnd: date("period_end"),
    responsibleUserId: integer("responsible_user_id").references(() => users.id),
    generatedByUserId: integer("generated_by_user_id").references(() => users.id),
    reviewedByUserId: integer("reviewed_by_user_id").references(() => users.id),
    approvedByUserId: integer("approved_by_user_id").references(() => users.id),
    sentByUserId: integer("sent_by_user_id").references(() => users.id),
    generatedAt: timestamp("generated_at"),
    reviewedAt: timestamp("reviewed_at"),
    approvedAt: timestamp("approved_at"),
    sentAt: timestamp("sent_at"),
    archivedAt: timestamp("archived_at"),
    deliveryChannel: text("delivery_channel"),
    recipientContactId: integer("recipient_contact_id").references(() => contacts.id),
    subject: text("subject"),
    executiveSummary: text("executive_summary"),
    conclusions: text("conclusions"),
    recommendations: text("recommendations"),
    /** never included in external output — see docs/features/report-generation.md */
    internalNotes: text("internal_notes"),
    contentSnapshot: jsonb("content_snapshot"),
    metricsSnapshot: jsonb("metrics_snapshot"),
    failureReason: text("failure_reason"),
    version: integer("version").notNull().default(1),
    createdById: integer("created_by_id").references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("reports_org_status_idx").on(table.organizationId, table.status),
    index("reports_client_idx").on(table.companyId),
    index("reports_project_idx").on(table.projectId),
    index("reports_responsible_idx").on(table.responsibleUserId),
    index("reports_period_idx").on(table.periodEnd),
  ],
);

/**
 * Immutable evidence per report version: approving/sending always points at a
 * specific version; regenerating after edits creates the next one. Never
 * overwritten. See docs/features/report-versioning.md.
 */
export const reportVersions = pgTable(
  "report_versions",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id),
    reportId: integer("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    contentSnapshot: jsonb("content_snapshot"),
    metricsSnapshot: jsonb("metrics_snapshot"),
    narrative: text("narrative"),
    executiveSummary: text("executive_summary"),
    conclusions: text("conclusions"),
    recommendations: text("recommendations"),
    authorId: integer("author_id").references(() => users.id),
    changeReason: text("change_reason"),
    approvedByUserId: integer("approved_by_user_id").references(() => users.id),
    approvedAt: timestamp("approved_at"),
    sentAt: timestamp("sent_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("report_versions_unique_idx").on(table.reportId, table.versionNumber),
  ],
);

/**
 * Per-organization indicator thresholds (key → numeric value). Defaults live
 * in src/lib/indicators.ts (INDICATOR_THRESHOLD_DEFAULTS); a row here overrides
 * one key. Editable by SuperAdmin/Administrator only, audited.
 */
export const indicatorThresholds = pgTable(
  "indicator_thresholds",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id),
    key: text("key").notNull(),
    value: numeric("value", { precision: 12, scale: 2 }).notNull(),
    updatedById: integer("updated_by_id").references(() => users.id),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("indicator_thresholds_unique_idx").on(table.organizationId, table.key),
  ],
);

/**
 * Organization-level configuration, one row per (org, section key). The jsonb
 * value is validated by the per-key Zod schema in src/lib/settings.ts — never
 * written raw from the browser.
 */
export const organizationSettings = pgTable(
  "organization_settings",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id),
    key: text("key").notNull(),
    value: jsonb("value").notNull(),
    updatedById: integer("updated_by_id").references(() => users.id),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("organization_settings_unique_idx").on(table.organizationId, table.key),
  ],
);

/**
 * Shared org catalogs (ticket categories/subcategories, tags, project colors,
 * project templates...). One table for every kind — kinds live in
 * src/lib/settings.ts. Subcategories are rows whose parentId points at their
 * category. Items archive (isActive = false), they are never hard-deleted while
 * referenced by free-text fields.
 */
export const catalogItems = pgTable(
  "catalog_items",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    parentId: integer("parent_id"),
    color: text("color"),
    description: text("description"),
    config: jsonb("config"),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdById: integer("created_by_id").references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("catalog_items_org_kind_idx").on(table.organizationId, table.kind),
    uniqueIndex("catalog_items_unique_idx").on(
      table.organizationId,
      table.kind,
      sql`coalesce(${table.parentId}, 0)`,
      table.name,
    ),
  ],
);

/**
 * API key infrastructure (preparation only — no external service consumes them
 * yet). The plaintext token is shown exactly once at creation; only its SHA-256
 * hash is stored. Revocation is soft (revokedAt) for auditability.
 */
export const apiKeys = pgTable(
  "api_keys",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    prefix: text("prefix").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    createdById: integer("created_by_id").references(() => users.id),
    lastUsedAt: timestamp("last_used_at"),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("api_keys_org_idx").on(table.organizationId)],
);

export const kpis = pgTable("kpis", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizations.id),
  name: text("name").notNull(),
  unit: text("unit"),
  target: numeric("target", { precision: 12, scale: 2 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * "No olvides" persistence: reminders are COMPUTED from live data by rules
 * (src/lib/today-rules.ts); this table only stores user marks (snooze/dismiss/
 * resolve). A mark hides the reminder; if the condition re-triggers later
 * (conditionSince > actedAt) the reminder reappears. Org-wide by design.
 */
export const operationalReminders = pgTable(
  "operational_reminders",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id),
    ruleKey: text("rule_key").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: integer("entity_id").notNull(),
    status: reminderMarkStatus("status").notNull(),
    snoozedUntil: timestamp("snoozed_until"),
    actedById: integer("acted_by_id")
      .notNull()
      .references(() => users.id),
    actedAt: timestamp("acted_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("operational_reminders_identity_idx").on(
      table.organizationId,
      table.ruleKey,
      table.entityType,
      table.entityId,
    ),
  ],
);

/** Per-user UI preferences (Today scope/view/filters). One row per user. */
export const userPreferences = pgTable("user_preferences", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizations.id),
  userId: integer("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  today: jsonb("today").notNull().default({}),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id),
    // set null so audit rows never block deleting a user; the row itself remains.
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    entityType: text("entity_type").notNull(),
    entityId: integer("entity_id").notNull(),
    action: text("action").notNull(),
    field: text("field"),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    metadata: jsonb("metadata"),
    source: text("source").notNull().default("web"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("audit_logs_entity_idx").on(table.entityType, table.entityId),
    index("audit_logs_created_at_idx").on(table.createdAt),
  ],
);

export const kpiEntries = pgTable("kpi_entries", {
  id: serial("id").primaryKey(),
  kpiId: integer("kpi_id")
    .notNull()
    .references(() => kpis.id, { onDelete: "cascade" }),
  value: numeric("value", { precision: 12, scale: 2 }).notNull(),
  period: date("period").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/* ------------------------------------------------------------- Recurrence */

export const recurrenceTargetType = pgEnum("recurrence_target_type", [
  "activity",
  "ticket",
  "project_activity",
  "report",
]);
export const recurrenceStatus = pgEnum("recurrence_status", [
  "draft",
  "active",
  "paused",
  "completed",
  "expired",
  "error",
  "archived",
]);
export const recurrenceScheduleType = pgEnum("recurrence_schedule_type", [
  "interval",
  "calendar",
  "custom_rule",
]);
export const recurrenceFrequency = pgEnum("recurrence_frequency", [
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "semiannual",
  "annual",
  "weekdays",
  "custom",
]);
export const recurrenceExecutionStatus = pgEnum("recurrence_execution_status", [
  "pending",
  "running",
  "succeeded",
  "failed",
  "skipped",
  "cancelled",
  "duplicate_prevented",
]);
export const recurrenceExecutionSource = pgEnum("recurrence_execution_source", [
  "scheduler",
  "manual",
  "retry",
  "backfill",
]);

/**
 * A scheduled generator of operational work (Activity / Ticket / Project
 * Activity; Report reserved). Schedule fields are typed columns — only
 * templateData (the generated object's variable fields) lives in jsonb.
 * See docs/features/recurring.md.
 */
export const recurrenceDefinitions = pgTable(
  "recurrence_definitions",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    description: text("description"),
    targetType: recurrenceTargetType("target_type").notNull(),
    status: recurrenceStatus("status").notNull().default("draft"),
    timezone: text("timezone").notNull().default("America/Mexico_City"),
    scheduleType: recurrenceScheduleType("schedule_type").notNull().default("calendar"),
    frequency: recurrenceFrequency("frequency").notNull().default("monthly"),
    /** every N periods of the frequency (2 = every 2 days/weeks/months…) */
    interval: integer("interval").notNull().default(1),
    /** ISO weekdays 1–7 for weekly/custom, e.g. [1,3,5] */
    daysOfWeek: jsonb("days_of_week"),
    /** 1–31, or -1 = last day of month */
    dayOfMonth: integer("day_of_month"),
    /** 1–12 for annual */
    monthOfYear: integer("month_of_year"),
    /** with weekOfMonth: "first Monday" = weekOfMonth 1 + daysOfWeek [1] */
    weekOfMonth: integer("week_of_month"),
    /** "HH:MM" wall-clock time in `timezone` */
    timeOfDay: text("time_of_day").notNull().default("09:00"),
    startAt: date("start_at").notNull(),
    endAt: date("end_at"),
    maxOccurrences: integer("max_occurrences"),
    nextRunAt: timestamp("next_run_at"),
    lastRunAt: timestamp("last_run_at"),
    lastSuccessfulRunAt: timestamp("last_successful_run_at"),
    lastFailedRunAt: timestamp("last_failed_run_at"),
    occurrenceCount: integer("occurrence_count").notNull().default(0),
    successfulCount: integer("successful_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    skippedCount: integer("skipped_count").notNull().default(0),
    /** resets on success; at RECURRENCE_MAX_CONSECUTIVE_FAILURES → status error */
    consecutiveFailedCount: integer("consecutive_failed_count").notNull().default(0),
    companyId: integer("company_id").references(() => companies.id),
    projectId: integer("project_id").references(() => projects.id),
    projectListId: integer("project_list_id").references(() => projectLists.id),
    assigneeId: integer("assignee_id").references(() => users.id),
    createdById: integer("created_by_id").references(() => users.id),
    updatedById: integer("updated_by_id").references(() => users.id),
    /** target-type-discriminated template (title, description, priority, …) */
    templateData: jsonb("template_data").notNull(),
    generationRules: jsonb("generation_rules"),
    isActive: boolean("is_active").notNull().default(false),
    pauseReason: text("pause_reason"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    archivedAt: timestamp("archived_at"),
  },
  (table) => [
    index("recurrence_defs_due_idx").on(table.organizationId, table.status, table.nextRunAt),
    index("recurrence_defs_client_idx").on(table.companyId),
    index("recurrence_defs_project_idx").on(table.projectId),
    index("recurrence_defs_assignee_idx").on(table.assigneeId),
  ],
);

/**
 * One row per attempted occurrence. The UNIQUE (definition, occurrenceKey)
 * index is the idempotency guarantee: two concurrent processes can never both
 * generate the same occurrence. See docs/architecture/recurrence-idempotency.md.
 */
export const recurrenceExecutions = pgTable(
  "recurrence_executions",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id),
    recurrenceDefinitionId: integer("recurrence_definition_id")
      .notNull()
      .references(() => recurrenceDefinitions.id, { onDelete: "cascade" }),
    /** local occurrence date (YYYY-MM-DD) for scheduled/backfill; manual-<ts> for manual */
    occurrenceKey: text("occurrence_key").notNull(),
    scheduledFor: timestamp("scheduled_for").notNull(),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    status: recurrenceExecutionStatus("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    generatedEntityType: text("generated_entity_type"),
    generatedEntityId: integer("generated_entity_id"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    metadata: jsonb("metadata"),
    executedByUserId: integer("executed_by_user_id").references(() => users.id),
    executionSource: recurrenceExecutionSource("execution_source").notNull().default("scheduler"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("recurrence_exec_occurrence_idx").on(
      table.recurrenceDefinitionId,
      table.occurrenceKey,
    ),
    index("recurrence_exec_schedule_idx").on(table.recurrenceDefinitionId, table.scheduledFor),
    index("recurrence_exec_status_idx").on(table.organizationId, table.status),
  ],
);

/* ==================================================================== */
/* Knowledge Base & Help Center (E-Knowledge, 2026-07-19)                 */
/* ==================================================================== */

export const knowledgeArticleStatus = pgEnum("knowledge_article_status", [
  "draft",
  "in_review",
  "published",
  "archived",
]);

// "client" is modeled now (spec: "futura para cliente, sin portal todavía") but
// no client-facing surface reads it yet — every query in this feature filters
// to internal roles regardless of this column.
export const knowledgeVisibility = pgEnum("knowledge_visibility", ["internal", "client"]);

export const knowledgeRelationType = pgEnum("knowledge_relation_type", [
  "ticket",
  "company",
  "project",
  "activity",
]);

export const knowledgeCategories = pgTable(
  "knowledge_categories",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    color: text("color"),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdById: integer("created_by_id").references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("knowledge_categories_org_slug_idx").on(table.organizationId, table.slug),
  ],
);

/**
 * KB Operativa article. Content columns hold the CURRENT version denormalized
 * for fast reads; every save also inserts an immutable row into
 * knowledgeArticleVersions (same pattern as reports/report_versions — see
 * docs/architecture/report-snapshots.md for the rationale this mirrors).
 */
export const knowledgeArticles = pgTable(
  "knowledge_articles",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id),
    categoryId: integer("category_id").references(() => knowledgeCategories.id),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    status: knowledgeArticleStatus("status").notNull().default("draft"),
    visibility: knowledgeVisibility("visibility").notNull().default("internal"),
    tags: jsonb("tags").notNull().default([]),
    // Current content (denormalized from the latest version for fast reads).
    problem: text("problem"),
    cause: text("cause"),
    solution: text("solution"),
    steps: jsonb("steps").notNull().default([]),
    notes: text("notes"),
    anonymized: boolean("anonymized").notNull().default(false),
    currentVersion: integer("current_version").notNull().default(1),
    authorId: integer("author_id").references(() => users.id),
    reviewerId: integer("reviewer_id").references(() => users.id),
    reviewNotes: text("review_notes"),
    publishedAt: timestamp("published_at"),
    archivedAt: timestamp("archived_at"),
    // Where this article came from, when generated from a resolved ticket.
    sourceTicketId: integer("source_ticket_id").references(() => tickets.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("knowledge_articles_org_slug_idx").on(table.organizationId, table.slug),
    index("knowledge_articles_status_idx").on(table.organizationId, table.status),
    index("knowledge_articles_category_idx").on(table.categoryId),
  ],
);

export const knowledgeArticleVersions = pgTable(
  "knowledge_article_versions",
  {
    id: serial("id").primaryKey(),
    articleId: integer("article_id")
      .notNull()
      .references(() => knowledgeArticles.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    title: text("title").notNull(),
    problem: text("problem"),
    cause: text("cause"),
    solution: text("solution"),
    steps: jsonb("steps").notNull().default([]),
    notes: text("notes"),
    editedById: integer("edited_by_id").references(() => users.id),
    changeSummary: text("change_summary"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("knowledge_article_versions_unique_idx").on(table.articleId, table.versionNumber),
  ],
);

/**
 * Generic polymorphic relation (mirrors the recurrence targetType pattern):
 * one article can relate to many tickets/companies/projects/activities, and the
 * link created by the Ticket->KB flow is flagged isOrigin for that display.
 */
export const knowledgeArticleRelations = pgTable(
  "knowledge_article_relations",
  {
    id: serial("id").primaryKey(),
    articleId: integer("article_id")
      .notNull()
      .references(() => knowledgeArticles.id, { onDelete: "cascade" }),
    relatedType: knowledgeRelationType("related_type").notNull(),
    relatedId: integer("related_id").notNull(),
    isOrigin: boolean("is_origin").notNull().default(false),
    createdById: integer("created_by_id").references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("knowledge_article_relations_unique_idx").on(
      table.articleId,
      table.relatedType,
      table.relatedId,
    ),
    index("knowledge_article_relations_lookup_idx").on(table.relatedType, table.relatedId),
  ],
);

export const knowledgeArticleFavorites = pgTable(
  "knowledge_article_favorites",
  {
    id: serial("id").primaryKey(),
    articleId: integer("article_id")
      .notNull()
      .references(() => knowledgeArticles.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("knowledge_article_favorites_unique_idx").on(table.articleId, table.userId),
  ],
);

/**
 * Help Center content (how to use Watson itself). Deliberately NOT
 * organization-scoped: it documents the product's UI, identical for every
 * organization — same reasoning as system enums/labels, not tenant data.
 * User progress (below) is still per-user, which is where personalization lives.
 */
export const helpModule = pgEnum("help_module", [
  "today",
  "activities",
  "tickets",
  "projects",
  "companies",
  "recurring",
  "reports",
  "indicators",
  "settings",
  "inbox",
  "knowledge",
  // Appended 2026-07-20 (Company/Contact split) — separate module for the new Contacts area.
  "contacts",
]);

export const helpTutorials = pgTable(
  "help_tutorials",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    module: helpModule("module").notNull(),
    title: text("title").notNull(),
    objective: text("objective").notNull(),
    tips: jsonb("tips").notNull().default([]),
    commonMistakes: jsonb("common_mistakes").notNull().default([]),
    moduleHref: text("module_href").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
);

export const helpTutorialSteps = pgTable(
  "help_tutorial_steps",
  {
    id: serial("id").primaryKey(),
    tutorialId: integer("tutorial_id")
      .notNull()
      .references(() => helpTutorials.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    // Real screenshots are out of scope; this is a short placeholder label
    // rendered as a captioned box (e.g. "Captura: tablero de Hoy").
    screenshotPlaceholder: text("screenshot_placeholder"),
  },
  (table) => [
    uniqueIndex("help_tutorial_steps_unique_idx").on(table.tutorialId, table.position),
  ],
);

export const userTutorialProgress = pgTable(
  "user_tutorial_progress",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tutorialId: integer("tutorial_id")
      .notNull()
      .references(() => helpTutorials.id, { onDelete: "cascade" }),
    completedStepIds: jsonb("completed_step_ids").notNull().default([]),
    currentStepIndex: integer("current_step_index").notNull().default(0),
    completedAt: timestamp("completed_at"),
    dismissedAt: timestamp("dismissed_at"),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("user_tutorial_progress_unique_idx").on(table.userId, table.tutorialId),
  ],
);
