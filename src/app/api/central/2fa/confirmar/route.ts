import { z } from "zod";
import { getDb } from "@/server/db/client";
import { json } from "@/server/staff/http";
import { confirmEnrollment, guardPlatformPreMfa, platformCookie } from "@/server/platform/admin-auth";
import { afterFirstFactor, countPasskeys } from "@/server/platform/passkeys";

export const dynamic = "force-dynamic";

/** Confirmar a configuração do 2FA com o primeiro código da app (fica logo com a sessão verificada). */
export async function POST(request: Request) {
  const admin = await guardPlatformPreMfa(request);
  if (admin instanceof Response) return admin;
  const parsed = z.object({ codigo: z.string().regex(/^\d{6}$/) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ message: "O código tem 6 dígitos." }, 400);
  const db = await getDb();
  const result = await confirmEnrollment(db, admin, parsed.data.codigo);
  if (!result.ok) return json({ code: result.code, message: result.message }, result.code === "RATE_LIMITED" ? 429 : 400);
  // Primeiro método ligado: gerar os códigos de recuperação (só aparecem agora).
  const recoveryCodes = (await countPasskeys(db, admin.userId)) === 0 ? await afterFirstFactor(db, admin) : undefined;
  const res = json({ ok: true, recoveryCodes: recoveryCodes ?? null });
  const c = platformCookie(admin.userId);
  res.cookies.set(c.name, c.value, c.options);
  return res;
}
