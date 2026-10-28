ALTER TABLE "categories" ADD COLUMN "station" text DEFAULT 'kitchen' NOT NULL;--> statement-breakpoint
UPDATE "categories" SET "station" = 'bar' WHERE (coalesce("section", '') || ' ' || "name") ~* '(bebida|drink|caf[eé]|coffee|vinho|wine|cerveja|beer|cocktail|sumo|juice|refriger|[aá]gua|water|sangria|limonada|smoothie|gin)';
