import "server-only";
import type { Db } from "@/server/db/client";
import { runOutboxOnce } from "@/server/orders/outbox-worker";
import { pruneDemoRequests } from "@/server/contact/demo-requests";
import { activePaymentProvider } from "@/server/payments/provider";
import { reconcilePendingPayments } from "@/server/payments/table-payments";
import { hitRateLimit, pruneRateLimits } from "@/server/security/rate-limit";

/**
 * Tarefas de fundo: reenvios ao POS, pagamentos por confirmar ou abandonados (cancelados ao fim de
 * 15 min), pedidos pré-pagos não pagos e limpezas. Corre no cron e, sem cron (plano Hobby da Vercel),
 * a partir do painel aberto — ver `maybeRunMaintenance`.
 */
export async function runMaintenance(db: Db) {
  let processed = 0;
  for (let n = await runOutboxOnce(db); n > 0; n = await runOutboxOnce(db)) processed += n;
  const provider = activePaymentProvider();
  const payments = provider ? await reconcilePendingPayments(db, provider) : null;
  await pruneRateLimits(db);
  await pruneDemoRequests(db);
  return { processed, payments };
}

/** No máximo uma vez por minuto em toda a plataforma, seja quem for que a peça primeiro. */
const ONCE_A_MINUTE = { limit: 1, windowSeconds: 60 };

/**
 * Sem cron a cada minuto, o painel dos restaurantes (que atualiza a cada 3 s durante o serviço)
 * dispara as tarefas de fundo. O limite partilhado na BD garante uma execução por minuto.
 */
export async function maybeRunMaintenance(db: Db): Promise<void> {
  if (!(await hitRateLimit(db, "maintenance:tick", ONCE_A_MINUTE)).allowed) return;
  try {
    await runMaintenance(db);
  } catch (err) {
    console.error("[manutenção] falhou", err);
  }
}
