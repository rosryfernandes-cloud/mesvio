import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { getStaffContext } from "@/server/staff/http";
import { billingPortalUrl } from "@/server/billing/subscriptions";
import { stripeClient } from "@/server/payments/stripe-provider";
import { resolvePublicBaseUrl } from "@/server/tables/table-qr";

export const dynamic = "force-dynamic";

/** Dono: portal da Stripe para mudar o cartão, ver as faturas da mensalidade ou cancelar. */
export async function GET(request: Request) {
  const base = resolvePublicBaseUrl(process.env.NEXT_PUBLIC_APP_URL, request.headers.get("host"), request.headers.get("x-forwarded-proto"));
  const ctx = await getStaffContext();
  if (!ctx) return NextResponse.redirect(`${base}/painel/entrar`);
  if (ctx.role !== "owner" || !process.env.STRIPE_SECRET_KEY) return NextResponse.redirect(`${base}/painel?subscricao=sem-acesso`);
  try {
    const url = await billingPortalUrl(await getDb(), ctx, `${base}/painel`, stripeClient());
    return NextResponse.redirect(url ?? `${base}/painel?subscricao=sem-subscricao`);
  } catch (err) {
    // Em geral: o portal de clientes ainda não foi ativado no dashboard da Stripe.
    console.error("[subscrição] portal falhou", err);
    return NextResponse.redirect(`${base}/painel?subscricao=portal-indisponivel`);
  }
}
