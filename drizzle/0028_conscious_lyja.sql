CREATE TYPE "public"."help_chat_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TABLE "help_chat_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"role" "help_chat_role" NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "help_chat_messages" ADD CONSTRAINT "help_chat_messages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "help_chat_messages" ADD CONSTRAINT "help_chat_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "help_chat_messages_user_idx" ON "help_chat_messages" USING btree ("user_id","created_at");