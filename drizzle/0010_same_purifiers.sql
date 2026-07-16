CREATE TYPE "public"."sla_definition_status" AS ENUM('active', 'inactive');--> statement-breakpoint
ALTER TYPE "public"."work_item_status" ADD VALUE 'waiting_third_party' BEFORE 'resolved';--> statement-breakpoint
CREATE TABLE "business_calendars" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"timezone" text DEFAULT 'America/Mexico_City' NOT NULL,
	"work_days" jsonb DEFAULT '[1,2,3,4,5]'::jsonb NOT NULL,
	"work_start_minute" integer DEFAULT 540 NOT NULL,
	"work_end_minute" integer DEFAULT 1080 NOT NULL,
	"holidays" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "business_calendars_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
CREATE TABLE "sla_definitions" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"priority" "work_item_priority" NOT NULL,
	"first_response_minutes" integer NOT NULL,
	"resolution_minutes" integer NOT NULL,
	"business_hours_only" boolean DEFAULT false NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"status" "sla_definition_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "sla_definition_id" integer;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "sla_name" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "sla_first_response_minutes" integer;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "sla_resolution_minutes" integer;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "sla_business_hours_only" boolean;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "sla_timezone" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "sla_calendar" jsonb;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "first_response_target_at" timestamp;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "resolution_target_at" timestamp;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "sla_paused_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "sla_paused_at" timestamp;--> statement-breakpoint
ALTER TABLE "business_calendars" ADD CONSTRAINT "business_calendars_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_definitions" ADD CONSTRAINT "sla_definitions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sla_definitions_org_idx" ON "sla_definitions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "sla_definitions_priority_idx" ON "sla_definitions" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "sla_definitions_status_idx" ON "sla_definitions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sla_definitions_default_idx" ON "sla_definitions" USING btree ("is_default");--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_sla_definition_id_sla_definitions_id_fk" FOREIGN KEY ("sla_definition_id") REFERENCES "public"."sla_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tickets_first_response_target_idx" ON "tickets" USING btree ("first_response_target_at");--> statement-breakpoint
CREATE INDEX "tickets_resolution_target_idx" ON "tickets" USING btree ("resolution_target_at");