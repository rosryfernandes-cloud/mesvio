import { z } from "zod";
import { getDb } from "@/server/db/client";
import { json } from "@/server/staff/http";
import { guardPlatform } from "@/server/platform/admin-auth";
import { unlinkZoneSoft } from "@/server/pos/zonesoft/zsroi-service";

export const dynamic = "force-dynamic";

/** Central: desligar a ZoneSoft e voltar ao POS de demonstração (ementa de praia). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await guardPlatform(request, { mutating: true });
  if (admin instanceof Response) return admin;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return json({ message: "Restaurante não encontrado." }, 404);
  const result = await unlinkZoneSoft(await getDb(), admin.userId, id);
  return json(result, result.ok ? 200 : result.code === "NOT_FOUND" ? 404 : 400);
}
