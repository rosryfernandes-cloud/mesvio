import { z } from "zod";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { getDb } from "@/server/db/client";
import { json } from "@/server/staff/http";
import { getPlatformState, guardPlatformPreMfa, platformCookie } from "@/server/platform/admin-auth";
import { deviceName, finishPasskeyRegistration } from "@/server/platform/passkeys";
import { clearChallenge, readChallenge, relyingParty } from "@/server/platform/webauthn-http";

export const dynamic = "force-dynamic";

/** Resposta do aparelho ao registo. Na primeira configuração, fica logo com a sessão verificada. */
export async function POST(request: Request) {
  const admin = await guardPlatformPreMfa(request);
  if (admin instanceof Response) return admin;
  const state = await getPlatformState();
  if (state.kind === "needs_mfa") return json({ code: "MFA_REQUIRED", message: "Entre primeiro." }, 401);
  // O desafio só existe se as opções foram pedidas (com o código de ativação, na primeira vez).
  const challenge = await readChallenge(admin.userId, "reg");
  if (!challenge) return json({ code: "EXPIRED", message: "Demorou demasiado. Tente de novo." }, 400);
  const body = z.object({ response: z.looseObject({ id: z.string() }) }).safeParse(await request.json().catch(() => null));
  if (!body.success) return json({ message: "Pedido inválido." }, 400);
  const r = await finishPasskeyRegistration(await getDb(), admin, {
    response: body.data.response as unknown as RegistrationResponseJSON,
    challenge,
    rp: relyingParty(request),
    name: deviceName(request.headers.get("user-agent")),
  });
  const res = r.ok ? json({ ok: true, recoveryCodes: r.recoveryCodes ?? null }) : json({ code: r.code, message: r.message }, 400);
  clearChallenge(res);
  if (r.ok && state.kind === "needs_enrollment") {
    const c = platformCookie(admin.userId);
    res.cookies.set(c.name, c.value, c.options);
  }
  return res;
}
