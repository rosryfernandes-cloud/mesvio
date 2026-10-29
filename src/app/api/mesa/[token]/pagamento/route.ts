import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { activePaymentProvider } from "@/server/payments/provider";
import { startTablePayment } from "@/server/payments/table-payments";
import { invoiceRequestSchema } from "@/server/invoicing/invoices";
import { clientIpFromHeaders, hashClientIp, hitPaymentLimits } from "@/server/security/rate-limit";

export const dynamic = "force-dynamic";

const STATUS = { TABLE_NOT_FOUND: 404, PAYMENTS_DISABLED: 403, NOTHING_TO_PAY: 409, PENDING_ORDERS: 409, ALREADY_PAID: 409, INVALID_TIP: 400, INVOICE_OWN_NIF: 400 } as const;

/** Iniciar o pagamento do que falta na conta da mesa (+ gorjeta opcional). O valor é calculado no servidor. */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = await getDb();
  const limit = await hitPaymentLimits(db, hashClientIp(clientIpFromHeaders(request.headers)), token);
  if (!limit.allowed) return NextResponse.json({ message: "Muitas tentativas. Aguarde um pouco." }, { status: 429 });

  const provider = activePaymentProvider();
  if (!provider) return NextResponse.json({ message: "Pagamentos indisponíveis. Chame um funcionário." }, { status: 503 });
  const body = (await request.json().catch(() => ({}))) as { tipCents?: unknown; fatura?: unknown };
  const tipCents = typeof body?.tipCents === "number" ? body.tipCents : 0;
  // Fatura (opcional): NIF e email validados aqui; a emissão é depois de pago.
  let invoice: { nif: string | null; email: string } | null = null;
  if (body?.fatura) {
    const parsed = invoiceRequestSchema.safeParse(body.fatura);
    if (!parsed.success) return NextResponse.json({ code: "INVALID_INVOICE", message: "Confirme o NIF e o email da fatura." }, { status: 400 });
    invoice = parsed.data;
  }
  const r = await startTablePayment(db, token, provider, new Date(), { tipCents, invoice });
  if (!r.ok) return NextResponse.json({ code: r.code, message: r.message }, { status: STATUS[r.code] });
  return NextResponse.json(r, { headers: { "Cache-Control": "no-store" } });
}
