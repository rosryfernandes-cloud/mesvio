import { z } from "zod";
import { getDb } from "@/server/db/client";
import { json } from "@/server/staff/http";
import { guardPlatform } from "@/server/platform/admin-auth";
import { simulateZoneSoftAccept } from "@/server/pos/zonesoft/zsroi-service";

export const dynamic = "force-dynamic";

/** Central: simular na conta demo da ZoneSoft o "aceite" do último pedido enviado. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await guardPlatform(request, { mutating: true });
  if (admin instanceof Response) return admin;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return json({ message: "Restaurante não encontrado." }, 404);
  const result = await simulateZoneSoftAccept(await getDb(), id);
  return json(result, result.ok ? 200 : result.code === "NOT_FOUND" ? 404 : 400);
}
