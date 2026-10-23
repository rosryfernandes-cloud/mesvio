CREATE TABLE "product_availability_overrides" (
	"organization_id" uuid NOT NULL,
	"establishment_id" uuid NOT NULL,
	"pos_product_ref" text NOT NULL,
	"unavailable" boolean NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_availability_overrides_establishment_id_pos_product_ref_pk" PRIMARY KEY("establishment_id","pos_product_ref")
);
--> statement-breakpoint
ALTER TABLE "establishments" ADD COLUMN "staff_code_hash" text;--> statement-breakpoint
ALTER TABLE "product_availability_overrides" ADD CONSTRAINT "product_availability_overrides_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_availability_overrides" ADD CONSTRAINT "product_availability_overrides_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE no action ON UPDATE no action;