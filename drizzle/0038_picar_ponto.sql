CREATE TABLE "clock_employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"establishment_id" uuid NOT NULL,
	"name" text NOT NULL,
	"pin_hash" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clock_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"establishment_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"photo" "bytea",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clock_entries_kind" CHECK ("clock_entries"."kind" in ('in', 'out'))
);
--> statement-breakpoint
ALTER TABLE "establishments" ADD COLUMN "clock_kiosk_token" text;--> statement-breakpoint
ALTER TABLE "clock_employees" ADD CONSTRAINT "clock_employees_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clock_employees" ADD CONSTRAINT "clock_employees_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clock_entries" ADD CONSTRAINT "clock_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clock_entries" ADD CONSTRAINT "clock_entries_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clock_entries" ADD CONSTRAINT "clock_entries_employee_id_clock_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."clock_employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clock_employees_est_idx" ON "clock_employees" USING btree ("establishment_id");--> statement-breakpoint
CREATE INDEX "clock_entries_est_at_idx" ON "clock_entries" USING btree ("establishment_id","at");--> statement-breakpoint
CREATE INDEX "clock_entries_emp_at_idx" ON "clock_entries" USING btree ("employee_id","at");--> statement-breakpoint
ALTER TABLE "establishments" ADD CONSTRAINT "establishments_clock_kiosk_token_unique" UNIQUE("clock_kiosk_token");--> statement-breakpoint
ALTER TABLE "clock_employees" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "clock_employees" TO app_user USING (organization_id = app.current_org()) WITH CHECK (organization_id = app.current_org());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "clock_employees" TO app_user;
--> statement-breakpoint
ALTER TABLE "clock_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "clock_entries" TO app_user USING (organization_id = app.current_org()) WITH CHECK (organization_id = app.current_org());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "clock_entries" TO app_user;
--> statement-breakpoint
-- Tablet de picar ponto: o token do link é a única forma de chegar ao restaurante (só devolve ids).
CREATE OR REPLACE FUNCTION app.resolve_clock_kiosk(p_token text)
RETURNS TABLE (organization_id uuid, establishment_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$ SELECT e.organization_id, e.id FROM establishments e WHERE e.clock_kiosk_token = p_token LIMIT 1 $$
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.resolve_clock_kiosk(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.resolve_clock_kiosk(text) TO app_user;
