import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { runOutboxOnce } from "@/server/orders/outbox-worker";
import { pruneRateLimits } from "@/server/security/rate-limit";
import { activePaymentProvider } from "@/server/payments/provider";
import { reconcilePendingPayments } from "@/server/payments/table-payments";

export const dynamic = "force-dynamic";
// Na Vercel: tempo máximo de uma execução do cron (esvazia a fila em lotes até acabar).
export const maxDuration = 60;

/**
 * Para alojamento serverless (sem processo sempre ligado): um cron chama esta rota a cada minuto
 * com `Authorization: Bearer $CRON_SECRET` (a Vercel envia-o sozinha, ver vercel.json). Sem
 * CRON_SECRET definido, a rota não existe. Os pedidos novos seguem logo para o POS ao serem
 * feitos; o cron trata reenvios, pagamentos por confirmar, pedidos não pagos e limpezas.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  }
  const db = await getDb();
  let processed = 0;
  for (let n = await runOutboxOnce(db); n > 0; n = await runOutboxOnce(db)) processed += n;
  const provider = activePaymentProvider();
  const payments = provider ? await reconcilePendingPayments(db, provider) : null;
  await pruneRateLimits(db);
  return NextResponse.json({ processed, payments }, { headers: { "Cache-Control": "no-store" } });
}
