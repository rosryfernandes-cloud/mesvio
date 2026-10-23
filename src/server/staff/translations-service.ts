import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/server/db/client";
import { withTenant } from "@/server/db/tenant";
import { auditLogs, menuTranslations, posIntegrations } from "@/server/db/schema";
import { resolvePosAdapter, type PosResolver } from "@/server/pos/registry";
import type { StaffContext } from "./context";
import type { TranslationKind } from "@/server/menu/menu-translations";

type Scope = Pick<StaffContext, "userId" | "organizationId" | "establishmentId">;
const tenantOf = (s: Scope) => ({ organizationId: s.organizationId, userId: s.userId });

export const TRANSLATION_LOCALES = ["en", "es", "fr", "de"] as const;
export type TranslationLocale = (typeof TRANSLATION_LOCALES)[number];

/** Um elemento da ementa a traduzir, com o original do POS e a tradução atual (se houver). */
export interface TranslatableItem {
  kind: TranslationKind;
  ref: string;
  /** Onde aparece (para orientar quem traduz), ex.: "Comida · Entradas". */
  context: string;
  original: { name: string; description?: string };
  translated: { name: string; description?: string } | null;
}

/** Tudo o que se pode traduzir na ementa do estabelecimento, pela ordem da ementa. */
export async function listTranslatable(
  db: Db,
  s: Scope,
  locale: TranslationLocale,
  resolvePos: PosResolver = resolvePosAdapter,
): Promise<TranslatableItem[]> {
  const { provider, rows } = await withTenant(db, tenantOf(s), async (tx) => {
    const [integration] = await tx
      .select({ provider: posIntegrations.provider })
      .from(posIntegrations)
      .where(eq(posIntegrations.establishmentId, s.establishmentId));
    const rows = await tx
      .select()
      .from(menuTranslations)
      .where(and(eq(menuTranslations.establishmentId, s.establishmentId), eq(menuTranslations.locale, locale)));
    return { provider: integration.provider, rows };
  });
  const existing = new Map(rows.map((r) => [`${r.kind}|${r.ref}`, r]));
  const current = (kind: TranslationKind, ref: string) => {
    const r = existing.get(`${kind}|${ref}`);
    return r ? { name: r.name, description: r.description ?? undefined } : null;
  };

  const catalog = await resolvePos(provider, s.establishmentId).fetchCatalog();
  const items: TranslatableItem[] = [];
  const seen = new Set<string>();
  const push = (item: Omit<TranslatableItem, "translated">) => {
    const key = `${item.kind}|${item.ref}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push({ ...item, translated: current(item.kind, item.ref) });
  };

  const categories = [...catalog.categories].sort((a, b) => a.sortOrder - b.sortOrder);
  for (const c of categories) if (c.section) push({ kind: "section", ref: c.section, context: "Secção", original: { name: c.section } });
  for (const c of categories) {
    const where = c.section ? `${c.section} · ${c.name}` : c.name;
    push({ kind: "category", ref: c.posCategoryRef, context: c.section ?? "Categoria", original: { name: c.name } });
    for (const p of catalog.products.filter((x) => x.posCategoryRef === c.posCategoryRef)) {
      push({ kind: "product", ref: p.posProductRef, context: where, original: { name: p.name, description: p.description } });
      for (const g of p.modifierGroups) {
        push({ kind: "group", ref: g.posGroupRef, context: `Opções de ${p.name}`, original: { name: g.name } });
        for (const m of g.modifiers) push({ kind: "modifier", ref: m.posModifierRef, context: `${g.name} (${p.name})`, original: { name: m.name } });
      }
    }
  }
  return items;
}

export const translationChangesSchema = z.object({
  locale: z.enum(TRANSLATION_LOCALES),
  changes: z
    .array(
      z.object({
        kind: z.enum(["section", "category", "product", "group", "modifier"]),
        ref: z.string().min(1).max(200),
        /** Vazio = apagar a tradução (volta ao inglês ou ao original). */
        name: z.string().trim().max(200),
        description: z.string().trim().max(1000).optional(),
      }),
    )
    .min(1)
    .max(500),
});

export type TranslationChanges = z.infer<typeof translationChangesSchema>;

/** Grava (ou apaga, com nome vazio) traduções; só aceita refs que existem na ementa atual. */
export async function saveTranslations(
  db: Db,
  s: Scope,
  { locale, changes }: TranslationChanges,
  resolvePos: PosResolver = resolvePosAdapter,
): Promise<{ saved: number; removed: number }> {
  const valid = new Set((await listTranslatable(db, s, locale, resolvePos)).map((i) => `${i.kind}|${i.ref}`));
  const known = changes.filter((c) => valid.has(`${c.kind}|${c.ref}`));
  const upserts = known.filter((c) => c.name);
  const removals = known.filter((c) => !c.name);

  await withTenant(db, tenantOf(s), async (tx) => {
    for (const c of upserts) {
      await tx
        .insert(menuTranslations)
        .values({
          organizationId: s.organizationId,
          establishmentId: s.establishmentId,
          locale,
          kind: c.kind,
          ref: c.ref,
          name: c.name,
          description: c.description || null,
        })
        .onConflictDoUpdate({
          target: [menuTranslations.establishmentId, menuTranslations.locale, menuTranslations.kind, menuTranslations.ref],
          set: { name: c.name, description: c.description || null, updatedAt: new Date() },
        });
    }
    for (const kind of new Set(removals.map((r) => r.kind))) {
      const refs = removals.filter((r) => r.kind === kind).map((r) => r.ref);
      await tx
        .delete(menuTranslations)
        .where(
          and(
            eq(menuTranslations.establishmentId, s.establishmentId),
            eq(menuTranslations.locale, locale),
            eq(menuTranslations.kind, kind),
            inArray(menuTranslations.ref, refs),
          ),
        );
    }
    await tx.insert(auditLogs).values({
      organizationId: s.organizationId,
      actorType: "user",
      actorId: s.userId,
      action: "menu.translations",
      entityType: "establishment",
      entityId: s.establishmentId,
      after: { locale, saved: upserts.length, removed: removals.length },
    });
  });
  return { saved: upserts.length, removed: removals.length };
}
