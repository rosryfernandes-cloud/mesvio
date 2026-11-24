import { z } from "zod";
import { getDb } from "@/server/db/client";
import { json } from "@/server/staff/http";
import { guardPlatform } from "@/server/platform/admin-auth";
import { setTableActive } from "@/server/platform/platform-service";

export const dynamic = "force-dynamic";

const schema = z.object({ active: z.boolean() });

/** Central: retirar um lugar (o QR deixa de abrir) ou repô-lo. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; mesaId: string }> }) {
  const admin = await guardPlatform(request, { mutating: true });
  if (admin instanceof Response) return admin;
  const { id, mesaId } = await params;
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(mesaId).success) return json({ message: "Lugar não encontrado." }, 404);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ message: "Pedido inválido." }, 400);
  const result = await setTableActive(await getDb(), admin, id, mesaId, parsed.data.active);
  return json(result, result.ok ? 200 : 404);
}
