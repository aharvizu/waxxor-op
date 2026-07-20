CREATE TYPE "public"."saved_view_scope" AS ENUM('system', 'personal', 'team', 'organization');--> statement-breakpoint
CREATE TABLE "saved_view_preferences" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"view_id" integer NOT NULL,
	"is_favorite" boolean DEFAULT false NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"sort_order" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "saved_views_org_module_shared_idx";--> statement-breakpoint
ALTER TABLE "saved_views" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "saved_views" ADD COLUMN "scope" "saved_view_scope" DEFAULT 'personal' NOT NULL;--> statement-breakpoint
ALTER TABLE "saved_view_preferences" ADD CONSTRAINT "saved_view_preferences_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_view_preferences" ADD CONSTRAINT "saved_view_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_view_preferences" ADD CONSTRAINT "saved_view_preferences_view_id_saved_views_id_fk" FOREIGN KEY ("view_id") REFERENCES "public"."saved_views"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "saved_view_prefs_user_view_idx" ON "saved_view_preferences" USING btree ("user_id","view_id");--> statement-breakpoint
CREATE INDEX "saved_view_prefs_user_default_idx" ON "saved_view_preferences" USING btree ("user_id","is_default");--> statement-breakpoint
CREATE INDEX "saved_views_org_module_scope_idx" ON "saved_views" USING btree ("organization_id","module","scope");