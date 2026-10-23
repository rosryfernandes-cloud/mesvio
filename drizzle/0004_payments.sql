CREATE TYPE "public"."payment_provider" AS ENUM('mock', 'stripe');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"establishment_id" uuid NOT NULL,
	"table_session_id" uuid NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"provider_ref" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"application_fee_cents" integer NOT NULL,
	"status" "payment_status" DEFAULT 'PENDING' NOT NULL,
	"method" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "establishments" ADD COLUMN "payments_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "establishments" ADD COLUMN "stripe_account_id" text;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_table_session_id_table_sessions_id_fk" FOREIGN KEY ("table_session_id") REFERENCES "public"."table_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_ref_uq" ON "payments" USING btree ("provider","provider_ref");--> statement-breakpoint
CREATE INDEX "payments_session_idx" ON "payments" USING btree ("table_session_id");