import { z } from "zod";
import { getDb } from "@/server/db/client";
import { json } from "@/server/staff/http";
import { getPlatformState, guardPlatformPreMfa, platformCookie } from "@/server/platform/admin-auth";
import { redeemRecoveryCode } from "@/server/platform/passkeys";

export const dynamic = "force-dynamic";

/** Entrar com um código de recuperação (sem Face ID nem app, ex.: telemóvel perdido). */
export async function POST(request: Request) {
  const admin = await guardPlatformPreMfa(request);
  if (admin instanceof Response) return admin;
  if ((await getPlatformState()).kind === "needs_enrollment") return json({ code: "NOT_STARTED", message: "Configure primeiro a verificação." }, 400);
  const parsed = z.object({ codigo: z.string().max(20) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ message: "Código inválido." }, 400);
  const r = await redeemRecoveryCode(await getDb(), admin, parsed.data.codigo);
  if (!r.ok) return json({ code: r.code, message: r.message }, r.code === "RATE_LIMITED" ? 429 : 401);
  const res = json({ ok: true, remaining: r.remaining });
  const c = platformCookie(admin.userId);
  res.cookies.set(c.name, c.value, c.options);
  return res;
}
