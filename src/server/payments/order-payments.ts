import "server-only";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/server/db/client";
import { diningTables, establishments, orders, payments } from "@/server/db/schema";
import { resolveTableToken, withTenant } from "@/server/db/tenant";
import { isWellFormedTableToken } from "@/server/tables/table-token";
import type { PaymentProvider } from "./provider";
import { applicationFee, syncPayment } from "./payment-records";

export type StartOrderPaymentResult =
  | { ok: true; paymentId: string; provider: PaymentProvider["id"]; amountCents: number; clientSecret?: string }
  | { ok: false; code: "NOT_FOUND" | "ALREADY_PAID" | "EXPIRED"; message: string };

/**
 * Lugares "pagar ao pedir" (espreguiçadeiras): inicia o pagamento de UM pedido. O pedido só segue
 * para a cozinha quando o pagamento é confirmado (payment-records.activatePaidOrder).
 * Valor sempre do servidor (o total gravado do pedido); um só pagamento ativo por pedido.
 */
export async function startOrderPayment(
  db: Db,
  token: string,
  orderId: string,
  provider: PaymentProvider,
  now = new Date(),
): Promise<StartOrderPaymentResult & { activatedOrderId?: string | null }> {
  const notFound = { ok: false as const, code: "NOT_FOUND" as const, message: "Pedido não encontrado." };
  if (!isWellFormedTableToken(token) || !z.uuid().safeParse(orderId).success) return notFound;
  const t = await resolveTableToken(db, token);
  if (!t) return notFound;

  return withTenant(db, { organizationId: t.organizationId }, async (tx) => {
    const [o] = await tx
      .select({ order: orders, label: diningTables.label, accountId: establishments.stripeAccountId })
      .from(orders)
      .innerJoin(diningTables, eq(diningTables.id, orders.tableId))
      .innerJoin(establishments, eq(establishments.id, orders.establishmentId))
      .where(and(eq(orders.id, orderId), eq(orders.tableId, t.tableId)))
      .for("update", { of: orders });
    if (!o) return notFound;
    const paid = { ok: false as const, code: "ALREADY_PAID" as const, message: "Este pedido já está pago." };
    if (o.order.status === "CANCELLED") return { ok: false, code: "EXPIRED", message: "Este pedido expirou sem ser pago. Faça um pedido novo." };
    if (o.order.status !== "AWAITING_PAYMENT") return paid;

    // Pagamento em curso deste pedido: pôr em dia (pode ter sido pago entretanto).
    const pending = await tx.select().from(payments).where(and(eq(payments.orderId, orderId), eq(payments.status, "PENDING")));
    for (const p of pending) {
      const r = await syncPayment(tx, p, provider, o.accountId, now);
      if (r.status === "SUCCEEDED") return { ...paid, activatedOrderId: r.activatedOrderId };
    }

    // Toques repetidos → mesma chave → mesmo pagamento; depois de uma recusa, tentativa nova.
    const finished = await tx.$count(payments, and(eq(payments.orderId, orderId), ne(payments.status, "PENDING")));
    const created = await provider.create({
      amountCents: o.order.totalGrossCents,
      applicationFeeCents: applicationFee(o.order.totalNetCents),
      accountId: o.accountId,
      idempotencyKey: `order:${orderId}:${finished}`,
      description: `${o.label} — pedido ${o.order.shortCode}`,
      metadata: { orderId, establishmentId: t.establishmentId },
    });
    const [existing] = await tx
      .select({ id: payments.id })
      .from(payments)
      .where(and(eq(payments.provider, provider.id), eq(payments.providerRef, created.providerRef)));
    const paymentId =
      existing?.id ??
      (
        await tx
          .insert(payments)
          .values({
            organizationId: t.organizationId,
            establishmentId: t.establishmentId,
            tableSessionId: o.order.tableSessionId!,
            orderId,
            provider: provider.id,
            providerRef: created.providerRef,
            amountCents: o.order.totalGrossCents,
            applicationFeeCents: applicationFee(o.order.totalNetCents),
            createdAt: now,
            updatedAt: now,
          })
          .returning({ id: payments.id })
      )[0].id;
    return { ok: true, paymentId, provider: provider.id, amountCents: o.order.totalGrossCents, clientSecret: created.clientSecret };
  });
}
