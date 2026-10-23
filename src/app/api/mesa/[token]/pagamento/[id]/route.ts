import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { activePaymentProvider } from "@/server/payments/provider";
import { refreshTablePayment } from "@/server/payments/table-payments";

export const dynamic = "force-dynamic";

/** Estado de um pagamento (confirmado junto do fornecedor) e a conta atualizada. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const provider = activePaymentProvider();
  if (!provider || !z.uuid().safeParse(id).success) return NextResponse.json({ message: "Pagamento não encontrado." }, { status: 404 });
  const r = await refreshTablePayment(await getDb(), token, id, provider);
  if (!r) return NextResponse.json({ message: "Pagamento não encontrado." }, { status: 404 });
  return NextResponse.json(r, { headers: { "Cache-Control": "no-store" } });
}
