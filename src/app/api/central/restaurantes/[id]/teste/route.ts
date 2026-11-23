import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { establishments } from "@/server/db/schema";
import { json } from "@/server/staff/http";
import { guardPlatform } from "@/server/platform/admin-auth";

export const dynamic = "force-dynamic";

const schema = z.object({ isTest: z.boolean() });

/** Central: marcar um restaurante como de teste (aba "Teste", fora dos números e dos alertas) ou como real. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await guardPlatform(request, { mutating: true });
  if (admin instanceof Response) return admin;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return json({ message: "Restaurante não encontrado." }, 404);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ message: "Pedido inválido." }, 400);
  const db = await getDb();
  const [row] = await db
    .update(establishments)
    .set({ isTest: parsed.data.isTest, updatedAt: new Date() })
    .where(eq(establishments.id, id))
    .returning({ isTest: establishments.isTest });
  if (!row) return json({ message: "Restaurante não encontrado." }, 404);
  return json(row);
}
