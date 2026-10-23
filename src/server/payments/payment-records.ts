import "server-only";
import { and, eq } from "drizzle-orm";
import { roundHalfUpDiv } from "@/lib/money";
import type { Db } from "@/server/db/client";
import { establishments, orderEvents, orders, payments } from "@/server/db/schema";
import { enqueueSubmit } from "@/server/orders/outbox";
import type { PaymentProvider, ProviderPaymentStatus } from "./provider";

/** Comissão da plataforma: 1% do valor sem IVA (docs/07 D6–D7), arredondada ao cêntimo. */
export const PLATFORM_FEE_BPS = 100;
export const applicationFee = (netCents: number) => roundHalfUpDiv(netCents * PLATFORM_FEE_BPS, 10_000);

/** Pagamento iniciado e não concluído há mais do que isto é cancelado no fornecedor (MB WAY expira em ~4 min). */
export const ABANDONED_PAYMENT_MS = 15 * 60_000;

export type PaymentRow = typeof payments.$inferSelect;

/**
 * Atualiza um pagamento pendente com o estado no fornecedor e aplica as consequências.
 * Devolve o estado final e, se um pedido pré-pago ficou pago, o id dele (para enviar já ao POS).
 */
export async function syncPayment(
  db: Db,
  p: PaymentRow,
  provider: PaymentProvider,
  accountId: string | null,
  now: Date,
): Promise<{ status: ProviderPaymentStatus; activatedOrderId: string | null }> {
  const r = await provider.status(p.providerRef, accountId);
  if (r.status === "PENDING") return { status: r.status, activatedOrderId: null };
  const changed = await db
    .update(payments)
    .set({ status: r.status, method: r.method ?? null, updatedAt: now })
    .where(and(eq(payments.id, p.id), eq(payments.status, "PENDING")))
    .returning({ id: payments.id });
  // Só quem fez a mudança aplica as consequências (webhook + worker + cliente ao mesmo tempo → uma vez).
  const activatedOrderId = changed.length && r.status === "SUCCEEDED" && p.orderId ? await activatePaidOrder(db, p.orderId, now) : null;
  return { status: r.status, activatedOrderId };
}

/**
 * Pedido pré-pago ficou pago: passa de AWAITING_PAYMENT para RECEIVED (só uma vez) e entra na fila
 * de envio ao POS — ou fica à espera de aprovação se o restaurante tiver a aprovação manual ligada.
 * Devolve o id se deve ser enviado já.
 */
export async function activatePaidOrder(db: Db, orderId: string, now: Date): Promise<string | null> {
  const [o] = await db
    .update(orders)
    .set({ status: "RECEIVED", updatedAt: now })
    .where(and(eq(orders.id, orderId), eq(orders.status, "AWAITING_PAYMENT")))
    .returning({ id: orders.id, organizationId: orders.organizationId, establishmentId: orders.establishmentId });
  if (!o) return null;
  await db.insert(orderEvents).values({
    organizationId: o.organizationId,
    orderId: o.id,
    fromStatus: "AWAITING_PAYMENT",
    toStatus: "RECEIVED",
    source: "system",
    detail: { paid: true },
    createdAt: now,
  });
  const [est] = await db.select({ manual: establishments.manualAcceptance }).from(establishments).where(eq(establishments.id, o.establishmentId));
  if (est?.manual) return null; // o staff aprova no painel
  await enqueueSubmit(db, o.organizationId, o.id, now);
  return o.id;
}

/** Pedido pré-pago cujo pagamento foi abandonado: cancela-se (nunca chegou à cozinha). */
export async function cancelUnpaidOrder(db: Db, orderId: string, now: Date, reason: string): Promise<boolean> {
  const [o] = await db
    .update(orders)
    .set({ status: "CANCELLED", updatedAt: now })
    .where(and(eq(orders.id, orderId), eq(orders.status, "AWAITING_PAYMENT")))
    .returning({ id: orders.id, organizationId: orders.organizationId });
  if (!o) return false;
  await db.insert(orderEvents).values({
    organizationId: o.organizationId,
    orderId: o.id,
    fromStatus: "AWAITING_PAYMENT",
    toStatus: "CANCELLED",
    source: "system",
    detail: { reason },
    createdAt: now,
  });
  return true;
}
