import { z } from "zod";
import { getDb } from "@/server/db/client";
import { json } from "@/server/staff/http";
import { guardPlatform } from "@/server/platform/admin-auth";
import { setPlan } from "@/server/platform/platform-service";

export const dynamic = "force-dynamic";

/** Mudar o plano do restaurante ({ plan: "menu" | "orders" | "payments" }). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await guardPlatform(request, { mutating: true });
  if (admin instanceof Response) return admin;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return json({ message: "Restaurante não encontrado." }, 404);
  const body = (await request.json().catch(() => null)) as { plan?: unknown } | null;
  const result = await setPlan(await getDb(), admin, id, body?.plan);
  return json(result, result.ok ? 200 : result.code === "NOT_FOUND" ? 404 : 400);
}
