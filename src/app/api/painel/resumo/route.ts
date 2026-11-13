import { getDb } from "@/server/db/client";
import { guardStaff, json } from "@/server/staff/http";
import { z } from "zod";
import { getDaySummary, getWeekSummary } from "@/server/staff/summary-service";
import { getWeeklySummaryEmail, setWeeklySummaryEmail } from "@/server/staff/weekly-email";

export const dynamic = "force-dynamic";

/**
 * Resumo para o dono e o gerente. Sem parâmetros: o dia de hoje (pedidos, vendas, ticket médio, tempo até
 * à cozinha, horas e mais pedidos). Com ?periodo=semana: os últimos 7 dias, comparados com os 7 anteriores.
 */
export async function GET(request: Request) {
  const ctx = await guardStaff(request, { mutating: false, permission: "settings.edit" });
  if (ctx instanceof Response) return ctx;
  const week = new URL(request.url).searchParams.get("periodo") === "semana";
  const db = await getDb();
  if (!week) return json(await getDaySummary(db, ctx));
  const [summary, weeklyEmail] = await Promise.all([getWeekSummary(db, ctx), getWeeklySummaryEmail(db, ctx)]);
  return json({ ...summary, weeklyEmail });
}

/** Ligar ou desligar o resumo semanal por email aos donos. */
export async function POST(request: Request) {
  const ctx = await guardStaff(request, { mutating: true, permission: "settings.edit" });
  if (ctx instanceof Response) return ctx;
  const parsed = z.object({ weeklyEmail: z.boolean() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ message: "Pedido inválido." }, 400);
  await setWeeklySummaryEmail(await getDb(), ctx, parsed.data.weeklyEmail);
  return json({ ok: true });
}
