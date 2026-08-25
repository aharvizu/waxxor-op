CREATE SEQUENCE IF NOT EXISTS "activity_folio_seq";--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "folio" text;--> statement-breakpoint
UPDATE "activities" SET "folio" = 'ACT-' || lpad(nextval('activity_folio_seq')::text, 6, '0') WHERE "folio" IS NULL;--> statement-breakpoint
ALTER TABLE "activities" ALTER COLUMN "folio" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_folio_unique" UNIQUE("folio");
