import { z } from "zod";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { getDb } from "@/server/db/client";
import { json } from "@/server/staff/http";
import { guardPlatformPreMfa, platformCookie } from "@/server/platform/admin-auth";
import { finishPasskeyAuthentication } from "@/server/platform/passkeys";
import { clearChallenge, readChallenge, relyingParty } from "@/server/platform/webauthn-http";

export const dynamic = "force-dynamic";

/** Resposta do aparelho: assinatura certa → sessão do painel central verificada. */
export async function POST(request: Request) {
  const admin = await guardPlatformPreMfa(request);
  if (admin instanceof Response) return admin;
  const challenge = await readChallenge(admin.userId, "auth");
  if (!challenge) return json({ code: "EXPIRED", message: "Demorou demasiado. Tente de novo." }, 400);
  const body = z.object({ response: z.looseObject({ id: z.string() }) }).safeParse(await request.json().catch(() => null));
  if (!body.success) return json({ message: "Pedido inválido." }, 400);
  const r = await finishPasskeyAuthentication(await getDb(), admin, {
    response: body.data.response as unknown as AuthenticationResponseJSON,
    challenge,
    rp: relyingParty(request),
  });
  const res = r.ok ? json({ ok: true }) : json({ code: r.code, message: r.message }, r.code === "RATE_LIMITED" ? 429 : 401);
  clearChallenge(res);
  if (r.ok) {
    const c = platformCookie(admin.userId);
    res.cookies.set(c.name, c.value, c.options);
  }
  return res;
}
