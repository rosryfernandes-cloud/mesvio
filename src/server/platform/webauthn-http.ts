import "server-only";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { decodeSigned, encodeSigned } from "@/server/staff/session";
import type { RelyingParty } from "./passkeys";

/**
 * Desafio do Face ID / Touch ID entre o pedido das opções e a resposta do aparelho: num cookie
 * assinado de 5 minutos, ligado ao administrador e ao tipo de operação (registo ou entrada).
 */
const COOKIE = "mesvio_webauthn";
const TTL_MS = 5 * 60_000;

type Kind = "reg" | "auth";

export function setChallenge(res: NextResponse, userId: string, kind: Kind, challenge: string) {
  res.cookies.set(COOKIE, encodeSigned({ u: userId, k: kind, c: challenge }, Date.now() + TTL_MS), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/api/central/2fa",
    maxAge: TTL_MS / 1000,
  });
}

/** Lê o desafio (uma vez: quem chama apaga-o com `clearChallenge`). */
export async function readChallenge(userId: string, kind: Kind): Promise<string | null> {
  const data = decodeSigned((await cookies()).get(COOKIE)?.value);
  return data?.u === userId && data.k === kind && typeof data.c === "string" ? data.c : null;
}

export function clearChallenge(res: NextResponse) {
  res.cookies.set(COOKIE, "", { path: "/api/central/2fa", maxAge: 0 });
}

/**
 * A chave fica ligada ao endereço por onde o painel foi aberto. As rotas só chegam aqui depois de
 * `isSameOrigin` (o Origin do pedido é o próprio site).
 */
export function relyingParty(request: Request): RelyingParty {
  const origin = request.headers.get("origin")!;
  return { origin, rpID: new URL(origin).hostname };
}
