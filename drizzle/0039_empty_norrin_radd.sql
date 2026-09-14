ALTER TABLE "services" ADD COLUMN "default_billing_included" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE "services" SET "default_billing_included" = true WHERE "name" = 'Poliza Global';