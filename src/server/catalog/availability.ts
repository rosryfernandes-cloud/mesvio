import "server-only";
import { and, eq } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { productAvailabilityOverrides } from "@/server/db/schema";
import type { PosAdapter, PosCatalog } from "@/server/pos/types";

/** Referências dos artigos marcados como esgotados no painel. */
export async function listLocallyUnavailable(db: Db, establishmentId: string): Promise<Set<string>> {
  const rows = await db
    .select({ ref: productAvailabilityOverrides.posProductRef })
    .from(productAvailabilityOverrides)
    .where(and(eq(productAvailabilityOverrides.establishmentId, establishmentId), eq(productAvailabilityOverrides.unavailable, true)));
  return new Set(rows.map((r) => r.ref));
}

export async function setLocallyUnavailable(
  db: Db,
  scope: { organizationId: string; establishmentId: string },
  posProductRef: string,
  unavailable: boolean,
): Promise<void> {
  await db
    .insert(productAvailabilityOverrides)
    .values({ organizationId: scope.organizationId, establishmentId: scope.establishmentId, posProductRef, unavailable, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [productAvailabilityOverrides.establishmentId, productAvailabilityOverrides.posProductRef],
      set: { unavailable, updatedAt: new Date() },
    });
}

/** Quanto tempo se reaproveita o catálogo lido do POS (auditoria X1/A8). */
export const CATALOG_TTL_MS = 30_000;

interface CatalogEntry {
  fetchedAt: number;
  catalog?: PosCatalog;
  inflight?: Promise<PosCatalog>;
}
// Por adaptador (um por restaurante, ver registry) e por estabelecimento.
const catalogCache = new WeakMap<PosAdapter, Map<string, CatalogEntry>>();

/**
 * Catálogo do POS com cache curta: abrir a ementa não chama o POS a cada visita (com 60 mesas
 * isso eram centenas de chamadas por minuto à API do POS). Pedidos simultâneos partilham a
 * mesma chamada; se o POS falhar, serve-se o último catálogo bom em vez de uma ementa vazia.
 */
export async function cachedPosCatalog(pos: PosAdapter, establishmentId: string, now = Date.now()): Promise<PosCatalog> {
  let byEst = catalogCache.get(pos);
  if (!byEst) catalogCache.set(pos, (byEst = new Map()));
  const entry = byEst.get(establishmentId) ?? { fetchedAt: 0 };
  byEst.set(establishmentId, entry);

  if (entry.catalog && now - entry.fetchedAt < CATALOG_TTL_MS) return entry.catalog;
  entry.inflight ??= pos
    .fetchCatalog()
    .then((catalog) => {
      entry.catalog = catalog;
      entry.fetchedAt = Date.now();
      return catalog;
    })
    .catch((err) => {
      if (entry.catalog) {
        console.error(`[catálogo] POS indisponível para ${establishmentId}; a usar o último catálogo`, err);
        return entry.catalog;
      }
      throw err;
    })
    .finally(() => {
      entry.inflight = undefined;
    });
  return entry.inflight;
}

/** Esquecer o catálogo em cache (ex.: o POS avisou que mudou; testes). */
export function invalidateCatalog(pos: PosAdapter): void {
  catalogCache.delete(pos);
}

/**
 * Catálogo do POS com os esgotados do painel aplicados. É este que a ementa mostra e que
 * o servidor usa para validar pedidos — um artigo esgotado no painel não pode ser pedido.
 * Os esgotados do painel são lidos sempre da BD (efeito imediato); o catálogo do POS vem da cache.
 */
export async function fetchEffectiveCatalog(db: Db, establishmentId: string, pos: PosAdapter): Promise<PosCatalog> {
  const [catalog, unavailable] = await Promise.all([cachedPosCatalog(pos, establishmentId), listLocallyUnavailable(db, establishmentId)]);
  return withLocalAvailability(catalog, unavailable);
}

/** Aplica ao catálogo do POS os esgotados do painel (já lidos, ex.: na transação do diretório de mesas). */
export function withLocalAvailability(catalog: PosCatalog, unavailable: Set<string>): PosCatalog {
  if (unavailable.size === 0) return catalog;
  return {
    ...catalog,
    products: catalog.products.map((p) => (unavailable.has(p.posProductRef) ? { ...p, available: false } : p)),
  };
}
