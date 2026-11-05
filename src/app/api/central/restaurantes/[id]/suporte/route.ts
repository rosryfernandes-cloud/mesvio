import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { guardPlatform } from "@/server/platform/admin-auth";
import { startSupport, supportCookie } from "@/server/platform/support";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/** Abrir o painel deste restaurante em modo suporte (administrador com 2FA verificado). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await guardPlatform(request, { mutating: true });
  if (admin instanceof Response) return admin;
  const { id } = await params;
  const session = z.uuid().safeParse(id).success ? await startSupport(await getDb(), admin, id) : null;
  if (!session) return NextResponse.json({ message: "Restaurante não encontrado." }, { status: 404, headers: NO_STORE });
  const res = NextResponse.json({ ok: true }, { headers: NO_STORE });
  const cookie = supportCookie(session);
  res.cookies.set(cookie.name, cookie.value, cookie.options);
  return res;
}
