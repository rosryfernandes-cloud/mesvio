import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { findPlatformAdmin } from "@/server/platform/admin-auth";
import { endSupport, readSupportCookie, SUPPORT_COOKIE } from "@/server/platform/support";
import { resolvePublicBaseUrl } from "@/server/tables/table-qr";

export const dynamic = "force-dynamic";

/**
 * Sair do modo suporte: limpa o cookie, regista e volta à ficha do restaurante. É um GET porque só
 * retira um acesso, e é também o destino de um modo suporte que deixou de valer.
 */
export async function GET(request: Request) {
  const base = resolvePublicBaseUrl(process.env.NEXT_PUBLIC_APP_URL, request.headers.get("host"), request.headers.get("x-forwarded-proto"));
  const session = readSupportCookie((await cookies()).get(SUPPORT_COOKIE)?.value);
  const userId = await getCurrentUserId();
  let target = `${base}/painel/entrar`;
  if (session && session.userId === userId) {
    const db = await getDb();
    const admin = await findPlatformAdmin(db, session.userId);
    if (admin) {
      await endSupport(db, admin, session);
      target = `${base}/central/restaurantes/${session.establishmentId}`;
    }
  }
  const res = NextResponse.redirect(target);
  res.cookies.set(SUPPORT_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
