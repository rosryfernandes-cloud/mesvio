import "server-only";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getDb, type Db } from "@/server/db/client";
import { auditLogs, platformAdmins } from "@/server/db/schema";
import { getCurrentUserId } from "@/server/auth/current-user";
import { hitRateLimit } from "@/server/security/rate-limit";
import { open, seal } from "@/server/security/secret-box";
import { decodeSigned, encodeSigned, isSameOrigin } from "@/server/staff/session";
import { generateTotpSecret, totpUri, verifyTotp } from "./totp";
import { activationCodeMatches } from "./activation";
import { authMode } from "@/server/auth/config";

/**
 * Acesso ao painel central da MESVIO: sessão normal (email + código, como o painel) e, por cima,
 * 2FA obrigatório. Depois do código TOTP, um cookie assinado de 8 h marca a sessão como verificada.
 */
export const PLATFORM_COOKIE = "mesvio_central";
const MFA_SESSION_MS = 8 * 3600_000;
export const MFA_ATTEMPTS = { limit: 5, windowSeconds: 5 * 60 };

export type PlatformAdmin = typeof platformAdmins.$inferSelect;

export type PlatformState =
  | { kind: "anonymous" }
  | { kind: "forbidden" }
  | { kind: "needs_enrollment"; admin: PlatformAdmin }
  | { kind: "needs_mfa"; admin: PlatformAdmin }
  | { kind: "ok"; admin: PlatformAdmin };

export async function findPlatformAdmin(db: Db, userId: string): Promise<PlatformAdmin | null> {
  const [row] = await db.select().from(platformAdmins).where(eq(platformAdmins.userId, userId)).limit(1);
  return row ?? null;
}

/** Estado de quem abre o painel central (sessão, administrador?, 2FA configurado e verificado?). */
export async function getPlatformState(db?: Db): Promise<PlatformState> {
  const userId = await getCurrentUserId();
  if (!userId) return { kind: "anonymous" };
  const admin = await findPlatformAdmin(db ?? (await getDb()), userId);
  if (!admin) return { kind: "forbidden" };
  if (!admin.totpSecretCiphertext) return { kind: "needs_enrollment", admin };
  const session = decodeSigned((await cookies()).get(PLATFORM_COOKIE)?.value);
  return session?.u === userId ? { kind: "ok", admin } : { kind: "needs_mfa", admin };
}

export function platformCookie(userId: string) {
  return {
    name: PLATFORM_COOKIE,
    value: encodeSigned({ u: userId }, Date.now() + MFA_SESSION_MS),
    options: {
      httpOnly: true,
      sameSite: "strict" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: MFA_SESSION_MS / 1000,
    },
  };
}

async function audit(db: Db, admin: PlatformAdmin, action: string, after?: unknown) {
  await db.insert(auditLogs).values({ actorType: "admin", actorId: admin.userId, action, entityType: "platform_admin", entityId: admin.userId, after });
}

/**
 * Em produção, configurar o 2FA exige o código de ativação do script (ver activation.ts). No modo
 * de desenvolvimento (sem Supabase, sem emails) não há email para roubar e o código dispensa-se.
 */
export const activationRequired = () => authMode() !== "dev";

export type EnrollmentStart =
  | { ok: true; secret: string; uri: string }
  | { ok: false; code: "ACTIVATION_INVALID" | "RATE_LIMITED" | "ALREADY_ENROLLED"; message: string };

/**
 * Passo 1 da configuração: valida o código de ativação e devolve o segredo (pendente até
 * confirmar), para mostrar em QR. O código é pedido em cada chamada, mesmo com segredo pendente.
 */
export async function startEnrollment(
  db: Db,
  admin: PlatformAdmin,
  { activationCode, requireActivation = activationRequired(), now = Date.now() }: { activationCode?: string; requireActivation?: boolean; now?: number } = {},
): Promise<EnrollmentStart> {
  const [fresh] = await db.select().from(platformAdmins).where(eq(platformAdmins.userId, admin.userId));
  if (!fresh || fresh.totpSecretCiphertext) return { ok: false, code: "ALREADY_ENROLLED", message: "O 2FA já está configurado." };
  if (requireActivation) {
    if (!(await hitRateLimit(db, `mfa:${admin.userId}`, MFA_ATTEMPTS)).allowed) {
      return { ok: false, code: "RATE_LIMITED", message: "Demasiadas tentativas. Aguarde 5 minutos." };
    }
    if (!activationCodeMatches(activationCode ?? "", fresh.enrollmentCodeHash, fresh.enrollmentCodeExpiresAt, now)) {
      await audit(db, admin, "platform.activation_failed");
      return { ok: false, code: "ACTIVATION_INVALID", message: "Código de ativação errado ou expirado. Peça um novo (npm run admin:repor-2fa)." };
    }
  }
  // Reutiliza o segredo pendente: abrir a página duas vezes não pode mostrar um QR diferente do guardado.
  let secret = fresh.totpPendingCiphertext ? open(fresh.totpPendingCiphertext) : null;
  if (!secret) {
    secret = generateTotpSecret();
    const claimed = await db
      .update(platformAdmins)
      .set({ totpPendingCiphertext: seal(secret) })
      .where(and(eq(platformAdmins.userId, admin.userId), isNull(platformAdmins.totpPendingCiphertext)))
      .returning({ userId: platformAdmins.userId });
    // Outro pedido gravou primeiro: usar o dele.
    if (claimed.length === 0) {
      const [again] = await db.select().from(platformAdmins).where(eq(platformAdmins.userId, admin.userId));
      secret = open(again!.totpPendingCiphertext!);
    }
  }
  return { ok: true, secret, uri: totpUri(secret, admin.email ?? "admin") };
}

export type MfaResult = { ok: true } | { ok: false; code: "INVALID" | "RATE_LIMITED" | "NOT_STARTED"; message: string };

const rateLimited: MfaResult = { ok: false, code: "RATE_LIMITED", message: "Demasiadas tentativas. Aguarde 5 minutos." };
const invalid: MfaResult = { ok: false, code: "INVALID", message: "Código errado ou expirado. Use o código atual da app." };

/** Passo 2: o primeiro código certo ativa o 2FA. */
export async function confirmEnrollment(db: Db, admin: PlatformAdmin, code: string, now = Date.now()): Promise<MfaResult> {
  if (!(await hitRateLimit(db, `mfa:${admin.userId}`, MFA_ATTEMPTS)).allowed) return rateLimited;
  const [fresh] = await db.select().from(platformAdmins).where(eq(platformAdmins.userId, admin.userId));
  // Já ativado há instantes (o mesmo código enviado duas vezes): aceitar esse mesmo código, para o
  // segundo envio não mostrar um erro. Fora disso, a entrada normal faz-se pelo passo de verificação.
  if (fresh?.totpSecretCiphertext) {
    const step = verifyTotp(open(fresh.totpSecretCiphertext), code, now);
    const justEnrolled = fresh.totpEnabledAt !== null && now - fresh.totpEnabledAt.getTime() < 2 * 60_000;
    return step !== null && justEnrolled && step === fresh.totpLastStep ? { ok: true } : invalid;
  }
  if (!fresh?.totpPendingCiphertext) {
    return { ok: false, code: "NOT_STARTED", message: "Comece de novo a configuração." };
  }
  const step = verifyTotp(open(fresh.totpPendingCiphertext), code, now);
  if (step === null) return invalid;
  await db
    .update(platformAdmins)
    // O código de ativação deixa de servir a partir daqui.
    .set({
      totpSecretCiphertext: fresh.totpPendingCiphertext,
      totpPendingCiphertext: null,
      totpEnabledAt: new Date(now),
      totpLastStep: step,
      enrollmentCodeHash: null,
      enrollmentCodeExpiresAt: null,
    })
    .where(eq(platformAdmins.userId, admin.userId));
  await audit(db, admin, "platform.mfa_enrolled");
  return { ok: true };
}

/** Entrada: código atual da app (cada código só serve uma vez). */
export async function verifyMfa(db: Db, admin: PlatformAdmin, code: string, now = Date.now()): Promise<MfaResult> {
  if (!(await hitRateLimit(db, `mfa:${admin.userId}`, MFA_ATTEMPTS)).allowed) return rateLimited;
  const [fresh] = await db.select().from(platformAdmins).where(eq(platformAdmins.userId, admin.userId));
  if (!fresh?.totpSecretCiphertext) return { ok: false, code: "NOT_STARTED", message: "Configure primeiro o 2FA." };
  const step = verifyTotp(open(fresh.totpSecretCiphertext), code, now, fresh.totpLastStep);
  if (step === null) {
    await audit(db, admin, "platform.mfa_failed");
    return invalid;
  }
  // Só grava se o intervalo for novo: dois pedidos com o mesmo código ao mesmo tempo não passam ambos.
  const claimed = await db
    .update(platformAdmins)
    .set({ totpLastStep: step })
    .where(and(eq(platformAdmins.userId, admin.userId), or(isNull(platformAdmins.totpLastStep), lt(platformAdmins.totpLastStep, step))))
    .returning({ userId: platformAdmins.userId });
  if (claimed.length === 0) return invalid;
  await audit(db, admin, "platform.login");
  return { ok: true };
}

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Guarda das rotas /api/central: sessão, administrador e 2FA verificado; em alterações, origem da
 * própria app. Quem não é administrador recebe 404 (não se revela que o painel existe).
 */
export async function guardPlatform(request: Request, { mutating }: { mutating: boolean }): Promise<PlatformAdmin | NextResponse> {
  if (mutating && !isSameOrigin(request)) {
    return NextResponse.json({ code: "FORBIDDEN", message: "Pedido recusado." }, { status: 403, headers: NO_STORE });
  }
  const state = await getPlatformState();
  if (state.kind === "ok") return state.admin;
  if (state.kind === "anonymous" || state.kind === "forbidden") {
    return NextResponse.json({ code: "NOT_FOUND" }, { status: 404, headers: NO_STORE });
  }
  return NextResponse.json({ code: "MFA_REQUIRED", message: "Confirme o código 2FA." }, { status: 401, headers: NO_STORE });
}

/** Para as rotas de 2FA: administrador com sessão, verificado ou não. */
export async function guardPlatformPreMfa(request: Request): Promise<PlatformAdmin | NextResponse> {
  if (!isSameOrigin(request)) return NextResponse.json({ code: "FORBIDDEN", message: "Pedido recusado." }, { status: 403, headers: NO_STORE });
  const state = await getPlatformState();
  if (state.kind === "anonymous" || state.kind === "forbidden") return NextResponse.json({ code: "NOT_FOUND" }, { status: 404, headers: NO_STORE });
  return state.admin;
}
