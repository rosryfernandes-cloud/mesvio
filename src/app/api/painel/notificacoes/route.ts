import { z } from "zod";
import { getDb } from "@/server/db/client";
import { guardStaff, json } from "@/server/staff/http";
import { notifyMe, removeSubscription, saveSubscription } from "@/server/notifications/push";

export const dynamic = "force-dynamic";

const schema = z.union([
  z.object({ action: z.literal("subscribe"), subscription: z.unknown() }),
  z.object({ action: z.literal("unsubscribe"), endpoint: z.string().max(2000) }),
  z.object({ action: z.literal("test") }),
]);

/** Notificações neste aparelho: ligar ({ subscription }), desligar ({ endpoint }) ou enviar um teste. */
export async function POST(request: Request) {
  const ctx = await guardStaff(request, { mutating: true, permission: "orders.act" });
  if (ctx instanceof Response) return ctx;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ message: "Pedido inválido." }, 400);
  const db = await getDb();
  if (parsed.data.action === "subscribe") {
    return (await saveSubscription(db, ctx, parsed.data.subscription)) ? json({ ok: true }) : json({ message: "Aparelho inválido." }, 400);
  }
  if (parsed.data.action === "unsubscribe") {
    await removeSubscription(db, ctx, parsed.data.endpoint);
    return json({ ok: true });
  }
  const sent = await notifyMe(db, ctx);
  return sent > 0 ? json({ ok: true, sent }) : json({ message: "Nenhum aparelho recebeu a notificação. Ligue-as de novo neste aparelho." }, 409);
}
