import { z } from "zod";
import { getDb } from "@/server/db/client";
import { notifyPlatformTest, removePlatformSubscription, savePlatformSubscription } from "@/server/notifications/push";
import { guardPlatform } from "@/server/platform/admin-auth";
import { json } from "@/server/staff/http";

export const dynamic = "force-dynamic";

const schema = z.union([
  z.object({ subscription: z.unknown() }),
  z.object({ remove: z.string().url() }),
  z.object({ test: z.literal(true) }),
]);

/** Central: ligar ou desligar os avisos neste aparelho, ou enviar um aviso de teste. */
export async function POST(request: Request) {
  const admin = await guardPlatform(request, { mutating: true });
  if (admin instanceof Response) return admin;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ message: "Pedido inválido." }, 400);
  const db = await getDb();
  const d = parsed.data;
  if ("subscription" in d) return (await savePlatformSubscription(db, admin.userId, d.subscription)) ? json({ ok: true }) : json({ message: "Aparelho inválido." }, 400);
  if ("remove" in d) {
    await removePlatformSubscription(db, admin.userId, d.remove);
    return json({ ok: true });
  }
  const sent = await notifyPlatformTest(db, admin.userId);
  return sent > 0 ? json({ ok: true, sent }) : json({ message: "Nenhum aparelho recebeu o aviso. Ligue os avisos neste aparelho primeiro." }, 409);
}
