import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { placeOrder } from "@/server/orders/place-order";
import { clientIpFromHeaders, hashClientIp } from "@/server/security/rate-limit";

export const dynamic = "force-dynamic";

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
  return NextResponse.json({ order: result.order }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
