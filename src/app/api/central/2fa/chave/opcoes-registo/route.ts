import { z } from "zod";
import { getDb } from "@/server/db/client";
import { json } from "@/server/staff/http";
import { checkActivation, getPlatformState, guardPlatformPreMfa } from "@/server/platform/admin-auth";
import { passkeyRegistrationOptions } from "@/server/platform/passkeys";
import { relyingParty, setChallenge } from "@/server/platform/webauthn-http";

export const dynamic = "force-dynamic";

/**
 * Registar o Face ID / Touch ID deste aparelho. Na primeira configuração exige o código de
 * ativação (como a app de códigos); com a sessão já verificada, serve para juntar outro aparelho.
 */
export async function POST(request: Request) {
  const admin = await guardPlatformPreMfa(request);
  if (admin instanceof Response) return admin;
  const state = await getPlatformState();
  if (state.kind === "needs_mfa") return json({ code: "MFA_REQUIRED", message: "Entre primeiro." }, 401);
  const db = await getDb();
  if (state.kind === "needs_enrollment") {
    const body = z.object({ codigoAtivacao: z.string().max(40).optional() }).safeParse(await request.json().catch(() => ({})));
    const gate = await checkActivation(db, admin, body.success ? body.data.codigoAtivacao : undefined);
    if (gate) return json({ code: gate.code, message: gate.message }, gate.code === "RATE_LIMITED" ? 429 : 403);
  }
  const options = await passkeyRegistrationOptions(db, admin, relyingParty(request));
  const res = json({ options });
  setChallenge(res, admin.userId, "reg", options.challenge);
  return res;
}
