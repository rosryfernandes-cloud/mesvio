import { z } from "zod";
import { getDb } from "@/server/db/client";
import { findPlatformAdmin } from "@/server/platform/admin-auth";
import { getWeek, saveWeek, WEEK_SCHEMA } from "@/server/clock/clock-schedule";
import { guardStaff, json } from "@/server/staff/http";

export const dynamic = "force-dynamic";

const monday = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => new Date(`${d}T12:00:00Z`).getUTCDay() === 1, "Tem de ser uma segunda-feira.");

/** Escala de uma semana (de segunda a domingo). */
export async function GET(request: Request) {
  const ctx = await guardStaff(request, { mutating: false, permission: "settings.edit" });
  if (ctx instanceof Response) return ctx;
  // Picar ponto em testes: só a equipa MESVIO (ver staff-panel.tsx).
  if (!(await findPlatformAdmin(await getDb(), ctx.userId))) return new Response("Não encontrado", { status: 404 });
  const week = monday.safeParse(new URL(request.url).searchParams.get("semana"));
  if (!week.success) return json({ message: "Escolha a semana." }, 400);
  return json({ monday: week.data, rows: await getWeek(await getDb(), ctx, week.data) });
}

export async function POST(request: Request) {
  const ctx = await guardStaff(request, { mutating: true, permission: "settings.edit" });
  if (ctx instanceof Response) return ctx;
  if (!(await findPlatformAdmin(await getDb(), ctx.userId))) return new Response("Não encontrado", { status: 404 });
  const parsed = z.object({ monday, rows: WEEK_SCHEMA }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ message: "Verifique as horas da escala (ex.: 9-15, 19-23)." }, 400);
  await saveWeek(await getDb(), ctx, parsed.data.monday, parsed.data.rows);
  return json({ ok: true });
}
