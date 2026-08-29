CREATE TABLE "billing_invoice_tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"invoice_id" integer NOT NULL,
	"ticket_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "billing_invoices_unique_idx";--> statement-breakpoint
ALTER TABLE "billing_invoices" ALTER COLUMN "invoice_number" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_invoices" ALTER COLUMN "invoiced_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "billing_invoices" ALTER COLUMN "invoiced_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_invoices" ALTER COLUMN "invoiced_by_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_invoice_tickets" ADD CONSTRAINT "billing_invoice_tickets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_invoice_tickets" ADD CONSTRAINT "billing_invoice_tickets_invoice_id_billing_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."billing_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_invoice_tickets" ADD CONSTRAINT "billing_invoice_tickets_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_invoice_tickets_ticket_idx" ON "billing_invoice_tickets" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "billing_invoice_tickets_invoice_idx" ON "billing_invoice_tickets" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "billing_invoices_company_idx" ON "billing_invoices" USING btree ("company_id");--> statement-breakpoint
-- Backfill: link each pre-existing (period-keyed) invoice to the tickets it
-- actually covered under the old model — same tickets that were already
-- shown as "invoiced" for it (workItems.createdAt <= invoicedAt, within the
-- old period range). Captured before this migration dropped period_start/
-- period_end. F8608=Kuali, F8610=MLC, F8611=Notaria 107.
INSERT INTO "billing_invoice_tickets" ("organization_id", "invoice_id", "ticket_id") VALUES
  (1, 3, 249),
  (1, 4, 235),
  (1, 4, 236),
  (1, 4, 246),
  (1, 4, 264),
  (1, 5, 230),
  (1, 5, 258);--> statement-breakpoint
ALTER TABLE "billing_invoices" DROP COLUMN "period_start";--> statement-breakpoint
ALTER TABLE "billing_invoices" DROP COLUMN "period_end";