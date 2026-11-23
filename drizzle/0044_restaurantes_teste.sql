ALTER TABLE "establishments" ADD COLUMN "is_test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- O restaurante de demonstração (POS de testes) começa já marcado como teste.
UPDATE "establishments" SET "is_test" = true WHERE "id" = '00000000-0000-4000-8000-000000000010';
