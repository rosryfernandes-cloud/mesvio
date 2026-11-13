import { getDb } from "@/server/db/client";
import { guardStaff, json } from "@/server/staff/http";
import { getDaySummary, getWeekSummary } from "@/server/staff/summary-service";

export const dynamic = "force-dynamic";

/**
 * Resumo para o dono e o gerente. Sem parâmetros: o dia de hoje (pedidos, vendas, ticket médio, tempo até
 * à cozinha, horas e mais pedidos). Com ?periodo=semana: os últimos 7 dias, comparados com os 7 anteriores.
 */
export async function GET(request: Request) {
  const ctx = await guardStaff(request, { mutating: false, permission: "settings.edit" });
  if (ctx instanceof Response) return ctx;
  const week = new URL(request.url).searchParams.get("periodo") === "semana";
  return json(week ? await getWeekSummary(await getDb(), ctx) : await getDaySummary(await getDb(), ctx));
}
