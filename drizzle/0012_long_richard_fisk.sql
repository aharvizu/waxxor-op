UPDATE "work_items" SET "status" = 'new' WHERE "type" = 'ticket' AND "status" = 'open';--> statement-breakpoint
UPDATE "work_items" SET "status" = 'waiting_customer' WHERE "type" = 'ticket' AND "status" = 'waiting_on_customer';--> statement-breakpoint
INSERT INTO "conversations" ("organization_id", "client_id", "ticket_id", "channel")
SELECT t."organization_id", w."client_id", t."id", 'internal'
FROM "tickets" t
JOIN "work_items" w ON w."id" = t."work_item_id"
WHERE EXISTS (SELECT 1 FROM "ticket_comments" c WHERE c."ticket_id" = t."id")
  AND NOT EXISTS (SELECT 1 FROM "conversations" cv WHERE cv."ticket_id" = t."id");--> statement-breakpoint
INSERT INTO "messages" ("organization_id", "conversation_id", "direction", "author_user_id", "body", "channel", "occurred_at", "created_at", "metadata")
SELECT t."organization_id", cv."id", 'internal', c."author_id", c."body", 'internal', c."created_at", c."created_at", jsonb_build_object('migratedFromTicketCommentId', c."id")
FROM "ticket_comments" c
JOIN "tickets" t ON t."id" = c."ticket_id"
JOIN "conversations" cv ON cv."ticket_id" = t."id";--> statement-breakpoint
DROP TABLE "ticket_comments" CASCADE;