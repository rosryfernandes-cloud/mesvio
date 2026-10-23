import { z } from "zod";
import { getDb } from "@/server/db/client";
import { guardStaff, json } from "@/server/staff/http";
import { setProductSoldOut } from "@/server/staff/staff-service";

export const dynamic = "force-dynamic";

const schema = z.object({ productRef: z.string().min(1).max(64), soldOut: z.boolean() });

export async function POST(request: Request) {
  const ctx = await guardStaff(request, { mutating: true, permission: "catalog.sold_out" });
  if (ctx instanceof Response) return ctx;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ message: "Pedido inválido." }, 400);
  await setProductSoldOut(await getDb(), ctx, parsed.data.productRef, parsed.data.soldOut);
  return json({ ok: true });
}
