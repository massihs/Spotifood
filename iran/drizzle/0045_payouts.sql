CREATE TABLE "payout_accounts" (
	"restaurant_id" uuid PRIMARY KEY NOT NULL,
	"holder_name" varchar(120) NOT NULL,
	"iban_enc" text NOT NULL,
	"iban_last4" varchar(4) NOT NULL,
	"bank_code" varchar(3) NOT NULL,
	"card_enc" text,
	"card_last4" varchar(4),
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	"currency" varchar(3) NOT NULL,
	"reference" varchar(64) NOT NULL,
	"note" text,
	"iban_last4" varchar(4),
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payouts_amount_chk" CHECK ("payouts"."amount_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "restaurant_settings" ADD COLUMN "online_payment_collection" varchar(16) DEFAULT 'platform' NOT NULL;--> statement-breakpoint
ALTER TABLE "payout_accounts" ADD CONSTRAINT "payout_accounts_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_accounts" ADD CONSTRAINT "payout_accounts_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payouts_restaurant_paid_idx" ON "payouts" USING btree ("restaurant_id","paid_at");--> statement-breakpoint
-- Restaurants that already entered their own Zarinpal merchant id keep collecting on it.
UPDATE "restaurant_settings" SET "online_payment_collection" = 'own' WHERE "zarinpal_merchant_id" IS NOT NULL;
