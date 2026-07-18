CREATE TYPE "public"."report_template_status" AS ENUM('active', 'inactive', 'archived');--> statement-breakpoint
CREATE TYPE "public"."report_type" AS ENUM('monthly_service', 'operational_summary', 'executive_summary', 'sla_report', 'time_report', 'project_report', 'billing_support', 'custom_internal');--> statement-breakpoint
ALTER TYPE "public"."report_status" ADD VALUE 'generating';--> statement-breakpoint
ALTER TYPE "public"."report_status" ADD VALUE 'ready_for_review';--> statement-breakpoint
ALTER TYPE "public"."report_status" ADD VALUE 'changes_requested';--> statement-breakpoint
ALTER TYPE "public"."report_status" ADD VALUE 'approved';--> statement-breakpoint
ALTER TYPE "public"."report_status" ADD VALUE 'failed';--> statement-breakpoint
ALTER TYPE "public"."report_status" ADD VALUE 'archived';--> statement-breakpoint
CREATE TABLE "indicator_thresholds" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"key" text NOT NULL,
	"value" numeric(12, 2) NOT NULL,
	"updated_by_id" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"report_id" integer NOT NULL,
	"version_number" integer NOT NULL,
	"content_snapshot" jsonb,
	"metrics_snapshot" jsonb,
	"narrative" text,
	"executive_summary" text,
	"conclusions" text,
	"recommendations" text,
	"author_id" integer,
	"change_reason" text,
	"approved_by_user_id" integer,
	"approved_at" timestamp,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "report_templates" ALTER COLUMN "content" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "content" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "report_templates" ADD COLUMN "report_type" "report_type" DEFAULT 'monthly_service' NOT NULL;--> statement-breakpoint
ALTER TABLE "report_templates" ADD COLUMN "sections" jsonb;--> statement-breakpoint
ALTER TABLE "report_templates" ADD COLUMN "default_period_rule" text;--> statement-breakpoint
ALTER TABLE "report_templates" ADD COLUMN "include_logo" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "report_templates" ADD COLUMN "include_cover" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "report_templates" ADD COLUMN "include_executive_summary" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "report_templates" ADD COLUMN "include_conclusions" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "report_templates" ADD COLUMN "include_recommendations" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "report_templates" ADD COLUMN "status" "report_template_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "report_templates" ADD COLUMN "created_by_id" integer;--> statement-breakpoint
ALTER TABLE "report_templates" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "report_templates" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "project_id" integer;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "report_type" "report_type" DEFAULT 'custom_internal' NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "period_start" date;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "period_end" date;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "responsible_user_id" integer;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "generated_by_user_id" integer;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "reviewed_by_user_id" integer;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "approved_by_user_id" integer;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "sent_by_user_id" integer;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "generated_at" timestamp;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "reviewed_at" timestamp;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "approved_at" timestamp;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "delivery_channel" text;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "recipient_contact_id" integer;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "subject" text;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "executive_summary" text;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "conclusions" text;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "recommendations" text;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "internal_notes" text;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "content_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "metrics_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "failure_reason" text;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "created_by_id" integer;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "indicator_thresholds" ADD CONSTRAINT "indicator_thresholds_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_thresholds" ADD CONSTRAINT "indicator_thresholds_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_versions" ADD CONSTRAINT "report_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_versions" ADD CONSTRAINT "report_versions_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_versions" ADD CONSTRAINT "report_versions_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_versions" ADD CONSTRAINT "report_versions_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "indicator_thresholds_unique_idx" ON "indicator_thresholds" USING btree ("organization_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "report_versions_unique_idx" ON "report_versions" USING btree ("report_id","version_number");--> statement-breakpoint
ALTER TABLE "report_templates" ADD CONSTRAINT "report_templates_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_responsible_user_id_users_id_fk" FOREIGN KEY ("responsible_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_generated_by_user_id_users_id_fk" FOREIGN KEY ("generated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_sent_by_user_id_users_id_fk" FOREIGN KEY ("sent_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_recipient_contact_id_contacts_id_fk" FOREIGN KEY ("recipient_contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reports_org_status_idx" ON "reports" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "reports_client_idx" ON "reports" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "reports_project_idx" ON "reports" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "reports_responsible_idx" ON "reports" USING btree ("responsible_user_id");--> statement-breakpoint
CREATE INDEX "reports_period_idx" ON "reports" USING btree ("period_end");