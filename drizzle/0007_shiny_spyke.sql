CREATE TYPE "public"."activity_type" AS ENUM('general', 'follow_up', 'meeting', 'research', 'documentation', 'training', 'review', 'implementation', 'preventive', 'administrative', 'commercial', 'reminder');--> statement-breakpoint
ALTER TYPE "public"."work_item_status" ADD VALUE 'pending';--> statement-breakpoint
ALTER TYPE "public"."work_item_status" ADD VALUE 'waiting';--> statement-breakpoint
ALTER TYPE "public"."work_item_status" ADD VALUE 'blocked';--> statement-breakpoint
ALTER TYPE "public"."work_item_status" ADD VALUE 'completed';--> statement-breakpoint
ALTER TYPE "public"."work_item_status" ADD VALUE 'cancelled';--> statement-breakpoint
ALTER TYPE "public"."work_item_status" ADD VALUE 'archived';--> statement-breakpoint
CREATE TABLE "activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"work_item_id" integer NOT NULL,
	"activity_type" "activity_type" DEFAULT 'general' NOT NULL,
	"recurrence_template_id" integer,
	"archived_at" timestamp,
	CONSTRAINT "activities_work_item_id_unique" UNIQUE("work_item_id")
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_work_item_id_work_items_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_items"("id") ON DELETE no action ON UPDATE no action;