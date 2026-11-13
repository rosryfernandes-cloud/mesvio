import "server-only";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { orderItems, orders } from "@/server/db/schema";
import { withTenant } from "@/server/db/tenant";

/**
 * "Costuma acompanhar": para cada artigo, os que mais vezes foram pedidos com ele no mesmo pedido.
 * Vem só de pedidos reais do restaurante (nada inventado): sem histórico, não há sugestões.
 */
export const PAIRING_WINDOW_DAYS = 60;
/** Pedidos recentes analisados, no máximo (chega para um padrão e mantém a consulta leve). */
const MAX_ORDERS = 2000;
/** Só sugere um par visto pelo menos estas vezes (evita sugestões por acaso). */
export const MIN_TOGETHER = 3;
const PER_PRODUCT = 2;

/** De listas de artigos por pedido → os artigos mais pedidos em conjunto com cada um. */
export function computePairings(orderRefs: string[][], minTogether = MIN_TOGETHER, perProduct = PER_PRODUCT): Record<string, string[]> {
  const together = new Map<string, Map<string, number>>();
  for (const refs of orderRefs) {
    const unique = [...new Set(refs)];
    for (const a of unique) {
      for (const b of unique) {
        if (a === b) continue;
        const row = together.get(a) ?? new Map<string, number>();
        row.set(b, (row.get(b) ?? 0) + 1);
        together.set(a, row);
      }
    }
  }
  const out: Record<string, string[]> = {};
  for (const [ref, row] of together) {
    const best = [...row]
      .filter(([, n]) => n >= minTogether)
      .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
      .slice(0, perProduct)
      .map(([other]) => other);
    if (best.length) out[ref] = best;
  }
  return out;
}

/** Pares do restaurante a partir dos pedidos dos últimos 60 dias que chegaram à cozinha. */
export async function loadPairings(db: Db, organizationId: string, establishmentId: string, now = new Date()): Promise<Record<string, string[]>> {
  const since = new Date(now.getTime() - PAIRING_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return withTenant(db, { organizationId }, async (tx) => {
    const recent = await tx
      .select({ id: orders.id })
      .from(orders)
      .where(
        and(
          eq(orders.establishmentId, establishmentId),
          gte(orders.createdAt, since),
          inArray(orders.status, ["ACCEPTED", "IN_PREPARATION", "SERVED"]),
        ),
      )
      .orderBy(desc(orders.createdAt))
      .limit(MAX_ORDERS);
    if (recent.length < MIN_TOGETHER) return {};
    const items = await tx
      .select({ orderId: orderItems.orderId, ref: orderItems.posProductRef })
      .from(orderItems)
      .where(inArray(orderItems.orderId, recent.map((o) => o.id)));
    const byOrder = new Map<string, string[]>();
    for (const i of items) byOrder.set(i.orderId, [...(byOrder.get(i.orderId) ?? []), i.ref]);
    return computePairings([...byOrder.values()]);
  });
}
