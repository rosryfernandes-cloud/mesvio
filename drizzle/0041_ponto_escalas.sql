CREATE TABLE "clock_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"establishment_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"work_date" date NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"late_notified_at" timestamp with time zone,
	"out_notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "establishments" ADD COLUMN "clock_notify" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "clock_schedules" ADD CONSTRAINT "clock_schedules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clock_schedules" ADD CONSTRAINT "clock_schedules_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clock_schedules" ADD CONSTRAINT "clock_schedules_employee_id_clock_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."clock_employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clock_schedules_est_date_idx" ON "clock_schedules" USING btree ("establishment_id","work_date");--> statement-breakpoint
CREATE INDEX "clock_schedules_emp_date_idx" ON "clock_schedules" USING btree ("employee_id","work_date");--> statement-breakpoint
ALTER TABLE "clock_schedules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "clock_schedules" TO app_user USING (organization_id = app.current_org()) WITH CHECK (organization_id = app.current_org());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "clock_schedules" TO app_user;
