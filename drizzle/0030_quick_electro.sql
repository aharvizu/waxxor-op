CREATE TABLE "service_variants" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"service_id" integer NOT NULL,
	"name" text NOT NULL,
	"sku" text,
	"description" text,
	"default_remote_rate" numeric(12, 2),
	"default_onsite_rate" numeric(12, 2),
	"default_fixed_price" numeric(12, 2),
	"status" "service_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_services" ADD COLUMN "variant_id" integer;--> statement-breakpoint
ALTER TABLE "service_variants" ADD CONSTRAINT "service_variants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_variants" ADD CONSTRAINT "service_variants_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "service_variants_service_idx" ON "service_variants" USING btree ("service_id");--> statement-breakpoint
CREATE UNIQUE INDEX "service_variants_unique_idx" ON "service_variants" USING btree ("service_id","name");--> statement-breakpoint
ALTER TABLE "client_services" ADD CONSTRAINT "client_services_variant_id_service_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."service_variants"("id") ON DELETE no action ON UPDATE no action;