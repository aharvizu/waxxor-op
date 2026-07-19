CREATE TYPE "public"."help_module" AS ENUM('today', 'activities', 'tickets', 'projects', 'clients', 'recurring', 'reports', 'indicators', 'settings', 'inbox', 'knowledge');--> statement-breakpoint
CREATE TYPE "public"."knowledge_article_status" AS ENUM('draft', 'in_review', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."knowledge_relation_type" AS ENUM('ticket', 'client', 'project', 'activity');--> statement-breakpoint
CREATE TYPE "public"."knowledge_visibility" AS ENUM('internal', 'client');--> statement-breakpoint
CREATE TABLE "help_tutorial_steps" (
	"id" serial PRIMARY KEY NOT NULL,
	"tutorial_id" integer NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"screenshot_placeholder" text
);
--> statement-breakpoint
CREATE TABLE "help_tutorials" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"module" "help_module" NOT NULL,
	"title" text NOT NULL,
	"objective" text NOT NULL,
	"tips" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"common_mistakes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"module_href" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "help_tutorials_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "knowledge_article_favorites" (
	"id" serial PRIMARY KEY NOT NULL,
	"article_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_article_relations" (
	"id" serial PRIMARY KEY NOT NULL,
	"article_id" integer NOT NULL,
	"related_type" "knowledge_relation_type" NOT NULL,
	"related_id" integer NOT NULL,
	"is_origin" boolean DEFAULT false NOT NULL,
	"created_by_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_article_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"article_id" integer NOT NULL,
	"version_number" integer NOT NULL,
	"title" text NOT NULL,
	"problem" text,
	"cause" text,
	"solution" text,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"edited_by_id" integer,
	"change_summary" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_articles" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"category_id" integer,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"status" "knowledge_article_status" DEFAULT 'draft' NOT NULL,
	"visibility" "knowledge_visibility" DEFAULT 'internal' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"problem" text,
	"cause" text,
	"solution" text,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"anonymized" boolean DEFAULT false NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL,
	"author_id" integer,
	"reviewer_id" integer,
	"review_notes" text,
	"published_at" timestamp,
	"archived_at" timestamp,
	"source_ticket_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"color" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_tutorial_progress" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"tutorial_id" integer NOT NULL,
	"completed_step_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"current_step_index" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp,
	"dismissed_at" timestamp,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "help_tutorial_steps" ADD CONSTRAINT "help_tutorial_steps_tutorial_id_help_tutorials_id_fk" FOREIGN KEY ("tutorial_id") REFERENCES "public"."help_tutorials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_article_favorites" ADD CONSTRAINT "knowledge_article_favorites_article_id_knowledge_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."knowledge_articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_article_favorites" ADD CONSTRAINT "knowledge_article_favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_article_relations" ADD CONSTRAINT "knowledge_article_relations_article_id_knowledge_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."knowledge_articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_article_relations" ADD CONSTRAINT "knowledge_article_relations_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_article_versions" ADD CONSTRAINT "knowledge_article_versions_article_id_knowledge_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."knowledge_articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_article_versions" ADD CONSTRAINT "knowledge_article_versions_edited_by_id_users_id_fk" FOREIGN KEY ("edited_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_category_id_knowledge_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."knowledge_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_source_ticket_id_tickets_id_fk" FOREIGN KEY ("source_ticket_id") REFERENCES "public"."tickets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_categories" ADD CONSTRAINT "knowledge_categories_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_categories" ADD CONSTRAINT "knowledge_categories_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_tutorial_progress" ADD CONSTRAINT "user_tutorial_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_tutorial_progress" ADD CONSTRAINT "user_tutorial_progress_tutorial_id_help_tutorials_id_fk" FOREIGN KEY ("tutorial_id") REFERENCES "public"."help_tutorials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "help_tutorial_steps_unique_idx" ON "help_tutorial_steps" USING btree ("tutorial_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_article_favorites_unique_idx" ON "knowledge_article_favorites" USING btree ("article_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_article_relations_unique_idx" ON "knowledge_article_relations" USING btree ("article_id","related_type","related_id");--> statement-breakpoint
CREATE INDEX "knowledge_article_relations_lookup_idx" ON "knowledge_article_relations" USING btree ("related_type","related_id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_article_versions_unique_idx" ON "knowledge_article_versions" USING btree ("article_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_articles_org_slug_idx" ON "knowledge_articles" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "knowledge_articles_status_idx" ON "knowledge_articles" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "knowledge_articles_category_idx" ON "knowledge_articles" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_categories_org_slug_idx" ON "knowledge_categories" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "user_tutorial_progress_unique_idx" ON "user_tutorial_progress" USING btree ("user_id","tutorial_id");