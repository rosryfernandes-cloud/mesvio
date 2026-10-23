import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { getRequestLocale } from "@/server/i18n/request-locale";
import { getTableBillByToken } from "@/server/tables/table-sessions";

export const dynamic = "force-dynamic";

/** Conta atual da mesa (todos os pedidos desde que a mesa abriu), para quem tem o QR/NFC da mesa. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const bill = await getTableBillByToken(await getDb(), token, new Date(), await getRequestLocale());
  if (!bill) return NextResponse.json({ message: "Mesa não encontrada." }, { status: 404 });
  return NextResponse.json({ bill }, { headers: { "Cache-Control": "no-store" } });
}
