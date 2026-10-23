import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { authMode } from "@/server/auth/config";
import { DEV_SESSION_SECONDS, DEV_USER_COOKIE, devUserCookieValue } from "@/server/auth/current-user";
import { resolveStaffContext } from "@/server/staff/context";
import { isSameOrigin } from "@/server/staff/session";
import { findPlatformAdmin } from "@/server/platform/admin-auth";

export const dynamic = "force-dynamic";

/** Só em desenvolvimento sem Supabase: entrar como um utilizador de demonstração. */
export async function POST(request: Request) {
  if (authMode() !== "dev") return NextResponse.json({ message: "Indisponível." }, { status: 404 });
  if (!isSameOrigin(request)) return NextResponse.json({ message: "Pedido recusado." }, { status: 403 });
  const parsed = z.object({ userId: z.uuid() }).safeParse(await request.json().catch(() => null));
  const db = await getDb();
  if (!parsed.success || (!(await resolveStaffContext(db, parsed.data.userId)) && !(await findPlatformAdmin(db, parsed.data.userId)))) {
    return NextResponse.json({ message: "Utilizador sem acesso." }, { status: 403 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(DEV_USER_COOKIE, devUserCookieValue(parsed.data.userId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: DEV_SESSION_SECONDS,
  });
  return res;
}
