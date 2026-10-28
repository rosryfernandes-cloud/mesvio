ALTER TYPE "public"."service_request_kind" ADD VALUE 'paid';--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "tip_cents" integer DEFAULT 0 NOT NULL;