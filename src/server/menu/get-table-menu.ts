import "server-only";
import { isWellFormedTableToken } from "@/server/tables/table-token";
import { getDb, type Db } from "@/server/db/client";
import { cache } from "react";
import { cachedPosCatalog, withLocalAvailability } from "@/server/catalog/availability";
import { createDbTableDirectory, type TableDirectory } from "@/server/tables/table-directory";
import type { PosModifierGroup } from "@/server/pos/types";

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
  categories: { ref: string; name: string; section?: string; products: MenuProductView[] }[];
  ordering: { enabled: boolean; reason?: string };
}

export async function getTableMenu(
  token: string,
  deps: { db?: Db; directory?: TableDirectory } = {},
): Promise<TableMenuView | null> {
  if (!isWellFormedTableToken(token)) return null;
  const db = deps.db ?? (await getDb());
  const found = await (deps.directory ?? createDbTableDirectory(db)).findActiveByToken(token);
  if (!found) return null;

  // Esgotados do painel já vieram na transação do diretório; o catálogo do POS vem da cache.
  const catalog = withLocalAvailability(await cachedPosCatalog(found.pos, found.establishmentId), found.locallyUnavailable);
  const categories = [...catalog.categories]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((c) => ({
      ref: c.posCategoryRef,
      name: c.name,
      section: c.section,
      products: catalog.products
        .filter((p) => p.posCategoryRef === c.posCategoryRef)
        .map<MenuProductView>((p) => ({
          ref: p.posProductRef,
          name: p.name,
          description: p.description,
          imageUrl: p.imageUrl,
          priceCents: p.priceCents,
          available: p.available,
          allergens: p.allergens,
          tags: p.tags,
          modifierGroups: p.modifierGroups,
        })),
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
export const getTableMenuForRequest = cache((token: string) => getTableMenu(token));
