import { z } from "zod";
import { getDb } from "@/server/db/client";
import { json } from "@/server/staff/http";
import { guardPlatform } from "@/server/platform/admin-auth";
import { linkZoneSoft } from "@/server/pos/zonesoft/zsroi-service";

export const dynamic = "force-dynamic";

/** Liga o restaurante à ZoneSoft: guarda (cifradas) as credenciais do cliente criado no portal. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await guardPlatform(request, { mutating: true });
  if (admin instanceof Response) return admin;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return json({ message: "Restaurante não encontrado." }, 404);
  const body = await request.json().catch(() => null);
  const result = await linkZoneSoft(await getDb(), admin.userId, id, body);
  return json(result, result.ok ? 200 : result.code === "NOT_FOUND" ? 404 : 400);
}
