import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { withTenant } from "@/server/db/tenant";
import { menuTranslations } from "@/server/db/schema";
import { DEFAULT_LOCALE, FALLBACK_LOCALE, type Locale } from "@/lib/i18n/messages";

export type TranslationKind = (typeof menuTranslations.$inferSelect)["kind"];

/** Devolve o texto traduzido de um elemento da ementa, ou o original. */
export type MenuTranslator = (
  kind: TranslationKind,
  ref: string,
  name: string,
  description?: string,
) => { name: string; description?: string };

/** Sem tradução: devolve os textos originais. */
export const untranslated: MenuTranslator = (_kind, _ref, name, description) => ({ name, description });
const identity = untranslated;

/**
 * Traduções do restaurante para a língua pedida, com o inglês como reserva (um turista espanhol
 * lê melhor inglês do que português). Em português não há nada a ler.
 */
export async function loadMenuTranslations(db: Db, organizationId: string, establishmentId: string, locale: Locale): Promise<MenuTranslator> {
  if (locale === DEFAULT_LOCALE) return identity;
  const wanted = locale === FALLBACK_LOCALE ? [locale] : [locale, FALLBACK_LOCALE];
  const rows = await withTenant(db, { organizationId }, (tx) =>
    tx
      .select({ locale: menuTranslations.locale, kind: menuTranslations.kind, ref: menuTranslations.ref, name: menuTranslations.name, description: menuTranslations.description })
      .from(menuTranslations)
      .where(and(eq(menuTranslations.establishmentId, establishmentId), inArray(menuTranslations.locale, wanted))),
  );
  if (rows.length === 0) return identity;
  const key = (l: string, kind: string, ref: string) => `${l}|${kind}|${ref}`;
  const map = new Map(rows.map((r) => [key(r.locale, r.kind, r.ref), r]));
  return (kind, ref, name, description) => {
    const hit = map.get(key(locale, kind, ref)) ?? map.get(key(FALLBACK_LOCALE, kind, ref));
    if (!hit) return { name, description };
    // Se o restaurante só traduziu o nome, mantém-se a descrição original (os ingredientes ajudam).
    return { name: hit.name, description: hit.description ?? description };
  };
}
