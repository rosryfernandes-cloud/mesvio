import { cookies } from "next/headers";
import { sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { getCurrentUserId } from "@/server/auth/current-user";
import { findPlatformAdmin, PLATFORM_COOKIE } from "@/server/platform/admin-auth";
import { countPasskeys } from "@/server/platform/passkeys";
import { decodeSigned } from "@/server/staff/session";
import { getPlatformOverview } from "@/server/platform/platform-service";
import { countOpenDemoRequests } from "@/server/contact/demo-requests";
import { runMaintenance } from "@/server/runtime/maintenance";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Momento em que esta instância da função arrancou: diz se o pedido apanhou um arranque a frio.
const BOOTED_AT = Date.now();
let requests = 0;

const STEP_LIMIT_MS = 15_000;

/**
 * Painel central: quanto demora cada passo de abrir a visão geral, medido no servidor e escrito
 * à medida que acontece (uma linha por passo). Se um passo pendurar, ao fim de 15 s aparece
 * "PRESO" e segue para o seguinte, para se ver exatamente onde fica.
 */
export async function GET() {
  const t0 = performance.now();
  const userId = await getCurrentUserId().catch(() => null);
  const claimsMs = Math.round(performance.now() - t0);
  if (!userId) return Response.json({ code: "NOT_FOUND" }, { status: 404 });
  const enc = new TextEncoder();
  const first = requests++ === 0;

  const body = new ReadableStream({
    async start(controller) {
      const write = (line: string) => controller.enqueue(enc.encode(line + "\n"));
      // O Safari só mostra texto em streaming depois do primeiro ~1 KB.
      write(" ".repeat(1024));
      write(`instancia: arranqueAFrio=${first} vivaHa=${Math.round((Date.now() - BOOTED_AT) / 1000)}s regiao=${process.env.VERCEL_REGION ?? "local"} outboxWorker=${process.env.OUTBOX_WORKER ?? "on"}`);
      const step = async <T,>(name: string, fn: () => Promise<T>): Promise<T | undefined> => {
        const t = performance.now();
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const out = await Promise.race([
            fn(),
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => reject(new Error("PRESO (mais de 15 s)")), STEP_LIMIT_MS);
            }),
          ]);
          write(`${name}: ${Math.round(performance.now() - t)} ms`);
          return out;
        } catch (err) {
          // O erro da base de dados (código e mensagem do Postgres/pooler) vem em `cause`.
          const cause = err instanceof Error ? (err.cause as { code?: string; message?: string } | undefined) : undefined;
          const why = cause ? `${cause.code ?? ""} ${cause.message ?? ""}`.trim() : err instanceof Error ? err.message.split("\n")[0] : String(err);
          write(`${name}: FALHOU: ${why} (${Math.round(performance.now() - t)} ms)`);
          return undefined;
        } finally {
          clearTimeout(timer);
        }
      };

      // Emails dos pedidos de demonstração: o que está definido neste servidor (nunca os valores secretos).
      const to = (process.env.DEMO_REQUESTS_TO ?? "").split(",").map((x) => x.trim()).filter(Boolean);
      const from = process.env.DEMO_REQUESTS_FROM ?? "";
      write(`emails: RESEND_API_KEY=${process.env.RESEND_API_KEY ? "definida" : "FALTA"} DEMO_REQUESTS_FROM=${from ? `dominio ${from.split("@")[1]?.replace(">", "") ?? "invalido"}` : "FALTA"} DEMO_REQUESTS_TO=${to.length ? to.map((x) => x.split("@")[1] ?? "invalido").join(" + ") : "FALTA"}`);
      write(`sessao (getClaims): ${claimsMs} ms`);
      const db = await step("ligar a base de dados", () => getDb());
      if (db) {
        const admin = await step("administrador", () => findPlatformAdmin(db, userId));
        if (!admin) {
          write("sem acesso");
          controller.close();
          return;
        }
        await step("chaves de acesso", () => countPasskeys(db, userId));
        const session = decodeSigned((await cookies()).get(PLATFORM_COOKIE)?.value);
        write(`2FA desta sessao: ${session?.u === userId ? "verificado" : "por verificar"}`);
        await step("select 1", () => db.execute(sql`select 1`));
        await step("select 1 (de novo)", () => db.execute(sql`select 1`));
        await step("visao geral", () => Promise.all([getPlatformOverview(db), countOpenDemoRequests(db)]));
        await step("tarefas de fundo", () => runMaintenance(db));
      }
      write("fim");
      controller.close();
    },
  });
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
