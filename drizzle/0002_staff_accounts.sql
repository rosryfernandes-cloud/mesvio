CREATE TABLE "staff_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_profiles_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "establishments" DROP COLUMN "staff_code_hash";