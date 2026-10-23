ALTER TABLE "platform_admins" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "platform_admins" ADD COLUMN "display_name" text;--> statement-breakpoint
ALTER TABLE "platform_admins" ADD COLUMN "totp_secret_ciphertext" text;--> statement-breakpoint
ALTER TABLE "platform_admins" ADD COLUMN "totp_pending_ciphertext" text;--> statement-breakpoint
ALTER TABLE "platform_admins" ADD COLUMN "totp_enabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "platform_admins" ADD COLUMN "totp_last_step" bigint;