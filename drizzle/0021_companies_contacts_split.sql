ALTER TYPE "public"."client_status" RENAME TO "company_status";--> statement-breakpoint
CREATE TABLE "company_contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"contact_id" integer NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clients" RENAME TO "companies";--> statement-breakpoint
ALTER TABLE "contacts" RENAME COLUMN "client_id" TO "company_id";--> statement-breakpoint
ALTER TABLE "contracts" RENAME COLUMN "client_id" TO "company_id";--> statement-breakpoint
ALTER TABLE "projects" RENAME COLUMN "client_id" TO "company_id";--> statement-breakpoint
ALTER TABLE "quotes" RENAME COLUMN "client_id" TO "company_id";--> statement-breakpoint
ALTER TABLE "recurrence_definitions" RENAME COLUMN "client_id" TO "company_id";--> statement-breakpoint
ALTER TABLE "reports" RENAME COLUMN "client_id" TO "company_id";--> statement-breakpoint
ALTER TABLE "work_items" RENAME COLUMN "client_id" TO "company_id";--> statement-breakpoint
ALTER TABLE "client_notes" RENAME COLUMN "client_id" TO "company_id";--> statement-breakpoint
ALTER TABLE "client_services" RENAME COLUMN "client_id" TO "company_id";--> statement-breakpoint
ALTER TABLE "conversations" RENAME COLUMN "client_id" TO "company_id";--> statement-breakpoint
ALTER TABLE "client_notes" DROP CONSTRAINT "client_notes_client_id_clients_id_fk";
--> statement-breakpoint
ALTER TABLE "client_services" DROP CONSTRAINT "client_services_client_id_clients_id_fk";
--> statement-breakpoint
ALTER TABLE "companies" DROP CONSTRAINT "clients_organization_id_organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "companies" DROP CONSTRAINT "clients_account_owner_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "companies" DROP CONSTRAINT "clients_default_technician_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "contacts" DROP CONSTRAINT "contacts_client_id_clients_id_fk";
--> statement-breakpoint
ALTER TABLE "contracts" DROP CONSTRAINT "contracts_client_id_clients_id_fk";
--> statement-breakpoint
ALTER TABLE "conversations" DROP CONSTRAINT "conversations_client_id_clients_id_fk";
--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT "projects_client_id_clients_id_fk";
--> statement-breakpoint
ALTER TABLE "quotes" DROP CONSTRAINT "quotes_client_id_clients_id_fk";
--> statement-breakpoint
ALTER TABLE "recurrence_definitions" DROP CONSTRAINT "recurrence_definitions_client_id_clients_id_fk";
--> statement-breakpoint
ALTER TABLE "reports" DROP CONSTRAINT "reports_client_id_clients_id_fk";
--> statement-breakpoint
ALTER TABLE "work_items" DROP CONSTRAINT "work_items_client_id_clients_id_fk";
--> statement-breakpoint
ALTER TABLE "help_tutorials" ALTER COLUMN "module" SET DATA TYPE text;--> statement-breakpoint
UPDATE "help_tutorials" SET "module" = 'companies' WHERE "module" = 'clients';--> statement-breakpoint
DROP TYPE "public"."help_module";--> statement-breakpoint
CREATE TYPE "public"."help_module" AS ENUM('today', 'activities', 'tickets', 'projects', 'companies', 'recurring', 'reports', 'indicators', 'settings', 'inbox', 'knowledge', 'contacts');--> statement-breakpoint
ALTER TABLE "help_tutorials" ALTER COLUMN "module" SET DATA TYPE "public"."help_module" USING "module"::"public"."help_module";--> statement-breakpoint
ALTER TABLE "knowledge_article_relations" ALTER COLUMN "related_type" SET DATA TYPE text;--> statement-breakpoint
UPDATE "knowledge_article_relations" SET "related_type" = 'company' WHERE "related_type" = 'client';--> statement-breakpoint
DROP TYPE "public"."knowledge_relation_type";--> statement-breakpoint
CREATE TYPE "public"."knowledge_relation_type" AS ENUM('ticket', 'company', 'project', 'activity');--> statement-breakpoint
ALTER TABLE "knowledge_article_relations" ALTER COLUMN "related_type" SET DATA TYPE "public"."knowledge_relation_type" USING "related_type"::"public"."knowledge_relation_type";--> statement-breakpoint
DROP INDEX "contacts_client_idx";--> statement-breakpoint
DROP INDEX "client_notes_client_idx";--> statement-breakpoint
DROP INDEX "client_services_client_idx";--> statement-breakpoint
DROP INDEX "contracts_client_idx";--> statement-breakpoint
DROP INDEX "conversations_client_idx";--> statement-breakpoint
DROP INDEX "projects_client_idx";--> statement-breakpoint
DROP INDEX "recurrence_defs_client_idx";--> statement-breakpoint
DROP INDEX "reports_client_idx";--> statement-breakpoint
DROP INDEX "work_items_client_idx";--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "tax_id" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "tags" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "department" text;--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "contact_id" integer;--> statement-breakpoint
ALTER TABLE "company_contacts" ADD CONSTRAINT "company_contacts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_contacts" ADD CONSTRAINT "company_contacts_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "company_contacts_unique_idx" ON "company_contacts" USING btree ("company_id","contact_id");--> statement-breakpoint
CREATE INDEX "company_contacts_contact_idx" ON "company_contacts" USING btree ("contact_id");--> statement-breakpoint
ALTER TABLE "client_notes" ADD CONSTRAINT "client_notes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_services" ADD CONSTRAINT "client_services_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_account_owner_id_users_id_fk" FOREIGN KEY ("account_owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_default_technician_id_users_id_fk" FOREIGN KEY ("default_technician_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurrence_definitions" ADD CONSTRAINT "recurrence_definitions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contacts_company_idx" ON "contacts" USING btree ("organization_id","company_id");--> statement-breakpoint
CREATE INDEX "work_items_contact_idx" ON "work_items" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "client_notes_client_idx" ON "client_notes" USING btree ("organization_id","company_id");--> statement-breakpoint
CREATE INDEX "client_services_client_idx" ON "client_services" USING btree ("organization_id","company_id");--> statement-breakpoint
CREATE INDEX "contracts_client_idx" ON "contracts" USING btree ("organization_id","company_id");--> statement-breakpoint
CREATE INDEX "conversations_client_idx" ON "conversations" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "projects_client_idx" ON "projects" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "recurrence_defs_client_idx" ON "recurrence_definitions" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "reports_client_idx" ON "reports" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "work_items_client_idx" ON "work_items" USING btree ("company_id");
