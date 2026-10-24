import "server-only";
import { isWellFormedTableToken } from "@/server/tables/table-token";
import { getDb, type Db } from "@/server/db/client";
import { cache } from "react";
import { cachedPosCatalog, withLocalAvailability } from "@/server/catalog/availability";
import { createDbTableDirectory, type TableDirectory } from "@/server/tables/table-directory";
import type { PosModifierGroup } from "@/server/pos/types";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/messages";
import { translateAllergen, translateTag } from "@/lib/i18n/food-terms";
import { loadMenuTranslations, type MenuTranslator } from "./menu-translations";
import { productImageUrls } from "./menu-images";

/** Forma da ementa enviada ao cliente: só o necessário, sem dados internos. */
export interface MenuProductView {
  ref: string;
  name: string;
  description?: string;
  imageUrl?: string;
  priceCents: number;
  available: boolean;
  allergens: string[];
  tags: string[];
  modifierGroups: PosModifierGroup[];
}

export interface TableMenuView {
  establishment: { name: string; address?: string };
  table: { label: string; zone: string | null; orderingMode: "pay_later" | "pay_first" };
  /** `section`: nome mostrado (traduzido); `sectionKey`: nome original, estável entre línguas. */
  categories: { ref: string; name: string; section?: string; sectionKey?: string; products: MenuProductView[] }[];
  ordering: { enabled: boolean; reason?: string };
}

export async function getTableMenu(
  token: string,
  deps: { db?: Db; directory?: TableDirectory; locale?: Locale } = {},
): Promise<TableMenuView | null> {
  if (!isWellFormedTableToken(token)) return null;
  const db = deps.db ?? (await getDb());
  const found = await (deps.directory ?? createDbTableDirectory(db)).findActiveByToken(token);
  if (!found) return null;

  // Esgotados do painel já vieram na transação do diretório; o catálogo do POS vem da cache.
  const catalog = withLocalAvailability(await cachedPosCatalog(found.pos, found.establishmentId), found.locallyUnavailable);
  const locale = deps.locale ?? DEFAULT_LOCALE;
  // Só fora do português há traduções a ler (uma consulta, no tenant do restaurante).
  const [tr, photos]: [MenuTranslator, Map<string, string>] = await Promise.all([
    loadMenuTranslations(db, found.organizationId, found.establishmentId, locale),
    productImageUrls(db, found.organizationId, found.establishmentId),
  ]);
  const categories = [...catalog.categories]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((c) => ({
      ref: c.posCategoryRef,
      name: tr("category", c.posCategoryRef, c.name).name,
      section: c.section && tr("section", c.section, c.section).name,
      sectionKey: c.section,
      products: catalog.products
        .filter((p) => p.posCategoryRef === c.posCategoryRef)
        .map<MenuProductView>((p) => {
          const t = tr("product", p.posProductRef, p.name, p.description);
          return {
            ref: p.posProductRef,
            name: t.name,
            description: t.description,
            // A foto enviada pelo restaurante no painel tem prioridade sobre a do POS.
            imageUrl: photos.get(p.posProductRef) ?? p.imageUrl,
            priceCents: p.priceCents,
            available: p.available,
            allergens: p.allergens.map((a) => translateAllergen(a, locale)),
            tags: p.tags.map((tag) => translateTag(tag, locale)),
            modifierGroups: p.modifierGroups.map((g) => ({
              ...g,
              name: tr("group", g.posGroupRef, g.name).name,
              modifiers: g.modifiers.map((m) => ({ ...m, name: tr("modifier", m.posModifierRef, m.name).name })),
            })),
          };
        }),
    }))
    .filter((c) => c.products.length > 0);

  return {
    establishment: { name: found.establishmentName, address: found.establishmentAddress },
    table: { label: found.tableLabel, zone: found.zone, orderingMode: found.orderingMode },
    categories,
    ordering: found.pos.capabilities.createOrder
      ? { enabled: true }
      : { enabled: false, reason: "Este restaurante ainda não recebe pedidos pela app." },
  };
}

/**
 * Mesma ementa partilhada entre `generateMetadata` e a página no mesmo pedido HTTP (React.cache):
 * antes, cada visita lia a BD duas vezes.
 */
export const getTableMenuForRequest = cache((token: string, locale: Locale) => getTableMenu(token, { locale }));
