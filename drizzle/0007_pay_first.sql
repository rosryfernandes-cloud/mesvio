CREATE TYPE "public"."ordering_mode" AS ENUM('pay_later', 'pay_first');--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE 'AWAITING_PAYMENT' BEFORE 'RECEIVED';--> statement-breakpoint
ALTER TABLE "dining_tables" ADD COLUMN "zone" text;--> statement-breakpoint
ALTER TABLE "dining_tables" ADD COLUMN "ordering_mode" "ordering_mode" DEFAULT 'pay_later' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "order_id" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;