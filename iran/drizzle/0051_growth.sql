CREATE TABLE "bot_carts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"chat_id" bigint NOT NULL,
	"lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sms_automation_sends" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"kind" varchar(16) NOT NULL,
	"ref" varchar(64) NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "restaurant_settings" ADD COLUMN "sms_automations" jsonb;--> statement-breakpoint
ALTER TABLE "restaurant_settings" ADD COLUMN "bot" jsonb;--> statement-breakpoint
ALTER TABLE "restaurant_settings" ADD COLUMN "platforms" jsonb;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "custom_domain" varchar(253);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "platform" varchar(16);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "external_ref" varchar(64);--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "birth_date" date;--> statement-breakpoint
ALTER TABLE "bot_carts" ADD CONSTRAINT "bot_carts_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_automation_sends" ADD CONSTRAINT "sms_automation_sends_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_automation_sends" ADD CONSTRAINT "sms_automation_sends_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bot_carts_chat_uq" ON "bot_carts" USING btree ("restaurant_id","chat_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sms_automation_sends_uq" ON "sms_automation_sends" USING btree ("restaurant_id","customer_id","kind","ref");--> statement-breakpoint
CREATE INDEX "sms_automation_sends_restaurant_idx" ON "sms_automation_sends" USING btree ("restaurant_id","sent_at");--> statement-breakpoint
CREATE UNIQUE INDEX "restaurants_custom_domain_uq" ON "restaurants" USING btree ("custom_domain") WHERE "restaurants"."custom_domain" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "orders_platform_ref_uq" ON "orders" USING btree ("restaurant_id","platform","external_ref") WHERE "orders"."external_ref" is not null;