import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { dispatchWithinDeadline } from "@/server/orders/outbox-worker";
import { startOrderPayment } from "@/server/payments/order-payments";
import { activePaymentProvider } from "@/server/payments/provider";
import { clientIpFromHeaders, hashClientIp, hitPaymentLimits } from "@/server/security/rate-limit";

export const dynamic = "force-dynamic";
// Na Vercel: a resposta sai em poucos segundos; o envio ao POS que ainda decorre acaba em fundo.
export const maxDuration = 30;

const STATUS = { NOT_FOUND: 404, ALREADY_PAID: 409, EXPIRED: 410, PAYMENTS_DISABLED: 403 } as const;

/** Lugares "pagar ao pedir": iniciar o pagamento de um pedido (valor do servidor). */
export async function POST(request: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const db = await getDb();
  const limit = await hitPaymentLimits(db, hashClientIp(clientIpFromHeaders(request.headers)), token);
  if (!limit.allowed) return NextResponse.json({ message: "Muitas tentativas. Aguarde um pouco." }, { status: 429 });

  const provider = activePaymentProvider();
  if (!provider) return NextResponse.json({ message: "Pagamentos indisponíveis. Chame um funcionário." }, { status: 503 });
  const r = await startOrderPayment(db, token, id, provider);
  if (r.activatedOrderId) await dispatchWithinDeadline(db, r.activatedOrderId, { label: "pagamentos" });
  if (!r.ok) return NextResponse.json({ code: r.code, message: r.message }, { status: STATUS[r.code] });
  const { activatedOrderId: _ignored, ...body } = r;
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
