ALTER TABLE "establishments" ADD COLUMN "plan" text DEFAULT 'payments' NOT NULL;--> statement-breakpoint
ALTER TABLE "establishments" ADD CONSTRAINT "establishments_plan_check" CHECK ("plan" in ('menu', 'orders', 'payments'));
