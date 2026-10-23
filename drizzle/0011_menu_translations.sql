CREATE TYPE "public"."menu_translation_kind" AS ENUM('section', 'category', 'product', 'group', 'modifier');--> statement-breakpoint
CREATE TABLE "menu_translations" (
	"organization_id" uuid NOT NULL,
	"establishment_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"kind" "menu_translation_kind" NOT NULL,
	"ref" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "menu_translations_establishment_id_locale_kind_ref_pk" PRIMARY KEY("establishment_id","locale","kind","ref"),
	CONSTRAINT "menu_translations_locale" CHECK ("menu_translations"."locale" in ('en', 'es', 'fr', 'de'))
);
--> statement-breakpoint
ALTER TABLE "menu_translations" ADD CONSTRAINT "menu_translations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_translations" ADD CONSTRAINT "menu_translations_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "menu_translations" TO app_user;--> statement-breakpoint
ALTER TABLE "menu_translations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "menu_translations" TO app_user USING (organization_id = app.current_org()) WITH CHECK (organization_id = app.current_org());
