import { z } from "zod";
import { getDb } from "@/server/db/client";
import { json } from "@/server/staff/http";
import { guardPlatform } from "@/server/platform/admin-auth";
import { getSecurityOverview, regenerateRecoveryCodes, removePasskey } from "@/server/platform/passkeys";

export const dynamic = "force-dynamic";

/** Chaves de acesso e códigos de recuperação de quem está no painel central. */
export async function GET(request: Request) {
  const admin = await guardPlatform(request, { mutating: false });
  if (admin instanceof Response) return admin;
  return json(await getSecurityOverview(await getDb(), admin));
}

const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("remove_passkey"), id: z.uuid() }),
  z.object({ action: z.literal("new_recovery_codes") }),
]);

export async function POST(request: Request) {
  const admin = await guardPlatform(request, { mutating: true });
  if (admin instanceof Response) return admin;
  const parsed = action.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ message: "Pedido inválido." }, 400);
  const db = await getDb();
  if (parsed.data.action === "new_recovery_codes") return json({ recoveryCodes: await regenerateRecoveryCodes(db, admin) });
  const r = await removePasskey(db, admin, parsed.data.id);
  return r.ok ? json({ ok: true }) : json({ message: r.message }, 400);
}
