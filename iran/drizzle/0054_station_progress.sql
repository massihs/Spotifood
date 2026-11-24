ALTER TABLE "restaurant_settings" ADD COLUMN "default_station_id" uuid;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "ready_at" timestamp with time zone;