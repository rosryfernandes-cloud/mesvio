ALTER TABLE "clock_entries" DROP CONSTRAINT "clock_entries_kind";--> statement-breakpoint
ALTER TABLE "clock_entries" ADD COLUMN "source" text DEFAULT 'tablet' NOT NULL;--> statement-breakpoint
ALTER TABLE "clock_entries" ADD COLUMN "original_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "clock_entries" ADD COLUMN "edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "clock_entries" ADD COLUMN "edited_by" text;--> statement-breakpoint
ALTER TABLE "clock_entries" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "clock_entries" ADD CONSTRAINT "clock_entries_kind" CHECK ("clock_entries"."kind" in ('in', 'out', 'pause', 'resume'));