ALTER TABLE "establishments" ADD COLUMN "billing_customer_id" text;--> statement-breakpoint
ALTER TABLE "establishments" ADD COLUMN "billing_subscription_id" text;--> statement-breakpoint
ALTER TABLE "establishments" ADD COLUMN "billing_status" text;--> statement-breakpoint
ALTER TABLE "establishments" ADD COLUMN "billing_period_end" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "establishments" ADD COLUMN "invoicing_account" text;--> statement-breakpoint
ALTER TABLE "establishments" ADD COLUMN "invoicing_api_key_ciphertext" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "invoice_nif" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "invoice_email" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "invoice_status" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "invoice_ref" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "invoice_error" text;