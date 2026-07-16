ALTER TABLE "tickets" DROP CONSTRAINT "tickets_client_id_clients_id_fk";
--> statement-breakpoint
ALTER TABLE "tickets" DROP CONSTRAINT "tickets_assignee_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "tickets" DROP CONSTRAINT "tickets_created_by_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "tickets" ALTER COLUMN "work_item_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" DROP COLUMN "subject";--> statement-breakpoint
ALTER TABLE "tickets" DROP COLUMN "description";--> statement-breakpoint
ALTER TABLE "tickets" DROP COLUMN "status";--> statement-breakpoint
ALTER TABLE "tickets" DROP COLUMN "priority";--> statement-breakpoint
ALTER TABLE "tickets" DROP COLUMN "client_id";--> statement-breakpoint
ALTER TABLE "tickets" DROP COLUMN "assignee_id";--> statement-breakpoint
ALTER TABLE "tickets" DROP COLUMN "created_by_id";--> statement-breakpoint
ALTER TABLE "tickets" DROP COLUMN "created_at";--> statement-breakpoint
ALTER TABLE "tickets" DROP COLUMN "updated_at";--> statement-breakpoint
DROP TYPE "public"."ticket_priority";--> statement-breakpoint
DROP TYPE "public"."ticket_status";