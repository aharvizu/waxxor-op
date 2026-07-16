CREATE TYPE "public"."confirmation_type" AS ENUM('whatsapp', 'phone', 'email', 'verbal', 'no_response', 'not_required');--> statement-breakpoint
CREATE TYPE "public"."conversation_channel" AS ENUM('manual', 'whatsapp', 'email', 'phone', 'portal', 'internal');--> statement-breakpoint
CREATE TYPE "public"."message_direction" AS ENUM('inbound', 'outbound', 'internal');--> statement-breakpoint
CREATE TYPE "public"."ticket_billing_modality" AS ENUM('remote', 'onsite', 'fixed_price', 'not_applicable');--> statement-breakpoint
CREATE TYPE "public"."ticket_billing_status" AS ENUM('pending_review', 'included_in_contract', 'billable', 'contract_overage', 'fixed_price', 'no_charge', 'included_in_monthly_charge', 'charged');--> statement-breakpoint
ALTER TYPE "public"."work_item_status" ADD VALUE 'new';--> statement-breakpoint
ALTER TYPE "public"."work_item_status" ADD VALUE 'assigned';--> statement-breakpoint
ALTER TYPE "public"."work_item_status" ADD VALUE 'waiting_customer';--> statement-breakpoint
ALTER TYPE "public"."work_item_status" ADD VALUE 'scheduled';--> statement-breakpoint
ALTER TYPE "public"."work_item_status" ADD VALUE 'pending_confirmation';--> statement-breakpoint
ALTER TYPE "public"."work_item_status" ADD VALUE 'reopened';--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"work_item_id" integer,
	"message_id" integer,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"storage_key" text NOT NULL,
	"uploaded_by_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "attachments_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"client_id" integer,
	"contact_id" integer,
	"ticket_id" integer NOT NULL,
	"channel" "conversation_channel" DEFAULT 'manual' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_ticket_id_unique" UNIQUE("ticket_id")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"conversation_id" integer NOT NULL,
	"direction" "message_direction" NOT NULL,
	"author_user_id" integer,
	"contact_id" integer,
	"body" text NOT NULL,
	"channel" "conversation_channel" DEFAULT 'manual' NOT NULL,
	"occurred_at" timestamp DEFAULT now() NOT NULL,
	"edited_at" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "parent_ticket_id" integer;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "resolution" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "confirmation_type" "confirmation_type";--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "confirmation_at" timestamp;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "confirmed_by_contact_id" integer;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "confirmation_notes" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "confirmation_channel" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "last_contact_attempt_at" timestamp;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "reopen_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "last_reopened_at" timestamp;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "last_reopen_reason" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "time_exception_reason" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "time_exception_by_id" integer;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "time_exception_at" timestamp;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "sla_first_response_met" boolean;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "sla_resolution_met" boolean;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "billing_status" "ticket_billing_status" DEFAULT 'pending_review' NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "billing_modality" "ticket_billing_modality" DEFAULT 'not_applicable' NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "hourly_rate" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "fixed_amount" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "calculated_amount" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "billing_period" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "external_reference" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "billing_notes" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "billing_determined_by_id" integer;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "billing_determined_at" timestamp;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_work_item_id_work_items_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_work_item_idx" ON "attachments" USING btree ("work_item_id");--> statement-breakpoint
CREATE INDEX "conversations_org_idx" ON "conversations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "messages_conversation_idx" ON "messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "messages_occurred_idx" ON "messages" USING btree ("occurred_at");--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_parent_ticket_id_tickets_id_fk" FOREIGN KEY ("parent_ticket_id") REFERENCES "public"."tickets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_time_exception_by_id_users_id_fk" FOREIGN KEY ("time_exception_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_billing_determined_by_id_users_id_fk" FOREIGN KEY ("billing_determined_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tickets_billing_status_idx" ON "tickets" USING btree ("billing_status");