CREATE TABLE "billing_invoice_time_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"invoice_id" integer NOT NULL,
	"time_entry_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing_invoice_time_entries" ADD CONSTRAINT "billing_invoice_time_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_invoice_time_entries" ADD CONSTRAINT "billing_invoice_time_entries_invoice_id_billing_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."billing_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_invoice_time_entries" ADD CONSTRAINT "billing_invoice_time_entries_time_entry_id_time_entries_id_fk" FOREIGN KEY ("time_entry_id") REFERENCES "public"."time_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_invoice_time_entries_invoice_idx" ON "billing_invoice_time_entries" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "billing_invoice_time_entries_entry_idx" ON "billing_invoice_time_entries" USING btree ("time_entry_id");