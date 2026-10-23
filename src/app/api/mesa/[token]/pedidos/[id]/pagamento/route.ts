import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { dispatchOrderNow } from "@/server/orders/outbox-worker";
import { startOrderPayment } from "@/server/payments/order-payments";
import { activePaymentProvider } from "@/server/payments/provider";
import { clientIpFromHeaders, hashClientIp, hitRateLimit } from "@/server/security/rate-limit";

export const dynamic = "force-dynamic";

const STATUS = { NOT_FOUND: 404, ALREADY_PAID: 409, EXPIRED: 410 } as const;

/** Lugares "pagar ao pedir": iniciar o pagamento de um pedido (valor do servidor). */
export async function POST(request: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const db = await getDb();
  const limit = await hitRateLimit(db, `pay:ip:${hashClientIp(clientIpFromHeaders(request.headers))}`, { limit: 20, windowSeconds: 15 * 60 });
  if (!limit.allowed) return NextResponse.json({ message: "Muitas tentativas. Aguarde um pouco." }, { status: 429 });

  const provider = activePaymentProvider();
  if (!provider) return NextResponse.json({ message: "Pagamentos indisponíveis. Chame um funcionário." }, { status: 503 });
  const r = await startOrderPayment(db, token, id, provider);
  if (r.activatedOrderId) await dispatchOrderNow(db, r.activatedOrderId).catch(() => {});
  if (!r.ok) return NextResponse.json({ code: r.code, message: r.message }, { status: STATUS[r.code] });
  const { activatedOrderId: _ignored, ...body } = r;
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
