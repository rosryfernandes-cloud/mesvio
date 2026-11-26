import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { authMode } from "@/server/auth/config";
import { createSupabaseServerClient } from "@/server/auth/supabase";
import { getDb } from "@/server/db/client";
import { findPlatformAdmin } from "@/server/platform/admin-auth";
import { resolveStaffContext } from "@/server/staff/context";

export const dynamic = "force-dynamic";

/**
 * Links dos emails (templates da Supabase):
 * convite: {{ .SiteURL }}/painel/auth/confirmar?token_hash={{ .TokenHash }}&type=invite
 * código de entrada (Magic Link), botão "Entrar": {{ .SiteURL }}/painel/auth/confirmar?token_hash={{ .TokenHash }}&type=email
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  if (authMode() === "supabase" && tokenHash && type && ["invite", "email", "magiclink"].includes(type)) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error && data.user) {
      // Igual à entrada com código: a equipa MESVIO vai para a central (com o 2FA); quem já não tem
      // nenhum restaurante não fica com sessão.
      const db = await getDb();
      if (await findPlatformAdmin(db, data.user.id)) return NextResponse.redirect(new URL("/central/entrar", url.origin));
      if (await resolveStaffContext(db, data.user.id)) return NextResponse.redirect(new URL("/painel", url.origin));
      await supabase.auth.signOut();
      return NextResponse.redirect(new URL("/painel/entrar?erro=acesso", url.origin));
    }
  }
  return NextResponse.redirect(new URL("/painel/entrar?erro=link", url.origin));
}
