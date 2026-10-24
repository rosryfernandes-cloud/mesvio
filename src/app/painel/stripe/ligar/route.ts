import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { getStaffContext } from "@/server/staff/http";
import { startOnboarding } from "@/server/payments/stripe-connect";
import { resolvePublicBaseUrl } from "@/server/tables/table-qr";

export const dynamic = "force-dynamic";

/**
 * Dono: abre o formulário da Stripe para ligar a conta do restaurante. É também o `refresh_url`
 * da Stripe (link expirado → gera outro), por isso é um GET.
 */
export async function GET(request: Request) {
  const base = resolvePublicBaseUrl(process.env.NEXT_PUBLIC_APP_URL, request.headers.get("host"), request.headers.get("x-forwarded-proto"));
  const ctx = await getStaffContext();
  if (!ctx) return NextResponse.redirect(`${base}/painel/entrar`);
  if (ctx.role !== "owner" || !process.env.STRIPE_SECRET_KEY) return NextResponse.redirect(`${base}/painel?stripe=sem-acesso`);
  try {
    return NextResponse.redirect(await startOnboarding(await getDb(), ctx, base));
  } catch (err) {
    console.error("[stripe] onboarding falhou", err);
    return NextResponse.redirect(`${base}/painel?stripe=erro`);
  }
}
