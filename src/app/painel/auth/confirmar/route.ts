import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { authMode } from "@/server/auth/config";
import { createSupabaseServerClient } from "@/server/auth/supabase";

export const dynamic = "force-dynamic";

/**
 * Link do email de convite (template da Supabase):
 * {{ .SiteURL }}/painel/auth/confirmar?token_hash={{ .TokenHash }}&type=invite
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  if (authMode() === "supabase" && tokenHash && type && ["invite", "email", "magiclink"].includes(type)) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return NextResponse.redirect(new URL("/painel", url.origin));
  }
  return NextResponse.redirect(new URL("/painel/entrar?erro=link", url.origin));
}
