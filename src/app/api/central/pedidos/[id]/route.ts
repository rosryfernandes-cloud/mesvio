import { z } from "zod";
import { getDb } from "@/server/db/client";
import { json } from "@/server/staff/http";
import { guardPlatform } from "@/server/platform/admin-auth";
import { updateDemoRequest } from "@/server/contact/demo-requests";

export const dynamic = "force-dynamic";

/** Seguimento de um pedido de demonstração: { status?, notes? }. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await guardPlatform(request, { mutating: true });
  if (admin instanceof Response) return admin;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return json({ message: "Pedido não encontrado." }, 404);
  const ok = await updateDemoRequest(await getDb(), id, await request.json().catch(() => null));
  return ok ? json({ ok: true }) : json({ message: "Não foi possível guardar." }, 400);
}
