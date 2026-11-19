CREATE TABLE "moadian_invoices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"serial" bigint NOT NULL,
	"tax_id" varchar(22) NOT NULL,
	"status" varchar(12) DEFAULT 'pending' NOT NULL,
	"reference_number" varchar(64),
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"sent_at" timestamp with time zone,
	"checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "restaurant_settings" ADD COLUMN "moadian" jsonb;--> statement-breakpoint
ALTER TABLE "moadian_invoices" ADD CONSTRAINT "moadian_invoices_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moadian_invoices" ADD CONSTRAINT "moadian_invoices_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "moadian_invoices_invoice_uq" ON "moadian_invoices" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "moadian_invoices_status_idx" ON "moadian_invoices" USING btree ("restaurant_id","status");