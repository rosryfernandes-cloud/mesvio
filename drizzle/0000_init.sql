CREATE TYPE "public"."commission_basis" AS ENUM('NET', 'GROSS');--> statement-breakpoint
CREATE TYPE "public"."integration_status" AS ENUM('not_configured', 'healthy', 'degraded', 'failing', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."ledger_entry_type" AS ENUM('ACCRUAL', 'REVERSAL', 'ADJUSTMENT');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'manager', 'staff');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('RECEIVED', 'SUBMITTING', 'SUBMITTED', 'FAILED_RETRYING', 'NEEDS_ATTENTION', 'ACCEPTED', 'REJECTED', 'IN_PREPARATION', 'SERVED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."org_status" AS ENUM('active', 'suspended', 'onboarding');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('PENDING', 'DISPATCHED', 'DONE', 'DEAD');--> statement-breakpoint
CREATE TYPE "public"."pos_provider" AS ENUM('mock', 'zonesoft');--> statement-breakpoint
CREATE TYPE "public"."sale_doc_status" AS ENUM('INVOICED', 'CANCELLED', 'CREDITED');--> statement-breakpoint
CREATE TYPE "public"."statement_status" AS ENUM('DRAFT', 'APPROVED', 'INVOICED', 'PAID', 'VOID');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_statements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"status" "statement_status" DEFAULT 'DRAFT' NOT NULL,
	"base_total_cents" integer NOT NULL,
	"commission_cents" integer NOT NULL,
	"vat_on_service_cents" integer NOT NULL,
	"external_invoice_ref" text,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"establishment_id" uuid NOT NULL,
	"pos_category_ref" text,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"visible" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"establishment_id" uuid NOT NULL,
	"pos_sale_id" uuid,
	"rule_id" uuid,
	"type" "ledger_entry_type" NOT NULL,
	"basis" "commission_basis" NOT NULL,
	"base_cents" integer NOT NULL,
	"rate_bps" integer NOT NULL,
	"amount_micro_cents" bigint NOT NULL,
	"algorithm_version" text NOT NULL,
	"reason" text,
	"statement_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"establishment_id" uuid,
	"rate_bps" integer DEFAULT 100 NOT NULL,
	"basis" "commission_basis" DEFAULT 'NET' NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dining_tables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"establishment_id" uuid NOT NULL,
	"label" text NOT NULL,
	"pos_table_ref" text,
	"public_token" text NOT NULL,
	"token_rotated_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dining_tables_public_token_unique" UNIQUE("public_token")
);
--> statement-breakpoint
CREATE TABLE "establishments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"address" text,
	"timezone" text DEFAULT 'Europe/Lisbon' NOT NULL,
	"opening_hours" jsonb,
	"ordering_enabled" boolean DEFAULT true NOT NULL,
	"manual_acceptance" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "member_role" NOT NULL,
	"establishment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "modifier_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"establishment_id" uuid NOT NULL,
	"pos_group_ref" text,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"min_select" integer DEFAULT 0 NOT NULL,
	"max_select" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "modifiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"pos_modifier_ref" text NOT NULL,
	"name" text NOT NULL,
	"price_delta_cents" integer DEFAULT 0 NOT NULL,
	"available" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"from_status" "order_status",
	"to_status" "order_status" NOT NULL,
	"source" text NOT NULL,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid,
	"line_no" integer NOT NULL,
	"pos_product_ref" text NOT NULL,
	"name" text NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"vat_rate_bps" integer NOT NULL,
	"quantity" integer NOT NULL,
	"line_gross_cents" integer NOT NULL,
	"notes" text,
	"modifiers" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"establishment_id" uuid NOT NULL,
	"table_id" uuid NOT NULL,
	"table_session_id" uuid,
	"idempotency_key" text NOT NULL,
	"short_code" text NOT NULL,
	"status" "order_status" DEFAULT 'RECEIVED' NOT NULL,
	"pos_order_ref" text,
	"total_gross_cents" integer NOT NULL,
	"total_net_cents" integer NOT NULL,
	"notes" text,
	"client_ip_hash" text,
	"submit_attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legal_name" text NOT NULL,
	"nif" text NOT NULL,
	"status" "org_status" DEFAULT 'onboarding' NOT NULL,
	"billing_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_nif_unique" UNIQUE("nif")
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"topic" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "outbox_status" DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_admins" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pos_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"establishment_id" uuid NOT NULL,
	"provider" "pos_provider" NOT NULL,
	"status" "integration_status" DEFAULT 'not_configured' NOT NULL,
	"credentials_ciphertext" text,
	"credentials_key_id" text,
	"last_catalog_sync_at" timestamp with time zone,
	"last_error_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pos_integrations_establishment_id_unique" UNIQUE("establishment_id")
);
--> statement-breakpoint
CREATE TABLE "pos_sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"establishment_id" uuid NOT NULL,
	"order_id" uuid,
	"pos_document_ref" text NOT NULL,
	"status" "sale_doc_status" NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"attributable_gross_cents" integer NOT NULL,
	"attributable_net_cents" integer NOT NULL,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_modifier_groups" (
	"product_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "product_modifier_groups_product_id_group_id_pk" PRIMARY KEY("product_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"establishment_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"pos_product_ref" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"image_url" text,
	"price_cents" integer NOT NULL,
	"vat_rate_bps" integer NOT NULL,
	"allergens" text[] DEFAULT '{}' NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"pos_available" boolean DEFAULT true NOT NULL,
	"locally_unavailable" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"synced_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "rate_limit_buckets" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limit_buckets_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
CREATE TABLE "table_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"table_id" uuid NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing_statements" ADD CONSTRAINT "billing_statements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_ledger" ADD CONSTRAINT "commission_ledger_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_ledger" ADD CONSTRAINT "commission_ledger_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_ledger" ADD CONSTRAINT "commission_ledger_pos_sale_id_pos_sales_id_fk" FOREIGN KEY ("pos_sale_id") REFERENCES "public"."pos_sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_ledger" ADD CONSTRAINT "commission_ledger_rule_id_commission_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."commission_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dining_tables" ADD CONSTRAINT "dining_tables_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dining_tables" ADD CONSTRAINT "dining_tables_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "establishments" ADD CONSTRAINT "establishments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modifier_groups" ADD CONSTRAINT "modifier_groups_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modifier_groups" ADD CONSTRAINT "modifier_groups_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modifiers" ADD CONSTRAINT "modifiers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modifiers" ADD CONSTRAINT "modifiers_group_id_modifier_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."modifier_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_table_id_dining_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."dining_tables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_table_session_id_table_sessions_id_fk" FOREIGN KEY ("table_session_id") REFERENCES "public"."table_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_integrations" ADD CONSTRAINT "pos_integrations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_integrations" ADD CONSTRAINT "pos_integrations_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_sales" ADD CONSTRAINT "pos_sales_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_sales" ADD CONSTRAINT "pos_sales_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_sales" ADD CONSTRAINT "pos_sales_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_modifier_groups" ADD CONSTRAINT "product_modifier_groups_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_modifier_groups" ADD CONSTRAINT "product_modifier_groups_group_id_modifier_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."modifier_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_table_id_dining_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."dining_tables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_org_created_idx" ON "audit_logs" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_statements_org_period_uq" ON "billing_statements" USING btree ("organization_id","period_start");--> statement-breakpoint
CREATE INDEX "categories_est_idx" ON "categories" USING btree ("organization_id","establishment_id");--> statement-breakpoint
CREATE INDEX "commission_ledger_org_est_idx" ON "commission_ledger" USING btree ("organization_id","establishment_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "commission_ledger_sale_type_uq" ON "commission_ledger" USING btree ("pos_sale_id","type");--> statement-breakpoint
CREATE INDEX "dining_tables_est_idx" ON "dining_tables" USING btree ("organization_id","establishment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "establishments_org_slug_uq" ON "establishments" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_user_org_est_uq" ON "memberships" USING btree ("user_id","organization_id","establishment_id");--> statement-breakpoint
CREATE INDEX "order_events_order_idx" ON "order_events" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_est_idem_uq" ON "orders" USING btree ("establishment_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "orders_org_est_created_idx" ON "orders" USING btree ("organization_id","establishment_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "outbox_pending_idx" ON "outbox" USING btree ("status","available_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pos_sales_est_doc_uq" ON "pos_sales" USING btree ("establishment_id","pos_document_ref");--> statement-breakpoint
CREATE INDEX "products_est_idx" ON "products" USING btree ("organization_id","establishment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "products_est_posref_uq" ON "products" USING btree ("establishment_id","pos_product_ref");--> statement-breakpoint
CREATE INDEX "rate_limit_window_idx" ON "rate_limit_buckets" USING btree ("window_start");--> statement-breakpoint
CREATE INDEX "table_sessions_table_idx" ON "table_sessions" USING btree ("table_id","opened_at");