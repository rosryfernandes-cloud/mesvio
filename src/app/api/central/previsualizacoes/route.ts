import { z } from "zod";
import { getDb } from "@/server/db/client";
import { guardPlatform } from "@/server/platform/admin-auth";
import { createPreview, deletePreview, markPreviewEmailed } from "@/server/platform/menu-previews";
import { json } from "@/server/staff/http";

export const dynamic = "force-dynamic";

/** Guarda a demonstração como pré-visualização com link privado (só administradores). */
export async function POST(request: Request) {
  const admin = await guardPlatform(request, { mutating: true });
  if (admin instanceof Response) return admin;
  const r = await createPreview(await getDb(), admin, await request.json().catch(() => null));
  if (!r.ok) return json({ message: r.message }, 400);
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin).replace(/\/+$/, "");
  return json({ token: r.token, url: `${base}/p/${r.token}` }, 201);
}

/** Apaga uma pré-visualização (o link deixa de funcionar): ?id=… */
export async function DELETE(request: Request) {
  const admin = await guardPlatform(request, { mutating: true });
  if (admin instanceof Response) return admin;
  const id = z.uuid().safeParse(new URL(request.url).searchParams.get("id"));
  if (!id.success) return json({ message: "Pedido inválido." }, 400);
  return json({ ok: await deletePreview(await getDb(), id.data) });
}

/** Marca que o email para este restaurante foi aberto no Gmail: ?id=… */
export async function PATCH(request: Request) {
  const admin = await guardPlatform(request, { mutating: true });
  if (admin instanceof Response) return admin;
  const id = z.uuid().safeParse(new URL(request.url).searchParams.get("id"));
  if (!id.success) return json({ message: "Pedido inválido." }, 400);
  return json({ ok: await markPreviewEmailed(await getDb(), id.data) });
}
