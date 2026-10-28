CREATE TABLE "platform_passkeys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"credential_id" text NOT NULL,
	"public_key" text NOT NULL,
	"counter" bigint DEFAULT 0 NOT NULL,
	"transports" text[] DEFAULT '{}' NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "platform_passkeys_credential_id_unique" UNIQUE("credential_id")
);
--> statement-breakpoint
CREATE TABLE "platform_recovery_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "platform_passkeys" ADD CONSTRAINT "platform_passkeys_user_id_platform_admins_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."platform_admins"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_recovery_codes" ADD CONSTRAINT "platform_recovery_codes_user_id_platform_admins_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."platform_admins"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Como platform_admins: sem políticas = sem acesso para app_user (só a ligação de sistema).
ALTER TABLE "platform_passkeys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "platform_recovery_codes" ENABLE ROW LEVEL SECURITY;
