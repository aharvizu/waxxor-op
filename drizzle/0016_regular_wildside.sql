CREATE TYPE "public"."recurrence_execution_source" AS ENUM('scheduler', 'manual', 'retry', 'backfill');--> statement-breakpoint
CREATE TYPE "public"."recurrence_execution_status" AS ENUM('pending', 'running', 'succeeded', 'failed', 'skipped', 'cancelled', 'duplicate_prevented');--> statement-breakpoint
CREATE TYPE "public"."recurrence_frequency" AS ENUM('daily', 'weekly', 'monthly', 'quarterly', 'semiannual', 'annual', 'weekdays', 'custom');--> statement-breakpoint
CREATE TYPE "public"."recurrence_schedule_type" AS ENUM('interval', 'calendar', 'custom_rule');--> statement-breakpoint
CREATE TYPE "public"."recurrence_status" AS ENUM('draft', 'active', 'paused', 'completed', 'expired', 'error', 'archived');--> statement-breakpoint
CREATE TYPE "public"."recurrence_target_type" AS ENUM('activity', 'ticket', 'project_activity', 'report');--> statement-breakpoint
CREATE TABLE "recurrence_definitions" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"target_type" "recurrence_target_type" NOT NULL,
	"status" "recurrence_status" DEFAULT 'draft' NOT NULL,
	"timezone" text DEFAULT 'America/Mexico_City' NOT NULL,
	"schedule_type" "recurrence_schedule_type" DEFAULT 'calendar' NOT NULL,
	"frequency" "recurrence_frequency" DEFAULT 'monthly' NOT NULL,
	"interval" integer DEFAULT 1 NOT NULL,
	"days_of_week" jsonb,
	"day_of_month" integer,
	"month_of_year" integer,
	"week_of_month" integer,
	"time_of_day" text DEFAULT '09:00' NOT NULL,
	"start_at" date NOT NULL,
	"end_at" date,
	"max_occurrences" integer,
	"next_run_at" timestamp,
	"last_run_at" timestamp,
	"last_successful_run_at" timestamp,
	"last_failed_run_at" timestamp,
	"occurrence_count" integer DEFAULT 0 NOT NULL,
	"successful_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"consecutive_failed_count" integer DEFAULT 0 NOT NULL,
	"client_id" integer,
	"project_id" integer,
	"project_list_id" integer,
	"assignee_id" integer,
	"created_by_id" integer,
	"updated_by_id" integer,
	"template_data" jsonb NOT NULL,
	"generation_rules" jsonb,
	"is_active" boolean DEFAULT false NOT NULL,
	"pause_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"archived_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "recurrence_executions" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"recurrence_definition_id" integer NOT NULL,
	"occurrence_key" text NOT NULL,
	"scheduled_for" timestamp NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"status" "recurrence_execution_status" DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"generated_entity_type" text,
	"generated_entity_id" integer,
	"error_code" text,
	"error_message" text,
	"metadata" jsonb,
	"executed_by_user_id" integer,
	"execution_source" "recurrence_execution_source" DEFAULT 'scheduler' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recurrence_definitions" ADD CONSTRAINT "recurrence_definitions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurrence_definitions" ADD CONSTRAINT "recurrence_definitions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurrence_definitions" ADD CONSTRAINT "recurrence_definitions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurrence_definitions" ADD CONSTRAINT "recurrence_definitions_project_list_id_project_lists_id_fk" FOREIGN KEY ("project_list_id") REFERENCES "public"."project_lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurrence_definitions" ADD CONSTRAINT "recurrence_definitions_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurrence_definitions" ADD CONSTRAINT "recurrence_definitions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurrence_definitions" ADD CONSTRAINT "recurrence_definitions_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurrence_executions" ADD CONSTRAINT "recurrence_executions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurrence_executions" ADD CONSTRAINT "recurrence_executions_recurrence_definition_id_recurrence_definitions_id_fk" FOREIGN KEY ("recurrence_definition_id") REFERENCES "public"."recurrence_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurrence_executions" ADD CONSTRAINT "recurrence_executions_executed_by_user_id_users_id_fk" FOREIGN KEY ("executed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recurrence_defs_due_idx" ON "recurrence_definitions" USING btree ("organization_id","status","next_run_at");--> statement-breakpoint
CREATE INDEX "recurrence_defs_client_idx" ON "recurrence_definitions" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "recurrence_defs_project_idx" ON "recurrence_definitions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "recurrence_defs_assignee_idx" ON "recurrence_definitions" USING btree ("assignee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recurrence_exec_occurrence_idx" ON "recurrence_executions" USING btree ("recurrence_definition_id","occurrence_key");--> statement-breakpoint
CREATE INDEX "recurrence_exec_schedule_idx" ON "recurrence_executions" USING btree ("recurrence_definition_id","scheduled_for");--> statement-breakpoint
CREATE INDEX "recurrence_exec_status_idx" ON "recurrence_executions" USING btree ("organization_id","status");