import { getDb } from "@/server/db/client";
import { guardStaff, json } from "@/server/staff/http";
import { getBoard } from "@/server/staff/staff-service";
import { maybeRunMaintenance } from "@/server/runtime/maintenance";
import { keepAlive } from "@/server/runtime/keep-alive";

export const dynamic = "force-dynamic";
// As tarefas de fundo (quando calha a este pedido) acabam depois da resposta; dá-lhes tempo.
export const maxDuration = 30;

export async function GET(request: Request) {
  const ctx = await guardStaff(request, { mutating: false });
  if (ctx instanceof Response) return ctx;
  const db = await getDb();
  // Sem cron a cada minuto (plano Hobby): as tarefas de fundo correm em segundo plano a partir do painel.
  if (process.env.OUTBOX_WORKER === "off") keepAlive(maybeRunMaintenance(db));
  return json(await getBoard(db, ctx));
}
