ALTER TABLE "activities" ADD COLUMN "converted_ticket_id" integer;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "converted_at" timestamp;--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS "ticket_folio_seq";--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "folio" text;--> statement-breakpoint
UPDATE "tickets" SET "folio" = 'TK-' || lpad(nextval('ticket_folio_seq')::text, 6, '0') WHERE "folio" IS NULL;--> statement-breakpoint
ALTER TABLE "tickets" ALTER COLUMN "folio" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "subcategory" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "channel" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "modality" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "contact" text;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_converted_ticket_id_tickets_id_fk" FOREIGN KEY ("converted_ticket_id") REFERENCES "public"."tickets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_folio_unique" UNIQUE("folio");