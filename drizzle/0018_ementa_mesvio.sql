ALTER TYPE "public"."pos_provider" ADD VALUE 'mesvio';--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "section" text;--> statement-breakpoint
ALTER TABLE "modifiers" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;