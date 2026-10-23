import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { authMode } from "@/server/auth/config";
import { checkLoginLimits } from "@/server/auth/login-limits";
import { createSupabaseServerClient } from "@/server/auth/supabase";
import { clientIpFromHeaders, hashClientIp } from "@/server/security/rate-limit";
import { resolveStaffContext } from "@/server/staff/context";
import { isSameOrigin } from "@/server/staff/session";
import { findPlatformAdmin } from "@/server/platform/admin-auth";

export const dynamic = "force-dynamic";

const schema = z.object({ email: z.email().max(200), codigo: z.string().regex(/^\d{6}$/) });

/** Passo 2: valida o código; a Supabase grava a sessão em cookies httpOnly. */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ message: "Pedido recusado." }, { status: 403 });
  if (authMode() !== "supabase") return NextResponse.json({ message: "Entrada por email indisponível." }, { status: 404 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "O código tem 6 dígitos." }, { status: 400 });
  const email = parsed.data.email.trim().toLowerCase();
  const db = await getDb();

  const limit = await checkLoginLimits(db, "verify", hashClientIp(clientIpFromHeaders(request.headers)), email);
  if (!limit.allowed) {
    return NextResponse.json({ message: "Demasiadas tentativas. Peça um código novo daqui a uns minutos." }, { status: 429 });
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.verifyOtp({ email, token: parsed.data.codigo, type: "email" });
  if (error || !data.user) return NextResponse.json({ message: "Código inválido ou expirado." }, { status: 401 });

  // Conta válida mas sem nenhum restaurante (ex.: foi removida da equipa) nem acesso ao painel
  // central: não fica com sessão.
  if (!(await resolveStaffContext(db, data.user.id)) && !(await findPlatformAdmin(db, data.user.id))) {
    await supabase.auth.signOut();
    return NextResponse.json({ message: "Esta conta não tem acesso a nenhum restaurante." }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}
