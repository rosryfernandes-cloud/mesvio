import "server-only";
import type Stripe from "stripe";
import { and, eq, lt } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { establishments, payments } from "@/server/db/schema";
import type { PaymentProvider } from "./provider";
import { syncPayment } from "./payment-records";
import { flagOverpayment } from "./table-payments";

/** Eventos da Stripe a que a MESVIO reage (o resto recebe 200 e é ignorado). */
export const HANDLED_EVENTS = [
  "payment_intent.succeeded",
  "payment_intent.processing",
  "payment_intent.payment_failed",
  "payment_intent.canceled",
  "charge.refunded",
] as const;

/**
 * Trata um evento já com a assinatura verificada. Tarefa de sistema (todas as organizações).
 * Não confia no conteúdo do evento para o estado do pagamento: volta a perguntar à Stripe
 * (syncPayment), por isso eventos repetidos ou fora de ordem não estragam nada; e a mudança de
 * estado é compare-and-set, aplicada uma só vez mesmo com webhook + worker + cliente em paralelo.
 */
export async function handleStripeEvent(
  db: Db,
  event: Stripe.Event,
  provider: PaymentProvider,
  now = new Date(),
): Promise<{ handled: boolean; activatedOrderId: string | null }> {
  const none = { handled: false, activatedOrderId: null };
  if (event.type.startsWith("payment_intent.")) {
    const pi = event.data.object as Stripe.PaymentIntent;
    const row = await findPayment(db, pi.id, event.account);
    if (!row) return none;
    if (row.payment.status !== "PENDING") return { handled: true, activatedOrderId: null };
    const r = await syncPayment(db, row.payment, provider, row.accountId, now);
    if (r.status === "SUCCEEDED") await flagOverpayment(db, row.payment.tableSessionId, row.payment.organizationId, now);
    return { handled: true, activatedOrderId: r.activatedOrderId };
  }
  if (event.type === "charge.refunded") {
    const charge = event.data.object as Stripe.Charge;
    const piId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
    if (!piId) return none;
    const row = await findPayment(db, piId, event.account);
    if (!row) return none;
    // Reembolsos feitos no painel MESVIO ou no dashboard da Stripe: guarda o total devolvido (só sobe).
    await db
      .update(payments)
      .set({ refundedCents: charge.amount_refunded, updatedAt: now })
      .where(and(eq(payments.id, row.payment.id), lt(payments.refundedCents, charge.amount_refunded)));
    return { handled: true, activatedOrderId: null };
  }
  return none;
}

/** Pagamento pela referência da Stripe, só se o evento vier da conta do restaurante desse pagamento. */
async function findPayment(db: Db, providerRef: string, eventAccount: string | null | undefined) {
  const [row] = await db
    .select({ payment: payments, accountId: establishments.stripeAccountId })
    .from(payments)
    .innerJoin(establishments, eq(establishments.id, payments.establishmentId))
    .where(and(eq(payments.provider, "stripe"), eq(payments.providerRef, providerRef)))
    .limit(1);
  if (!row || !row.accountId || row.accountId !== eventAccount) return null;
  return row;
}
