import {
  boolean,
  date,
  index,
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
export const projectStatus = pgEnum("project_status", [
  "planning",
  "active",
  "on_hold",
  "completed",
  "cancelled",
]);
export const taskStatus = pgEnum("task_status", ["todo", "in_progress", "done"]);
export const quoteStatus = pgEnum("quote_status", [
  "draft",
  "sent",
  "accepted",
  "rejected",
  "expired",
]);
export const reportStatus = pgEnum("report_status", ["draft", "sent"]);
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
]);
export const messageDirection = pgEnum("message_direction", [
  "inbound",
  "outbound",
  "internal",
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
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizations.id),
  name: text("name").notNull(),
  contactName: text("contact_name"),
  email: text("email"),
  phone: text("phone"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

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
    clientId: integer("client_id").references(() => clients.id),
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
    index("work_items_client_idx").on(table.clientId),
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
 * recurrence_template_id is prepared for the future Recurrence module (E-10):
 * plain nullable column, no FK until recurrence_templates exists.
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
    clientId: integer("client_id").references(() => clients.id),
    contactId: integer("contact_id"),
    ticketId: integer("ticket_id")
      .notNull()
      .unique()
      .references(() => tickets.id, { onDelete: "cascade" }),
    channel: conversationChannel("channel").notNull().default("manual"),
    status: text("status").notNull().default("open"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("conversations_org_idx").on(table.organizationId)],
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
    contactId: integer("contact_id"),
    body: text("body").notNull(),
    channel: conversationChannel("channel").notNull().default("manual"),
    occurredAt: timestamp("occurred_at").notNull().defaultNow(),
    editedAt: timestamp("edited_at"),
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

export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizations.id),
  name: text("name").notNull(),
  description: text("description"),
  clientId: integer("client_id").references(() => clients.id),
  status: projectStatus("status").notNull().default("planning"),
  startDate: date("start_date"),
  dueDate: date("due_date"),
  budget: numeric("budget", { precision: 12, scale: 2 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

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
  clientId: integer("client_id")
    .notNull()
    .references(() => clients.id),
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

export const reportTemplates = pgTable("report_templates", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizations.id),
  name: text("name").notNull(),
  description: text("description"),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const reports = pgTable("reports", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizations.id),
  title: text("title").notNull(),
  content: text("content").notNull(),
  status: reportStatus("status").notNull().default("draft"),
  templateId: integer("template_id").references(() => reportTemplates.id, {
    onDelete: "set null",
  }),
  clientId: integer("client_id").references(() => clients.id),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

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
