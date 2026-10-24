CREATE TABLE "menu_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"establishment_id" uuid NOT NULL,
	"pos_product_ref" text NOT NULL,
	"content_type" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "menu_images_type" CHECK ("menu_images"."content_type" in ('image/jpeg', 'image/png', 'image/webp')),
	CONSTRAINT "menu_images_size" CHECK ("menu_images"."size_bytes" <= 1048576)
);
--> statement-breakpoint
ALTER TABLE "menu_images" ADD CONSTRAINT "menu_images_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_images" ADD CONSTRAINT "menu_images_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "menu_images_est_product_uq" ON "menu_images" USING btree ("establishment_id","pos_product_ref");--> statement-breakpoint
ALTER TABLE "menu_images" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "menu_images" TO app_user USING (organization_id = app.current_org()) WITH CHECK (organization_id = app.current_org());
