CREATE TABLE "platform_push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
-- Sem políticas = sem acesso para app_user: só a ligação de sistema da Central lê e escreve.
ALTER TABLE "platform_push_subscriptions" ENABLE ROW LEVEL SECURITY;
