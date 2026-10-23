import { z } from "zod";
import { getDb } from "@/server/db/client";
import { guardStaff, json } from "@/server/staff/http";
import { closeTable } from "@/server/tables/table-sessions";

export const dynamic = "force-dynamic";

const schema = z.object({ action: z.literal("close"), force: z.boolean().optional() });

/** Fechar a conta de uma mesa (cliente pagou e saiu). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await guardStaff(request, { mutating: true, permission: "orders.act" });
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !z.uuid().safeParse(id).success) return json({ message: "Pedido inválido." }, 400);

  const r = await closeTable(await getDb(), ctx, id, { force: parsed.data.force });
  if (r.ok) return json({ ok: true });
  return json(r, r.code === "NOT_FOUND" ? 404 : 409);
}
