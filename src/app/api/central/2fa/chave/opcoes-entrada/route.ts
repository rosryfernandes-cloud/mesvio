import { getDb } from "@/server/db/client";
import { json } from "@/server/staff/http";
import { guardPlatformPreMfa } from "@/server/platform/admin-auth";
import { passkeyAuthenticationOptions } from "@/server/platform/passkeys";
import { relyingParty, setChallenge } from "@/server/platform/webauthn-http";

export const dynamic = "force-dynamic";

/** Entrar com Face ID / Touch ID: pede ao aparelho que assine um desafio novo. */
export async function POST(request: Request) {
  const admin = await guardPlatformPreMfa(request);
  if (admin instanceof Response) return admin;
  const options = await passkeyAuthenticationOptions(await getDb(), admin, relyingParty(request));
  const res = json({ options });
  setChallenge(res, admin.userId, "auth", options.challenge);
  return res;
}
