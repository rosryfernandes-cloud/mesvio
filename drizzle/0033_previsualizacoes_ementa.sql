CREATE TABLE "menu_previews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"restaurant_name" text NOT NULL,
	"menu" jsonb NOT NULL,
	"translations" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" text,
	"created_by" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"first_viewed_at" timestamp with time zone,
	"last_viewed_at" timestamp with time zone,
	"activation_requested_at" timestamp with time zone,
	"activation_contact" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "menu_previews_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE INDEX "menu_previews_created_idx" ON "menu_previews" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "menu_previews" ENABLE ROW LEVEL SECURITY;