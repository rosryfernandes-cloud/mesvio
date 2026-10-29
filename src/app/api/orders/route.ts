import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { placeOrder } from "@/server/orders/place-order";
import { clientIpFromHeaders, hashClientIp } from "@/server/security/rate-limit";
import { queueTableEventByToken } from "@/server/notifications/push";

export const dynamic = "force-dynamic";
// Tempo de vida da função na Vercel: a resposta sai em ≤ 4 s e o envio ao POS (até 20 s) acaba em fundo.
export const maxDuration = 30;

const STATUS_BY_CODE = {
  INVALID_INPUT: 400,
  TABLE_NOT_FOUND: 404,
  ORDERING_DISABLED: 403,
  INVALID_ITEMS: 422,
  PRICE_CHANGED: 409,
  RATE_LIMITED: 429,
} as const;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ code: "INVALID_INPUT", message: "Pedido inválido." }, { status: 400 });
  }
  // A chave de idempotência vem no cabeçalho (padrão HTTP); o corpo nunca a sobrepõe.
  const idempotencyKey = request.headers.get("Idempotency-Key");
  const result = await placeOrder(
    { ...(body as object), idempotencyKey },
    { clientIpHash: hashClientIp(clientIpFromHeaders(request.headers)) },
    { db: await getDb() },
  );

  if (!result.ok) {
    const headers: Record<string, string> = { "Cache-Control": "no-store" };
    if (result.code === "RATE_LIMITED") headers["Retry-After"] = String(result.retryAfterSeconds);
    return NextResponse.json({ code: result.code, message: result.message }, { status: STATUS_BY_CODE[result.code], headers });
  }
  // Pedido novo: avisa o telemóvel do responsável da mesa. Os que esperam pagamento (camas) avisam quando pagos.
  const tableToken = (body as { tableToken?: unknown })?.tableToken;
  if (typeof tableToken === "string" && result.order.status !== "AWAITING_PAYMENT") {
    queueTableEventByToken(tableToken, { kind: "order", shortCode: result.order.shortCode, totalCents: result.order.totalCents });
  }
  return NextResponse.json({ order: result.order }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
