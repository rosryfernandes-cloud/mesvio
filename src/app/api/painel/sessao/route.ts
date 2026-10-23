import { NextResponse } from "next/server";
import { authMode } from "@/server/auth/config";
import { DEV_USER_COOKIE } from "@/server/auth/current-user";
import { createSupabaseServerClient } from "@/server/auth/supabase";
import { ESTABLISHMENT_COOKIE } from "@/server/staff/context";
import { isSameOrigin } from "@/server/staff/session";
import { PLATFORM_COOKIE } from "@/server/platform/admin-auth";

export const dynamic = "force-dynamic";

/** Sair do painel (e do painel central, se estiver aberto). */
export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ message: "Pedido recusado." }, { status: 403 });
  if (authMode() === "supabase") await (await createSupabaseServerClient()).auth.signOut();
  const res = NextResponse.json({ ok: true });
  for (const name of [DEV_USER_COOKIE, ESTABLISHMENT_COOKIE, PLATFORM_COOKIE]) res.cookies.set(name, "", { path: "/", maxAge: 0 });
  return res;
}
