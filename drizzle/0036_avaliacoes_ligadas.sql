ALTER TABLE "establishments" ALTER COLUMN "reviews_enabled" SET DEFAULT true;
--> statement-breakpoint
-- Ligar as avaliações em todos os restaurantes que já existem (estavam desligadas por defeito).
UPDATE "establishments" SET "reviews_enabled" = true WHERE "reviews_enabled" = false;
