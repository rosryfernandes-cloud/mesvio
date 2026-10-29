import { getDb } from "@/server/db/client";
import { guardStaff, json } from "@/server/staff/http";
import { getReviewsOverview, saveReviewSettings } from "@/server/reviews/reviews";

export const dynamic = "force-dynamic";

/** Avaliações dos clientes (últimos 90 dias) e definições (dono/gerente). */
export async function GET(request: Request) {
  const ctx = await guardStaff(request, { mutating: false, permission: "settings.edit" });
  if (ctx instanceof Response) return ctx;
  return json(await getReviewsOverview(await getDb(), ctx));
}

/** Ligar/desligar as avaliações e guardar o link do Google ({ enabled, googleReviewUrl }). */
export async function POST(request: Request) {
  const ctx = await guardStaff(request, { mutating: true, permission: "settings.edit" });
  if (ctx instanceof Response) return ctx;
  const r = await saveReviewSettings(await getDb(), ctx, await request.json().catch(() => null));
  return r.ok ? json({ ok: true }) : json({ message: r.message }, 400);
}
