import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { diningTables } from "@/server/db/schema";
import { json } from "@/server/staff/http";
import { guardPlatform } from "@/server/platform/admin-auth";
import { applyTableAction } from "@/server/tables/table-admin";

export const dynamic = "force-dynamic";

const schema = z.object({ action: z.enum(["rotate_qr", "deactivate", "activate"]) });

/** Painel central: rodar o QR, desativar ou reativar um lugar de qualquer restaurante. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await guardPlatform(request, { mutating: true });
  if (admin instanceof Response) return admin;
  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !z.uuid().safeParse(id).success) return json({ message: "Pedido inválido." }, 400);
  const db = await getDb();
  const [table] = await db.select({ org: diningTables.organizationId }).from(diningTables).where(eq(diningTables.id, id)).limit(1);
  if (!table) return json({ message: "Lugar não encontrado." }, 404);
  await db.transaction((tx) => applyTableAction(tx, { organizationId: table.org, actorType: "admin", actorId: admin.userId }, id, parsed.data.action));
  return json({ ok: true });
}
