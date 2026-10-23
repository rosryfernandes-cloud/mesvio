import { randomBytes } from "node:crypto";

/**
 * Tokens públicos de mesa: 16 bytes aleatórios (128 bits) em base64url → 22 caracteres.
 * Não são sequenciais nem derivados de IDs; podem ser revogados (regenerados) a qualquer momento.
 */
export const TABLE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;

export function generateTableToken(): string {
  return randomBytes(16).toString("base64url");
}

/** Validação sintática barata antes de qualquer acesso à base de dados (anti-enumeração/ruído). */
export function isWellFormedTableToken(token: unknown): token is string {
  return typeof token === "string" && TABLE_TOKEN_PATTERN.test(token);
}

/** URL pública gravada no QR Code e na etiqueta NFC. */
export function tableUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/m/${token}`;
}
