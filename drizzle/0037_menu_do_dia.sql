CREATE TABLE "daily_menus" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"establishment_id" uuid NOT NULL,
	"menu_date" date NOT NULL,
	"sections" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "establishments" ADD COLUMN "daily_menu_settings" jsonb;--> statement-breakpoint
ALTER TABLE "daily_menus" ADD CONSTRAINT "daily_menus_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_menus" ADD CONSTRAINT "daily_menus_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "daily_menus_est_date_uq" ON "daily_menus" USING btree ("establishment_id","menu_date");--> statement-breakpoint
ALTER TABLE "daily_menus" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "daily_menus" TO app_user USING (organization_id = app.current_org()) WITH CHECK (organization_id = app.current_org());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "daily_menus" TO app_user;
