CREATE TYPE "public"."config_module" AS ENUM('activities', 'tickets', 'projects', 'companies', 'contacts', 'reports', 'knowledge', 'recurring');--> statement-breakpoint
CREATE TYPE "public"."custom_field_type" AS ENUM('text', 'textarea', 'number', 'decimal', 'currency', 'date', 'time', 'datetime', 'checkbox', 'select', 'multiselect', 'radio', 'user', 'company', 'contact', 'email', 'phone', 'url', 'color');--> statement-breakpoint
CREATE TYPE "public"."saved_view_type" AS ENUM('list', 'table', 'kanban', 'calendar', 'timeline');--> statement-breakpoint
CREATE TABLE "custom_field_definitions" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"module" "config_module" NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"help_text" text,
	"field_type" "custom_field_type" NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"visible" boolean DEFAULT true NOT NULL,
	"editable" boolean DEFAULT true NOT NULL,
	"placeholder" text,
	"default_value" jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"group_name" text,
	"max_length" integer,
	"validations" jsonb,
	"options" jsonb,
	"color" text,
	"icon" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_field_values" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"module" "config_module" NOT NULL,
	"entity_id" integer NOT NULL,
	"field_id" integer NOT NULL,
	"value" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_favorites" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"module" "config_module" NOT NULL,
	"entity_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_views" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"module" "config_module" NOT NULL,
	"name" text NOT NULL,
	"view_type" "saved_view_type" DEFAULT 'table' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_favorite" boolean DEFAULT false NOT NULL,
	"shared_with_team" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "custom_field_definitions" ADD CONSTRAINT "custom_field_definitions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_definitions" ADD CONSTRAINT "custom_field_definitions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_values" ADD CONSTRAINT "custom_field_values_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_values" ADD CONSTRAINT "custom_field_values_field_id_custom_field_definitions_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."custom_field_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_favorites" ADD CONSTRAINT "item_favorites_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_favorites" ADD CONSTRAINT "item_favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "custom_field_definitions_unique_idx" ON "custom_field_definitions" USING btree ("organization_id","module","key");--> statement-breakpoint
CREATE INDEX "custom_field_definitions_module_idx" ON "custom_field_definitions" USING btree ("organization_id","module","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_field_values_unique_idx" ON "custom_field_values" USING btree ("module","entity_id","field_id");--> statement-breakpoint
CREATE INDEX "custom_field_values_field_idx" ON "custom_field_values" USING btree ("field_id");--> statement-breakpoint
CREATE UNIQUE INDEX "item_favorites_unique_idx" ON "item_favorites" USING btree ("user_id","module","entity_id");--> statement-breakpoint
CREATE INDEX "saved_views_user_module_idx" ON "saved_views" USING btree ("user_id","module");--> statement-breakpoint
CREATE INDEX "saved_views_org_module_shared_idx" ON "saved_views" USING btree ("organization_id","module","shared_with_team");