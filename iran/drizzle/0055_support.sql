CREATE TABLE "help_articles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"locale" varchar(5) NOT NULL,
	"slug" varchar(80) NOT NULL,
	"title" varchar(160) NOT NULL,
	"body" text NOT NULL,
	"keywords" text DEFAULT '' NOT NULL,
	"audience" varchar(12) DEFAULT 'restaurant' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_canned_replies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"title" varchar(80) NOT NULL,
	"body" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_conversations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"opened_by_user_id" uuid,
	"subject" varchar(160) NOT NULL,
	"status" varchar(12) DEFAULT 'open' NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_from_support" boolean DEFAULT false NOT NULL,
	"restaurant_read_at" timestamp with time zone,
	"support_read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"conversation_id" uuid NOT NULL,
	"author_user_id" uuid,
	"from_support" boolean DEFAULT false NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "support_conversations" ADD CONSTRAINT "support_conversations_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_conversations" ADD CONSTRAINT "support_conversations_opened_by_user_id_users_id_fk" FOREIGN KEY ("opened_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_conversation_id_support_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."support_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "help_articles_locale_slug_uq" ON "help_articles" USING btree ("locale","slug");--> statement-breakpoint
CREATE INDEX "support_conv_restaurant_idx" ON "support_conversations" USING btree ("restaurant_id","last_message_at");--> statement-breakpoint
CREATE INDEX "support_conv_status_idx" ON "support_conversations" USING btree ("status","last_message_at");--> statement-breakpoint
CREATE INDEX "support_msg_conv_idx" ON "support_messages" USING btree ("conversation_id","created_at");