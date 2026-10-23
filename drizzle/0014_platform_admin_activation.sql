ALTER TABLE "platform_admins" ADD COLUMN "enrollment_code_hash" text;--> statement-breakpoint
ALTER TABLE "platform_admins" ADD COLUMN "enrollment_code_expires_at" timestamp with time zone;