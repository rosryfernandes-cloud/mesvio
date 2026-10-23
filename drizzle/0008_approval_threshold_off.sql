ALTER TABLE "establishments" ALTER COLUMN "approval_threshold_cents" DROP DEFAULT;--> statement-breakpoint
-- Desligar o limite onde estava no valor antigo por omissão (ainda não há restaurantes reais).
UPDATE "establishments" SET "approval_threshold_cents" = NULL WHERE "approval_threshold_cents" = 15000;
