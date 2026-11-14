CREATE TYPE "public"."proposal_status" AS ENUM('draft', 'issued', 'accepted', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TABLE "assessments" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"company_id" integer,
	"client_name" text NOT NULL,
	"contact_name" text,
	"contact_email" text,
	"contact_phone" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"conducted_on" date NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" text,
	"created_by_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "folio_counters" (
	"organization_id" integer NOT NULL,
	"series" text NOT NULL,
	"year" integer NOT NULL,
	"last" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "folio_counters_organization_id_series_year_pk" PRIMARY KEY("organization_id","series","year")
);
--> statement-breakpoint
CREATE TABLE "proposals" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"folio" text,
	"series" text DEFAULT 'WX' NOT NULL,
	"folio_year" integer,
	"sequence" integer,
	"status" "proposal_status" DEFAULT 'draft' NOT NULL,
	"company_id" integer,
	"client_name" text NOT NULL,
	"prepared_by" text NOT NULL,
	"date" date NOT NULL,
	"validity_days" integer DEFAULT 30 NOT NULL,
	"product_key" text NOT NULL,
	"plan_key" text,
	"billing_period" text,
	"items" jsonb NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"iva_bps" integer DEFAULT 1600 NOT NULL,
	"currency" varchar(3) DEFAULT 'MXN' NOT NULL,
	"subtotal_one_time_cents" bigint DEFAULT 0 NOT NULL,
	"iva_one_time_cents" bigint DEFAULT 0 NOT NULL,
	"total_one_time_cents" bigint DEFAULT 0 NOT NULL,
	"subtotal_recurring_cents" bigint DEFAULT 0 NOT NULL,
	"iva_recurring_cents" bigint DEFAULT 0 NOT NULL,
	"total_recurring_cents" bigint DEFAULT 0 NOT NULL,
	"snapshot" jsonb,
	"expires_at" date,
	"issued_at" timestamp,
	"replaces_proposal_id" integer,
	"assessment_id" integer,
	"created_by_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folio_counters" ADD CONSTRAINT "folio_counters_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assessments_org_idx" ON "assessments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "assessments_company_idx" ON "assessments" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "proposals_org_folio_idx" ON "proposals" USING btree ("organization_id","folio");--> statement-breakpoint
CREATE INDEX "proposals_org_status_idx" ON "proposals" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "proposals_company_idx" ON "proposals" USING btree ("company_id");