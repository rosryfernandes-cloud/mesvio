import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { authMode } from "@/server/auth/config";
import { checkLoginLimits } from "@/server/auth/login-limits";
import { createSupabaseServerClient } from "@/server/auth/supabase";
import { clientIpFromHeaders, hashClientIp } from "@/server/security/rate-limit";
import { isSameOrigin } from "@/server/staff/session";

export const dynamic = "force-dynamic";

const schema = z.object({ email: z.email().max(200) });
// Mesma resposta exista ou não a conta: não revela quem tem acesso.
const SENT = { ok: true, message: "Se este email tiver acesso, enviámos um código de entrada." };

/** Passo 1: envia um código de entrada por email (só a utilizadores já convidados). */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ message: "Pedido recusado." }, { status: 403 });
  if (authMode() !== "supabase") return NextResponse.json({ message: "Entrada por email indisponível." }, { status: 404 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Email inválido." }, { status: 400 });
  const email = parsed.data.email.trim().toLowerCase();

  const limit = await checkLoginLimits(await getDb(), "code", hashClientIp(clientIpFromHeaders(request.headers)), email);
  if (!limit.allowed) {
    return NextResponse.json({ message: "Demasiadas tentativas. Aguarde alguns minutos." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  if (error && error.status !== 400 && error.status !== 422) console.error("[auth] envio do código falhou", error.message);
  return NextResponse.json(SENT);
}
