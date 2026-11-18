import { z } from "zod";
import { getDb } from "@/server/db/client";
import { json } from "@/server/staff/http";
import { createUserDirectory, InviteError, inviteErrorText } from "@/server/auth/user-directory";
import { guardPlatform } from "@/server/platform/admin-auth";
import { inviteOwner, removeOwner } from "@/server/platform/platform-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await guardPlatform(request, { mutating: true });
  if (admin instanceof Response) return admin;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return json({ message: "Restaurante não encontrado." }, 404);
  const db = await getDb();
  try {
    const result = await inviteOwner(db, admin, id, await request.json().catch(() => null), createUserDirectory(db));
    return json(result, result.ok ? 201 : result.code === "NOT_FOUND" ? 404 : 400);
  } catch (err) {
    console.error("[central] convite ao dono falhou", err);
    return json({ ok: false, message: err instanceof InviteError ? inviteErrorText(err.message) : "O convite falhou. Tente de novo." }, 502);
  }
}

/** Tirar um dono (?utilizador=<id>); nunca deixa o restaurante sem dono. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await guardPlatform(request, { mutating: true });
  if (admin instanceof Response) return admin;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return json({ message: "Restaurante não encontrado." }, 404);
  const userId = new URL(request.url).searchParams.get("utilizador") ?? "";
  const result = await removeOwner(await getDb(), admin, id, userId);
  return json(result, result.ok ? 200 : result.code === "NOT_FOUND" ? 404 : result.code === "CONFLICT" ? 409 : 400);
}
