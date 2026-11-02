import { sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { json } from "@/server/staff/http";
import { guardPlatform } from "@/server/platform/admin-auth";
import { getPlatformOverview } from "@/server/platform/platform-service";
import { countOpenDemoRequests } from "@/server/contact/demo-requests";
import { runMaintenance } from "@/server/runtime/maintenance";

export const dynamic = "force-dynamic";

// Momento em que esta instância da função arrancou: diz se o pedido apanhou um arranque a frio.
const BOOTED_AT = Date.now();
let requests = 0;

/**
 * Painel central: quanto demora cada passo de abrir a visão geral, medido no servidor (ms).
 * Serve para separar lentidão do servidor (autenticação, base de dados) da rede de quem abre.
 */
export async function GET(request: Request) {
  const t0 = performance.now();
  const lap = (from: number) => Math.round(performance.now() - from);
  const admin = await guardPlatform(request, { mutating: false });
  if (admin instanceof Response) return admin;
  const auth = lap(t0);

  let t = performance.now();
  const db = await getDb();
  await db.execute(sql`select 1`);
  const firstQuery = lap(t);

  t = performance.now();
  await db.execute(sql`select 1`);
  const secondQuery = lap(t);

  t = performance.now();
  await Promise.all([getPlatformOverview(db), countOpenDemoRequests(db)]);
  const overview = lap(t);

  // As tarefas de fundo (o que o cron corre a cada minuto), com limite de 20 s para não pendurar.
  t = performance.now();
  const maintenance = await Promise.race([
    runMaintenance(db).then(() => lap(t)),
    new Promise<string>((resolve) => setTimeout(() => resolve("mais de 20 s"), 20_000)),
  ]).catch((err: unknown) => `erro: ${err instanceof Error ? err.message : String(err)}`);

  return json({
    ms: { autenticacao: auth, primeiraQuery: firstQuery, segundaQuery: secondQuery, visaoGeral: overview, tarefasDeFundo: maintenance, total: lap(t0) },
    instancia: { arranqueAFrio: requests++ === 0, vivaHaSegundos: Math.round((Date.now() - BOOTED_AT) / 1000), regiao: process.env.VERCEL_REGION ?? "local", outboxWorker: process.env.OUTBOX_WORKER ?? "on" },
  });
}
