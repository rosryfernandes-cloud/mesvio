import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { getStaffContext } from "@/server/staff/http";
import { startSubscriptionCheckout } from "@/server/billing/subscriptions";
import { stripeClient } from "@/server/payments/stripe-provider";
import { resolvePublicBaseUrl } from "@/server/tables/table-qr";

export const dynamic = "force-dynamic";

/** Dono: abre o pagamento da mensalidade MESVIO (Stripe Checkout, cartão debitado todos os meses). */
export async function GET(request: Request) {
  const base = resolvePublicBaseUrl(process.env.NEXT_PUBLIC_APP_URL, request.headers.get("host"), request.headers.get("x-forwarded-proto"));
  const ctx = await getStaffContext();
  if (!ctx) return NextResponse.redirect(`${base}/painel/entrar`);
  if (ctx.role !== "owner" || !process.env.STRIPE_SECRET_KEY) return NextResponse.redirect(`${base}/painel?subscricao=sem-acesso`);
  try {
    const r = await startSubscriptionCheckout(await getDb(), ctx, base, stripeClient());
    return NextResponse.redirect(r.ok ? r.url : `${base}/painel?subscricao=ativa`);
  } catch (err) {
    console.error("[subscrição] checkout falhou", err);
    return NextResponse.redirect(`${base}/painel?subscricao=erro`);
  }
}
