import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { activePaymentProvider } from "@/server/payments/provider";
import { startTablePayment } from "@/server/payments/table-payments";
import { clientIpFromHeaders, hashClientIp, hitPaymentLimits } from "@/server/security/rate-limit";

export const dynamic = "force-dynamic";

const STATUS = { TABLE_NOT_FOUND: 404, PAYMENTS_DISABLED: 403, NOTHING_TO_PAY: 409, PENDING_ORDERS: 409, ALREADY_PAID: 409 } as const;

/** Iniciar o pagamento do que falta na conta da mesa. O valor é calculado no servidor. */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = await getDb();
  const limit = await hitPaymentLimits(db, hashClientIp(clientIpFromHeaders(request.headers)), token);
  if (!limit.allowed) return NextResponse.json({ message: "Muitas tentativas. Aguarde um pouco." }, { status: 429 });

  const provider = activePaymentProvider();
  if (!provider) return NextResponse.json({ message: "Pagamentos indisponíveis. Chame um funcionário." }, { status: 503 });
  const r = await startTablePayment(db, token, provider);
  if (!r.ok) return NextResponse.json({ code: r.code, message: r.message }, { status: STATUS[r.code] });
  return NextResponse.json(r, { headers: { "Cache-Control": "no-store" } });
}
