import { z } from "zod";
import { getDb } from "@/server/db/client";
import { guardStaff, json } from "@/server/staff/http";
import { actOnCall, CALL_ACTIONS, type CallAction } from "@/server/tables/service-requests";

export const dynamic = "force-dynamic";

const schema = z.object({ action: z.enum(CALL_ACTIONS as [CallAction, ...CallAction[]]) });

/** Staff responde a uma chamada do cliente: "ack" (A caminho) ou "done" (Feito). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await guardStaff(request, { mutating: true, permission: "orders.act" });
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !z.uuid().safeParse(id).success) return json({ message: "Ação inválida." }, 400);
  const ok = await actOnCall(await getDb(), ctx, id, parsed.data.action);
  return ok ? json({ ok: true }) : json({ message: "Esta chamada já foi resolvida. A lista foi atualizada." }, 409);
}
