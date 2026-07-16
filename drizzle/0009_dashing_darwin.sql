CREATE TYPE "public"."billing_status" AS ENUM('billable', 'non_billable', 'included_in_contract', 'pending_review');--> statement-breakpoint
CREATE TYPE "public"."time_modality" AS ENUM('remote', 'onsite', 'not_applicable');--> statement-breakpoint
CREATE TYPE "public"."time_type" AS ENUM('technical_work', 'remote_support', 'onsite_support', 'travel', 'waiting_customer', 'waiting_provider', 'research', 'documentation', 'meeting', 'training', 'administration', 'commercial');--> statement-breakpoint
CREATE TABLE "time_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"work_item_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"date" date NOT NULL,
	"duration_minutes" integer NOT NULL,
	"time_type" time_type DEFAULT 'technical_work' NOT NULL,
	"billing_status" "billing_status" DEFAULT 'pending_review' NOT NULL,
	"modality" time_modality DEFAULT 'not_applicable' NOT NULL,
	"description" text NOT NULL,
	"result" text,
	"hourly_rate" numeric(12, 2),
	"internal_hourly_cost" numeric(12, 2),
	"calculated_amount" numeric(12, 2),
	"calculated_internal_cost" numeric(12, 2),
	"voided_at" timestamp,
	"created_by_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_work_item_id_work_items_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "time_entries_org_idx" ON "time_entries" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "time_entries_work_item_idx" ON "time_entries" USING btree ("work_item_id");--> statement-breakpoint
CREATE INDEX "time_entries_user_idx" ON "time_entries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "time_entries_date_idx" ON "time_entries" USING btree ("date");--> statement-breakpoint
CREATE INDEX "time_entries_billing_idx" ON "time_entries" USING btree ("billing_status");--> statement-breakpoint
CREATE INDEX "time_entries_type_idx" ON "time_entries" USING btree ("time_type");