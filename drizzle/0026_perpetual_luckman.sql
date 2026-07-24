CREATE TYPE "public"."ticket_billing_status_category" AS ENUM('not_billable', 'included', 'pending', 'approved', 'billed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."ticket_status_category" AS ENUM('open', 'in_progress', 'waiting', 'resolved', 'closed', 'cancelled');--> statement-breakpoint
CREATE TABLE "ticket_billing_statuses" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"color" text,
	"icon" text,
	"category" "ticket_billing_status_category" NOT NULL,
	"semantic_key" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_by_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_priorities" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"color" text,
	"icon" text,
	"level" integer DEFAULT 0 NOT NULL,
	"semantic_key" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_by_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_statuses" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"color" text,
	"icon" text,
	"category" "ticket_status_category" NOT NULL,
	"semantic_key" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_by_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sla_definitions" ADD COLUMN "priority_id" integer;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "status_id" integer;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "priority_id" integer;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "billing_status_id" integer;--> statement-breakpoint
ALTER TABLE "ticket_billing_statuses" ADD CONSTRAINT "ticket_billing_statuses_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_billing_statuses" ADD CONSTRAINT "ticket_billing_statuses_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_priorities" ADD CONSTRAINT "ticket_priorities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_priorities" ADD CONSTRAINT "ticket_priorities_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_statuses" ADD CONSTRAINT "ticket_statuses_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_statuses" ADD CONSTRAINT "ticket_statuses_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_billing_statuses_org_slug_idx" ON "ticket_billing_statuses" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "ticket_billing_statuses_org_idx" ON "ticket_billing_statuses" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_priorities_org_slug_idx" ON "ticket_priorities" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "ticket_priorities_org_idx" ON "ticket_priorities" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_statuses_org_slug_idx" ON "ticket_statuses" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "ticket_statuses_org_idx" ON "ticket_statuses" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ticket_statuses_semantic_key_idx" ON "ticket_statuses" USING btree ("semantic_key");--> statement-breakpoint
ALTER TABLE "sla_definitions" ADD CONSTRAINT "sla_definitions_priority_id_ticket_priorities_id_fk" FOREIGN KEY ("priority_id") REFERENCES "public"."ticket_priorities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_status_id_ticket_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."ticket_statuses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_priority_id_ticket_priorities_id_fk" FOREIGN KEY ("priority_id") REFERENCES "public"."ticket_priorities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_billing_status_id_ticket_billing_statuses_id_fk" FOREIGN KEY ("billing_status_id") REFERENCES "public"."ticket_billing_statuses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sla_definitions_priority_id_idx" ON "sla_definitions" USING btree ("priority_id");--> statement-breakpoint
CREATE INDEX "tickets_status_id_idx" ON "tickets" USING btree ("status_id");--> statement-breakpoint
CREATE INDEX "tickets_priority_id_idx" ON "tickets" USING btree ("priority_id");--> statement-breakpoint
CREATE INDEX "tickets_billing_status_id_idx" ON "tickets" USING btree ("billing_status_id");