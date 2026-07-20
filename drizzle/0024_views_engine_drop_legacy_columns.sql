-- Data migration ahead of the column drops below: preserve what existing
-- rows already recorded before the columns disappear.
-- 1) shared_with_team=true -> scope='team' (closest equivalent scope; the
--    prior model didn't distinguish team vs organization sharing).
UPDATE "saved_views" SET "scope" = 'team' WHERE "shared_with_team" = true;--> statement-breakpoint
-- 2) is_default/is_favorite move from the (owner-only) row itself into the
--    new per-viewer saved_view_preferences table, one row per owner.
INSERT INTO "saved_view_preferences" ("organization_id", "user_id", "view_id", "is_favorite", "is_default")
SELECT "organization_id", "user_id", "id", "is_favorite", "is_default"
FROM "saved_views"
WHERE ("is_favorite" = true OR "is_default" = true) AND "user_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "saved_views" DROP COLUMN "is_default";--> statement-breakpoint
ALTER TABLE "saved_views" DROP COLUMN "is_favorite";--> statement-breakpoint
ALTER TABLE "saved_views" DROP COLUMN "shared_with_team";