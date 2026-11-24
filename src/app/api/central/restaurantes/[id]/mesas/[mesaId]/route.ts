import { z } from "zod";
import { getDb } from "@/server/db/client";
import { json } from "@/server/staff/http";
import { guardPlatform } from "@/server/platform/admin-auth";
import { updateTable } from "@/server/platform/platform-service";

export const dynamic = "force-dynamic";

/** Central: editar um lugar (nome, zona, tipo) ou retirá-lo/repô-lo. O QR não muda. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; mesaId: string }> }) {
  const admin = await guardPlatform(request, { mutating: true });
  if (admin instanceof Response) return admin;
  const { id, mesaId } = await params;
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(mesaId).success) return json({ message: "Lugar não encontrado." }, 404);
  const result = await updateTable(await getDb(), admin, id, mesaId, await request.json().catch(() => null));
  return json(result, result.ok ? 200 : result.code === "NOT_FOUND" ? 404 : 400);
}
