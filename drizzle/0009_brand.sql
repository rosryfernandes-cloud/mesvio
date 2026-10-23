ALTER TABLE "establishments" ADD COLUMN "brand_color" text;--> statement-breakpoint
ALTER TABLE "establishments" ADD COLUMN "brand_logo_url" text;--> statement-breakpoint
ALTER TABLE "establishments" ADD CONSTRAINT "establishments_brand_color_hex" CHECK ("establishments"."brand_color" ~ '^#[0-9a-f]{6}$');--> statement-breakpoint
ALTER TABLE "establishments" ADD CONSTRAINT "establishments_brand_logo_https" CHECK ("establishments"."brand_logo_url" ~ '^https://' and length("establishments"."brand_logo_url") <= 500);