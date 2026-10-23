import { NextResponse } from "next/server";
import { z } from "zod";
import { ESTABLISHMENT_COOKIE } from "@/server/staff/context";
import { guardStaff } from "@/server/staff/http";

export const dynamic = "force-dynamic";

/** Trocar de restaurante no painel (só entre os restaurantes a que o utilizador tem acesso). */
export async function POST(request: Request) {
  const ctx = await guardStaff(request, { mutating: true });
  if (ctx instanceof Response) return ctx;
  const parsed = z.object({ establishmentId: z.uuid() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success || !ctx.establishments.some((e) => e.id === parsed.data.establishmentId)) {
    return NextResponse.json({ message: "Restaurante sem acesso." }, { status: 403 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ESTABLISHMENT_COOKIE, parsed.data.establishmentId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 365 * 86400 });
  return res;
}
