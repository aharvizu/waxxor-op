CREATE TYPE "public"."work_item_priority" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."work_item_status" AS ENUM('open', 'in_progress', 'waiting_on_customer', 'resolved', 'closed');--> statement-breakpoint
CREATE TYPE "public"."work_item_type" AS ENUM('activity', 'ticket', 'project_activity');--> statement-breakpoint
CREATE TABLE "work_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"type" "work_item_type" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "work_item_status" DEFAULT 'open' NOT NULL,
	"priority" "work_item_priority" DEFAULT 'medium' NOT NULL,
	"client_id" integer,
	"assignee_id" integer,
	"created_by_id" integer,
	"start_date" date,
	"due_date" date,
	"completed_at" timestamp,
	"estimated_minutes" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "work_item_id" integer;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "first_response_at" timestamp;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "resolved_at" timestamp;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "closed_at" timestamp;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "work_items_org_idx" ON "work_items" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "work_items_type_idx" ON "work_items" USING btree ("type");--> statement-breakpoint
CREATE INDEX "work_items_status_idx" ON "work_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "work_items_priority_idx" ON "work_items" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "work_items_client_idx" ON "work_items" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "work_items_assignee_idx" ON "work_items" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX "work_items_due_date_idx" ON "work_items" USING btree ("due_date");--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_work_item_id_work_items_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_work_item_id_unique" UNIQUE("work_item_id");--> statement-breakpoint
DO $$
DECLARE
  t RECORD;
  wid integer;
BEGIN
  FOR t IN SELECT * FROM tickets WHERE work_item_id IS NULL ORDER BY id LOOP
    INSERT INTO work_items (
      organization_id, type, title, description, status, priority,
      client_id, assignee_id, created_by_id, created_at, updated_at
    ) VALUES (
      t.organization_id, 'ticket', t.subject, t.description,
      t.status::text::work_item_status, t.priority::text::work_item_priority,
      t.client_id, t.assignee_id, t.created_by_id, t.created_at, t.updated_at
    ) RETURNING id INTO wid;
    UPDATE tickets SET work_item_id = wid WHERE id = t.id;
  END LOOP;
END $$;
