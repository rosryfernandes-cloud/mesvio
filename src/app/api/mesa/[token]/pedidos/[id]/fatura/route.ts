import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { requestOrderInvoice } from "@/server/invoicing/invoices";
import { clientIpFromHeaders, hashClientIp, hitPaymentLimits } from "@/server/security/rate-limit";

export const dynamic = "force-dynamic";

/** Lugares "pagar ao pedir": pedir a fatura de um pedido já pago ({ nif?, email }). */
export async function POST(request: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const db = await getDb();
  const limit = await hitPaymentLimits(db, hashClientIp(clientIpFromHeaders(request.headers)), token);
  if (!limit.allowed) return NextResponse.json({ message: "Muitas tentativas. Aguarde um pouco." }, { status: 429 });
  const r = await requestOrderInvoice(db, token, id, await request.json().catch(() => null));
  if (!r.ok) return NextResponse.json({ code: r.code, message: r.message }, { status: r.code === "INVALID" ? 400 : 404 });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
