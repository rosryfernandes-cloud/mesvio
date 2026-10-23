import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Códigos de ativação do 2FA (uso único, 48 h): gerados pelo script, entregues fora do email
 * (pessoalmente, telefone, mensagem), e exigidos para configurar o 2FA. Funções puras: usadas
 * pelo servidor e pelo script scripts/admin/administradores.ts.
 */
export const ACTIVATION_TTL_MS = 48 * 3600_000;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem 0/O, 1/I

/** Ex.: "K7QM-W2XP-9RTD" (≈ 60 bits). */
export function generateActivationCode(): string {
  const bytes = randomBytes(12);
  const chars = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}

const normalize = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "");

export function hashActivationCode(code: string): string {
  return createHash("sha256").update(`mesvio-2fa:${normalize(code)}`).digest("hex");
}

export function activationCodeMatches(code: string, storedHash: string | null, expiresAt: Date | null, now = Date.now()): boolean {
  if (!storedHash || !expiresAt || expiresAt.getTime() <= now || normalize(code).length !== 12) return false;
  const given = Buffer.from(hashActivationCode(code));
  const expected = Buffer.from(storedHash);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
