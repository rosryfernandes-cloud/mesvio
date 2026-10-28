import "server-only";
import { asc, eq, inArray } from "drizzle-orm";
import { getDb, type Db } from "@/server/db/client";
import { categories, modifierGroups, modifiers, productModifierGroups, products } from "@/server/db/schema";
import type { PosAdapter, PosCapabilities, PosCatalog, PosOrderRequest, PosOrderResult, PosSaleDocument, PosTable } from "../types";

/**
 * "Ementa MESVIO": restaurante sem integração POS. A ementa vive na base de dados da MESVIO e é
 * editada no painel (separador Ementa); os pedidos ficam aceites de imediato e saem em talão na
 * cozinha (impressão no painel). Para o resto da app é um POS como os outros: a ementa do cliente,
 * os preços dos pedidos, os esgotados, as fotos e as traduções funcionam da mesma forma.
 */
export class MesvioMenuAdapter implements PosAdapter {
  readonly provider = "mesvio" as const;
  readonly capabilities: PosCapabilities = {
    catalogSync: true,
    tableSync: false,
    createOrder: true,
    orderAcknowledgement: true,
    orderStatusUpdates: false,
    // Não há sistema externo: aceitar o mesmo pedido duas vezes não duplica nada.
    externalIdempotencyKey: true,
    salesReconciliation: false,
    refundsAndCancellations: false,
    availabilitySync: false,
  };

  constructor(
    private readonly establishmentId: string,
    private readonly db: () => Promise<Db> = getDb,
  ) {}

  async healthCheck() {
    return { ok: true, detail: "Ementa MESVIO (sem POS)" };
  }

  /** Lê a ementa do restaurante (ligação de sistema, filtrada pelo restaurante). */
  async fetchCatalog(): Promise<PosCatalog> {
    const db = await this.db();
    const cats = await db
      .select()
      .from(categories)
      .where(eq(categories.establishmentId, this.establishmentId))
      .orderBy(asc(categories.sortOrder), asc(categories.name));
    const prods = await db
      .select()
      .from(products)
      .where(eq(products.establishmentId, this.establishmentId))
      .orderBy(asc(products.sortOrder), asc(products.name));
    const links = prods.length
      ? await db
          .select()
          .from(productModifierGroups)
          .where(inArray(productModifierGroups.productId, prods.map((p) => p.id)))
          .orderBy(asc(productModifierGroups.sortOrder))
      : [];
    const groups = links.length
      ? await db.select().from(modifierGroups).where(inArray(modifierGroups.id, [...new Set(links.map((l) => l.groupId))]))
      : [];
    const mods = groups.length
      ? await db
          .select()
          .from(modifiers)
          .where(inArray(modifiers.groupId, groups.map((g) => g.id)))
          .orderBy(asc(modifiers.sortOrder), asc(modifiers.name))
      : [];

    const refOfCategory = new Map(cats.map((c) => [c.id, c.posCategoryRef ?? c.id]));
    const visible = new Set(cats.filter((c) => c.visible).map((c) => c.id));
    const groupById = new Map(groups.map((g) => [g.id, g]));
    return {
      categories: cats
        .filter((c) => c.visible)
        .map((c, i) => ({ posCategoryRef: refOfCategory.get(c.id)!, name: c.name, sortOrder: i, section: c.section ?? undefined })),
      products: prods
        .filter((p) => visible.has(p.categoryId))
        .map((p) => ({
          posProductRef: p.posProductRef,
          posCategoryRef: refOfCategory.get(p.categoryId)!,
          name: p.name,
          description: p.description ?? undefined,
          priceCents: p.priceCents,
          vatRateBps: p.vatRateBps,
          available: p.posAvailable,
          allergens: p.allergens,
          tags: p.tags,
          modifierGroups: links
            .filter((l) => l.productId === p.id)
            .map((l) => groupById.get(l.groupId)!)
            .filter(Boolean)
            .map((g) => ({
              posGroupRef: g.posGroupRef ?? g.id,
              name: g.name,
              kind: g.kind,
              minSelect: g.minSelect,
              maxSelect: g.maxSelect,
              modifiers: mods
                .filter((m) => m.groupId === g.id)
                .map((m) => ({ posModifierRef: m.posModifierRef, name: m.name, priceDeltaCents: m.priceDeltaCents, available: m.available })),
            })),
        })),
      fetchedAt: new Date(),
    };
  }

  async fetchTables(): Promise<PosTable[]> {
    return [];
  }

  /** Sem POS do outro lado: o pedido fica aceite e sai em talão na cozinha. */
  async submitOrder(order: PosOrderRequest): Promise<PosOrderResult> {
    return { outcome: "accepted", posOrderRef: `MESVIO-${order.externalOrderId.slice(0, 8)}` };
  }

  async fetchSalesDocuments(): Promise<PosSaleDocument[]> {
    return [];
  }
}
