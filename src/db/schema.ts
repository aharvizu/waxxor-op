import {
  date,
  integer,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["admin", "member"]);
export const ticketStatus = pgEnum("ticket_status", [
  "open",
  "in_progress",
  "waiting_on_customer",
  "resolved",
  "closed",
]);
export const ticketPriority = pgEnum("ticket_priority", [
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

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: userRole("role").notNull().default("member"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  contactName: text("contact_name"),
  email: text("email"),
  phone: text("phone"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const tickets = pgTable("tickets", {
  id: serial("id").primaryKey(),
  subject: text("subject").notNull(),
  description: text("description"),
  status: ticketStatus("status").notNull().default("open"),
  priority: ticketPriority("priority").notNull().default("medium"),
  clientId: integer("client_id").references(() => clients.id),
  assigneeId: integer("assignee_id").references(() => users.id),
  createdById: integer("created_by_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const ticketComments = pgTable("ticket_comments", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id")
    .notNull()
    .references(() => tickets.id, { onDelete: "cascade" }),
  authorId: integer("author_id").references(() => users.id),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
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
  name: text("name").notNull(),
  description: text("description"),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const reports = pgTable("reports", {
  id: serial("id").primaryKey(),
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
  name: text("name").notNull(),
  unit: text("unit"),
  target: numeric("target", { precision: 12, scale: 2 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

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
