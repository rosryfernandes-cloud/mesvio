CREATE TABLE "demo_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"business" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"venue_type" text,
	"message" text,
	"ip_hash" text,
	"notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "demo_requests_created_idx" ON "demo_requests" USING btree ("created_at");--> statement-breakpoint
-- Sem políticas: só o servidor (dono da tabela) lê e escreve; app_user e os roles anon/authenticated da Supabase não.
ALTER TABLE "demo_requests" ENABLE ROW LEVEL SECURITY;
