import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { runMaintenance } from "@/server/runtime/maintenance";

export const dynamic = "force-dynamic";
// Na Vercel: tempo máximo de uma execução do cron (esvazia a fila em lotes até acabar).
export const maxDuration = 60;

/**
 * Para alojamento serverless (sem processo sempre ligado): um cron chama esta rota com
 * `Authorization: Bearer $CRON_SECRET` (a Vercel envia-o sozinha, ver vercel.json). Sem
 * CRON_SECRET definido, a rota não existe. Os pedidos novos seguem logo para o POS ao serem
 * feitos; o cron trata reenvios, pagamentos por confirmar, pedidos não pagos e limpezas.
 * No plano Hobby corre uma vez por dia; durante o serviço, o painel aberto faz o mesmo a cada minuto.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  }
  const result = await runMaintenance(await getDb());
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
