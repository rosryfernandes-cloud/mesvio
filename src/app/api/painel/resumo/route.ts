import { getDb } from "@/server/db/client";
import { guardStaff, json } from "@/server/staff/http";
import { getDaySummary } from "@/server/staff/summary-service";

export const dynamic = "force-dynamic";

/** Resumo do dia (dono e gerente): pedidos, vendas, ticket médio, tempo até à cozinha, horas e mais pedidos. */
export async function GET(request: Request) {
  const ctx = await guardStaff(request, { mutating: false, permission: "settings.edit" });
  if (ctx instanceof Response) return ctx;
  return json(await getDaySummary(await getDb(), ctx));
}
