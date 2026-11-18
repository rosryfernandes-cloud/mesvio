import { z } from "zod";
import { getDb } from "@/server/db/client";
import { json } from "@/server/staff/http";
import { guardPlatform } from "@/server/platform/admin-auth";
import { updateCompany } from "@/server/platform/platform-service";

export const dynamic = "force-dynamic";

/** Corrigir o nome legal, o NIF, o email de faturação e o nome na ementa. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await guardPlatform(request, { mutating: true });
  if (admin instanceof Response) return admin;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return json({ message: "Restaurante não encontrado." }, 404);
  const result = await updateCompany(await getDb(), admin, id, await request.json().catch(() => null));
  return json(result, result.ok ? 200 : result.code === "NOT_FOUND" ? 404 : result.code === "CONFLICT" ? 409 : 400);
}
