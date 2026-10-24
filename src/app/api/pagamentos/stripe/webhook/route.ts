import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getDb } from "@/server/db/client";
import { dispatchWithinDeadline } from "@/server/orders/outbox-worker";
import { activePaymentProvider } from "@/server/payments/provider";
import { handleStripeEvent } from "@/server/payments/stripe-webhook";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Webhook da Stripe (endpoint de Connect: "eventos em contas ligadas"). Sem assinatura válida
 * (STRIPE_WEBHOOK_SECRET), recusa. Em caso de erro devolve 500 para a Stripe voltar a tentar.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const provider = activePaymentProvider();
  if (!secret || provider?.id !== "stripe") return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });

  const payload = await request.text();
  let event: Stripe.Event;
  try {
    event = Stripe.webhooks.constructEvent(payload, request.headers.get("stripe-signature") ?? "", secret);
  } catch {
    return NextResponse.json({ message: "Assinatura inválida." }, { status: 400 });
  }

  try {
    const db = await getDb();
    const r = await handleStripeEvent(db, event, provider);
    if (r.activatedOrderId) await dispatchWithinDeadline(db, r.activatedOrderId, { label: "stripe" });
    return NextResponse.json({ received: true, handled: r.handled });
  } catch (err) {
    console.error(`[stripe] webhook ${event.type} ${event.id} falhou`, err);
    return NextResponse.json({ message: "Erro a processar." }, { status: 500 });
  }
}
