import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { getStaffContext } from "@/server/staff/http";
import { finishOnboarding } from "@/server/payments/stripe-connect";
import { resolvePublicBaseUrl } from "@/server/tables/table-qr";

export const dynamic = "force-dynamic";

/** Regresso do formulário da Stripe: confirma o estado e regista o domínio para o Apple Pay. */
export async function GET(request: Request) {
  const base = resolvePublicBaseUrl(process.env.NEXT_PUBLIC_APP_URL, request.headers.get("host"), request.headers.get("x-forwarded-proto"));
  const ctx = await getStaffContext();
  if (!ctx) return NextResponse.redirect(`${base}/painel/entrar`);
  try {
    const status = await finishOnboarding(await getDb(), ctx, new URL(base).hostname);
    return NextResponse.redirect(`${base}/painel?stripe=${status.chargesEnabled ? "ok" : "pendente"}`);
  } catch (err) {
    console.error("[stripe] regresso do onboarding falhou", err);
    return NextResponse.redirect(`${base}/painel?stripe=erro`);
  }
}
