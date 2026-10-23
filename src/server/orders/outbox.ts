import "server-only";
import type { Db } from "@/server/db/client";
import { outbox } from "@/server/db/schema";

/** Tópico da tarefa "enviar o pedido ao POS" na outbox. */
export const SUBMIT_ORDER_TOPIC = "pos.submit_order";

/** Cria a tarefa de envio ao POS de um pedido (dentro da transação de quem chama). */
export async function enqueueSubmit(db: Db, organizationId: string, orderId: string, now: Date): Promise<void> {
  await db.insert(outbox).values({ organizationId, topic: SUBMIT_ORDER_TOPIC, payload: { orderId }, availableAt: now, createdAt: now });
}
