ALTER TABLE "users" ALTER COLUMN "role" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'technician'::text;--> statement-breakpoint
DROP TYPE "public"."user_role";--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('superadmin', 'administrator', 'director', 'project_manager', 'technician', 'client');--> statement-breakpoint
UPDATE "users" SET "role" = 'superadmin' WHERE "role" = 'admin';--> statement-breakpoint
UPDATE "users" SET "role" = 'technician' WHERE "role" = 'member';--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'technician'::"public"."user_role";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DATA TYPE "public"."user_role" USING "role"::"public"."user_role";