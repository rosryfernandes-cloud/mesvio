ALTER TABLE "dining_tables" ADD COLUMN "assigned_user_id" uuid;--> statement-breakpoint
ALTER TABLE "establishments" ADD COLUMN "table_assignments_enabled" boolean DEFAULT false NOT NULL;