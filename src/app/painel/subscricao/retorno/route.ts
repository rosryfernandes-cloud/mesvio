import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { getStaffContext } from "@/server/staff/http";
import { finishSubscriptionCheckout } from "@/server/billing/subscriptions";
import { stripeClient } from "@/server/payments/stripe-provider";
import { resolvePublicBaseUrl } from "@/server/tables/table-qr";

export const dynamic = "force-dynamic";

/** Regresso do Stripe Checkout: guarda a subscrição e volta ao painel. */
export async function GET(request: Request) {
  const base = resolvePublicBaseUrl(process.env.NEXT_PUBLIC_APP_URL, request.headers.get("host"), request.headers.get("x-forwarded-proto"));
  const ctx = await getStaffContext();
  if (!ctx) return NextResponse.redirect(`${base}/painel/entrar`);
  const sessionId = new URL(request.url).searchParams.get("session_id");
  if (!sessionId || !/^cs_[A-Za-z0-9_]+$/.test(sessionId) || !process.env.STRIPE_SECRET_KEY) {
    return NextResponse.redirect(`${base}/painel?subscricao=erro`);
  }
  try {
    const active = await finishSubscriptionCheckout(await getDb(), ctx, sessionId, stripeClient());
    return NextResponse.redirect(`${base}/painel?subscricao=${active ? "ok" : "pendente"}`);
  } catch (err) {
    console.error("[subscrição] regresso falhou", err);
    return NextResponse.redirect(`${base}/painel?subscricao=erro`);
  }
}
