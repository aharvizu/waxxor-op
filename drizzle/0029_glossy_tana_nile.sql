ALTER TABLE "activities" ALTER COLUMN "activity_type" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "activities" ALTER COLUMN "activity_type" SET DEFAULT 'general';--> statement-breakpoint
ALTER TABLE "time_entries" ALTER COLUMN "time_type" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "time_entries" ALTER COLUMN "time_type" SET DEFAULT 'technical_work';--> statement-breakpoint
DROP TYPE "public"."activity_type";--> statement-breakpoint
DROP TYPE "public"."time_type";