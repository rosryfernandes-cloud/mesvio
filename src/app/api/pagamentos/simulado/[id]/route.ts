import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { activePaymentProvider, type MockPaymentProvider } from "@/server/payments/provider";
import { paymentProviderRef, refreshTablePayment } from "@/server/payments/table-payments";

export const dynamic = "force-dynamic";
// Na Vercel: a resposta sai em poucos segundos; o envio ao POS que ainda decorre acaba em fundo.
export const maxDuration = 30;

const schema = z.object({ token: z.string(), method: z.enum(["apple_pay", "mb_way"]), approved: z.boolean() });

/**
 * Só com o fornecedor simulado (desenvolvimento): faz de conta que o cliente aprovou ou recusou
 * o pagamento (no Apple Pay ou na app MB WAY). Não existe com a Stripe.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // Pelo id e não com instanceof: no build de produção cada rota tem a sua cópia da classe, e a
  // instância partilhada (globalThis) pode ter sido criada por outra (falhava sempre — teste de carga).
  const active = activePaymentProvider();
  if (active?.id !== "mock") return NextResponse.json({ message: "Indisponível." }, { status: 404 });
  const provider = active as MockPaymentProvider;
  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !z.uuid().safeParse(id).success) return NextResponse.json({ message: "Pedido inválido." }, { status: 400 });

  const db = await getDb();
  const ref = await paymentProviderRef(db, parsed.data.token, id);
  if (!ref) return NextResponse.json({ message: "Pagamento não encontrado." }, { status: 404 });
  provider.complete(ref, parsed.data.method, parsed.data.approved);
  return NextResponse.json(await refreshTablePayment(db, parsed.data.token, id, provider));
}
