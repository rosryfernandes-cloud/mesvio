ALTER TABLE "menu_translations" DROP CONSTRAINT "menu_translations_locale";--> statement-breakpoint
-- Só fica o inglês: espanhol, francês e alemão deixaram de existir na ementa.
DELETE FROM "menu_translations" WHERE "locale" <> 'en';--> statement-breakpoint
ALTER TABLE "menu_translations" ADD CONSTRAINT "menu_translations_locale" CHECK ("menu_translations"."locale" = 'en');