ALTER TABLE "demo_requests" ADD COLUMN "confirmation_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "demo_requests" ADD COLUMN "status" text DEFAULT 'new' NOT NULL;--> statement-breakpoint
ALTER TABLE "demo_requests" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "demo_requests" ADD COLUMN "status_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "demo_requests" ADD CONSTRAINT "demo_requests_status_check" CHECK ("demo_requests"."status" in ('new', 'contacted', 'demo', 'client', 'lost'));