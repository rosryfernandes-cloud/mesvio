import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransport,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import type { Db } from "@/server/db/client";
import { auditLogs, platformAdmins, platformPasskeys, platformRecoveryCodes } from "@/server/db/schema";
import { hitRateLimit } from "@/server/security/rate-limit";
import { MFA_ATTEMPTS, type MfaResult, type PlatformAdmin } from "./admin-auth";

/**
 * Chaves de acesso (Face ID / Touch ID) e códigos de recuperação do painel central. A chave
 * substitui o código da app de autenticação no segundo passo; os códigos de recuperação servem
 * para entrar quando não há chave nem app (telemóvel perdido) e só funcionam uma vez.
 */

const RP_NAME = "MESVIO Central";
export const RECOVERY_CODE_COUNT = 10;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem 0/O, 1/I

/** Onde a chave fica registada: o endereço por onde o painel foi aberto (ex.: mesvio.vercel.app). */
export type RelyingParty = { origin: string; rpID: string };

async function audit(db: Db, admin: PlatformAdmin, action: string, after?: unknown) {
  await db.insert(auditLogs).values({ actorType: "admin", actorId: admin.userId, action, entityType: "platform_admin", entityId: admin.userId, after });
}

const rateLimited = { ok: false, code: "RATE_LIMITED", message: "Demasiadas tentativas. Aguarde 5 minutos." } as const;

// ─────────────────────────── Códigos de recuperação ───────────────────────────

const normalize = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "");
export const hashRecoveryCode = (code: string) => createHash("sha256").update(`mesvio-recovery:${normalize(code)}`).digest("hex");

/** Ex.: "K7QM-W2XP" (≈ 40 bits). */
function newRecoveryCode(): string {
  const chars = [...randomBytes(8)].map((b) => ALPHABET[b % ALPHABET.length]).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}

/** Gera códigos novos (os antigos deixam de servir) e devolve-os para mostrar uma única vez. */
export async function regenerateRecoveryCodes(db: Db, admin: PlatformAdmin): Promise<string[]> {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, newRecoveryCode);
  await db.delete(platformRecoveryCodes).where(eq(platformRecoveryCodes.userId, admin.userId));
  await db.insert(platformRecoveryCodes).values(codes.map((c) => ({ userId: admin.userId, codeHash: hashRecoveryCode(c) })));
  await audit(db, admin, "platform.recovery_codes_generated");
  return codes;
}

export async function remainingRecoveryCodes(db: Db, userId: string): Promise<number> {
  return db.$count(platformRecoveryCodes, and(eq(platformRecoveryCodes.userId, userId), isNull(platformRecoveryCodes.usedAt)));
}

/** Entrada com um código de recuperação (cada um só serve uma vez). */
export async function redeemRecoveryCode(db: Db, admin: PlatformAdmin, code: string, now = new Date()): Promise<MfaResult & { remaining?: number }> {
  if (!(await hitRateLimit(db, `mfa:${admin.userId}`, MFA_ATTEMPTS)).allowed) return rateLimited;
  const wrong: MfaResult = { ok: false, code: "INVALID", message: "Código de recuperação errado ou já usado." };
  if (normalize(code).length !== 8) return wrong;
  const given = Buffer.from(hashRecoveryCode(code));
  const rows = await db
    .select({ id: platformRecoveryCodes.id, hash: platformRecoveryCodes.codeHash })
    .from(platformRecoveryCodes)
    .where(and(eq(platformRecoveryCodes.userId, admin.userId), isNull(platformRecoveryCodes.usedAt)));
  const match = rows.find((r) => {
    const expected = Buffer.from(r.hash);
    return expected.length === given.length && timingSafeEqual(expected, given);
  });
  if (!match) {
    await audit(db, admin, "platform.recovery_failed");
    return wrong;
  }
  // Só um pedido consegue marcar o código como usado.
  const claimed = await db
    .update(platformRecoveryCodes)
    .set({ usedAt: now })
    .where(and(eq(platformRecoveryCodes.id, match.id), isNull(platformRecoveryCodes.usedAt)))
    .returning({ id: platformRecoveryCodes.id });
  if (claimed.length === 0) return wrong;
  await audit(db, admin, "platform.login_recovery_code");
  return { ok: true, remaining: await remainingRecoveryCodes(db, admin.userId) };
}

// ─────────────────────────── Primeiro passo configurado ───────────────────────────

export async function countPasskeys(db: Db, userId: string): Promise<number> {
  return db.$count(platformPasskeys, eq(platformPasskeys.userId, userId));
}

/**
 * Depois de o primeiro método (chave ou app) ficar ativo: o código de ativação deixa de servir e,
 * se ainda não houver códigos de recuperação, geram-se (para mostrar uma vez).
 */
export async function afterFirstFactor(db: Db, admin: PlatformAdmin): Promise<string[] | undefined> {
  await db.update(platformAdmins).set({ enrollmentCodeHash: null, enrollmentCodeExpiresAt: null }).where(eq(platformAdmins.userId, admin.userId));
  if ((await remainingRecoveryCodes(db, admin.userId)) > 0) return undefined;
  return regenerateRecoveryCodes(db, admin);
}

// ─────────────────────────── Registar uma chave ───────────────────────────

export async function passkeyRegistrationOptions(db: Db, admin: PlatformAdmin, rp: RelyingParty) {
  const existing = await db.select().from(platformPasskeys).where(eq(platformPasskeys.userId, admin.userId));
  return generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: rp.rpID,
    userName: admin.email ?? "admin",
    userDisplayName: admin.displayName ?? admin.email ?? "Administrador",
    userID: new Uint8Array(Buffer.from(admin.userId.replaceAll("-", ""), "hex")),
    attestationType: "none",
    // Não registar duas vezes a mesma chave no mesmo aparelho.
    excludeCredentials: existing.map((k) => ({ id: k.credentialId, transports: k.transports as AuthenticatorTransport[] })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
  });
}

export type PasskeyResult = { ok: true; recoveryCodes?: string[] } | { ok: false; code: "INVALID" | "RATE_LIMITED"; message: string };

const failedKey: PasskeyResult = { ok: false, code: "INVALID", message: "Não foi possível confirmar o Face ID / Touch ID. Tente de novo." };

/** Nome que aparece na lista de chaves, a partir do aparelho onde foi criada. */
export function deviceName(userAgent: string | null): string {
  const ua = userAgent ?? "";
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Macintosh|Mac OS X/.test(ua)) return "Mac";
  if (/Android/.test(ua)) return "Android";
  if (/Windows/.test(ua)) return "Windows";
  return "Chave de acesso";
}

export async function finishPasskeyRegistration(
  db: Db,
  admin: PlatformAdmin,
  input: { response: RegistrationResponseJSON; challenge: string; rp: RelyingParty; name: string },
  verify = verifyRegistrationResponse,
): Promise<PasskeyResult> {
  const result = await verify({
    response: input.response,
    expectedChallenge: input.challenge,
    expectedOrigin: input.rp.origin,
    expectedRPID: input.rp.rpID,
    requireUserVerification: true,
  }).catch(() => null);
  if (!result?.verified) return failedKey;
  const { credential } = result.registrationInfo;
  const first = (await countPasskeys(db, admin.userId)) === 0 && !(await hasTotp(db, admin.userId));
  const inserted = await db
    .insert(platformPasskeys)
    .values({
      userId: admin.userId,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString("base64url"),
      counter: credential.counter,
      transports: credential.transports ?? [],
      name: input.name,
    })
    .onConflictDoNothing()
    .returning({ id: platformPasskeys.id });
  if (inserted.length === 0) return { ok: false, code: "INVALID", message: "Esta chave já está registada." };
  await audit(db, admin, "platform.passkey_added", { name: input.name });
  return { ok: true, recoveryCodes: first ? await afterFirstFactor(db, admin) : undefined };
}

async function hasTotp(db: Db, userId: string): Promise<boolean> {
  const [row] = await db.select({ s: platformAdmins.totpSecretCiphertext }).from(platformAdmins).where(eq(platformAdmins.userId, userId));
  return Boolean(row?.s);
}

// ─────────────────────────── Entrar com a chave ───────────────────────────

export async function passkeyAuthenticationOptions(db: Db, admin: PlatformAdmin, rp: RelyingParty) {
  const keys = await db.select().from(platformPasskeys).where(eq(platformPasskeys.userId, admin.userId));
  return generateAuthenticationOptions({
    rpID: rp.rpID,
    allowCredentials: keys.map((k) => ({ id: k.credentialId, transports: k.transports as AuthenticatorTransport[] })),
    userVerification: "required",
  });
}

export async function finishPasskeyAuthentication(
  db: Db,
  admin: PlatformAdmin,
  input: { response: AuthenticationResponseJSON; challenge: string; rp: RelyingParty },
  verify = verifyAuthenticationResponse,
  now = new Date(),
): Promise<PasskeyResult> {
  if (!(await hitRateLimit(db, `mfa:${admin.userId}`, MFA_ATTEMPTS)).allowed) return rateLimited;
  // A chave tem de ser desta pessoa: a de outro administrador não serve.
  const [key] = await db
    .select()
    .from(platformPasskeys)
    .where(and(eq(platformPasskeys.userId, admin.userId), eq(platformPasskeys.credentialId, input.response.id)));
  if (!key) return failedKey;
  const result = await verify({
    response: input.response,
    expectedChallenge: input.challenge,
    expectedOrigin: input.rp.origin,
    expectedRPID: input.rp.rpID,
    credential: { id: key.credentialId, publicKey: new Uint8Array(Buffer.from(key.publicKey, "base64url")), counter: key.counter, transports: key.transports as AuthenticatorTransport[] },
    requireUserVerification: true,
  }).catch(() => null);
  if (!result?.verified) {
    await audit(db, admin, "platform.mfa_failed", { method: "passkey" });
    return failedKey;
  }
  await db.update(platformPasskeys).set({ counter: result.authenticationInfo.newCounter, lastUsedAt: now }).where(eq(platformPasskeys.id, key.id));
  await audit(db, admin, "platform.login", { method: "passkey", name: key.name });
  return { ok: true };
}

// ─────────────────────────── Gerir chaves ───────────────────────────

export type SecurityOverview = {
  passkeys: { id: string; name: string; createdAt: string; lastUsedAt: string | null }[];
  hasTotp: boolean;
  recoveryCodesLeft: number;
};

export async function getSecurityOverview(db: Db, admin: PlatformAdmin): Promise<SecurityOverview> {
  const keys = await db.select().from(platformPasskeys).where(eq(platformPasskeys.userId, admin.userId)).orderBy(platformPasskeys.createdAt);
  return {
    passkeys: keys.map((k) => ({ id: k.id, name: k.name, createdAt: k.createdAt.toISOString(), lastUsedAt: k.lastUsedAt?.toISOString() ?? null })),
    hasTotp: await hasTotp(db, admin.userId),
    recoveryCodesLeft: await remainingRecoveryCodes(db, admin.userId),
  };
}

/** Apagar uma chave (ex.: telemóvel antigo). Não deixa apagar a última forma de entrar. */
export async function removePasskey(db: Db, admin: PlatformAdmin, id: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const total = await countPasskeys(db, admin.userId);
  if (total <= 1 && !(await hasTotp(db, admin.userId))) {
    return { ok: false, message: "É a única forma de entrar. Registe outra chave antes de apagar esta." };
  }
  const removed = await db
    .delete(platformPasskeys)
    .where(and(eq(platformPasskeys.id, id), eq(platformPasskeys.userId, admin.userId)))
    .returning({ name: platformPasskeys.name });
  if (removed.length === 0) return { ok: false, message: "Chave não encontrada." };
  await audit(db, admin, "platform.passkey_removed", { name: removed[0].name });
  return { ok: true };
}
