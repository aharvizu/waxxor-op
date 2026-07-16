CREATE TYPE "public"."organization_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"status" "organization_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
INSERT INTO "organizations" ("name", "slug") VALUES ('Watson', 'watson') ON CONFLICT ("slug") DO NOTHING;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "organization_id" integer;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "organization_id" integer;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "organization_id" integer;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "organization_id" integer;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "organization_id" integer;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "organization_id" integer;--> statement-breakpoint
ALTER TABLE "report_templates" ADD COLUMN "organization_id" integer;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "organization_id" integer;--> statement-breakpoint
ALTER TABLE "kpis" ADD COLUMN "organization_id" integer;--> statement-breakpoint
UPDATE "users" SET "organization_id" = (SELECT "id" FROM "organizations" WHERE "slug" = 'watson') WHERE "organization_id" IS NULL;--> statement-breakpoint
UPDATE "clients" SET "organization_id" = (SELECT "id" FROM "organizations" WHERE "slug" = 'watson') WHERE "organization_id" IS NULL;--> statement-breakpoint
UPDATE "tickets" SET "organization_id" = (SELECT "id" FROM "organizations" WHERE "slug" = 'watson') WHERE "organization_id" IS NULL;--> statement-breakpoint
UPDATE "projects" SET "organization_id" = (SELECT "id" FROM "organizations" WHERE "slug" = 'watson') WHERE "organization_id" IS NULL;--> statement-breakpoint
UPDATE "tasks" SET "organization_id" = (SELECT "id" FROM "organizations" WHERE "slug" = 'watson') WHERE "organization_id" IS NULL;--> statement-breakpoint
UPDATE "quotes" SET "organization_id" = (SELECT "id" FROM "organizations" WHERE "slug" = 'watson') WHERE "organization_id" IS NULL;--> statement-breakpoint
UPDATE "report_templates" SET "organization_id" = (SELECT "id" FROM "organizations" WHERE "slug" = 'watson') WHERE "organization_id" IS NULL;--> statement-breakpoint
UPDATE "reports" SET "organization_id" = (SELECT "id" FROM "organizations" WHERE "slug" = 'watson') WHERE "organization_id" IS NULL;--> statement-breakpoint
UPDATE "kpis" SET "organization_id" = (SELECT "id" FROM "organizations" WHERE "slug" = 'watson') WHERE "organization_id" IS NULL;--> statement-breakpoint
UPDATE "audit_logs" SET "organization_id" = (SELECT "id" FROM "organizations" WHERE "slug" = 'watson') WHERE "organization_id" IS NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "quotes" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "report_templates" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "kpis" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_logs" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_templates" ADD CONSTRAINT "report_templates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpis" ADD CONSTRAINT "kpis_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
