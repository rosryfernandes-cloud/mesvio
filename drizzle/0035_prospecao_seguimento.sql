CREATE TABLE "do_not_contact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text,
	"name_key" text NOT NULL,
	"name" text NOT NULL,
	"reason" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "menu_previews" ADD COLUMN "followed_up_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "do_not_contact_email_idx" ON "do_not_contact" USING btree ("email");--> statement-breakpoint
CREATE INDEX "do_not_contact_name_idx" ON "do_not_contact" USING btree ("name_key");--> statement-breakpoint
ALTER TABLE "do_not_contact" ENABLE ROW LEVEL SECURITY;