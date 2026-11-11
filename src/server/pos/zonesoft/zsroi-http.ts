import "server-only";
import { NextResponse } from "next/server";
import { verifyToken, type ZsroiTokenClaims } from "./zsroi-auth";

/** Respostas dos endpoints que a ZoneSoft chama (sem cache). */
const HEADERS = { "Cache-Control": "no-store" };
export const zsJson = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: HEADERS });
export const zsNoContent = () => new NextResponse(null, { status: 204, headers: HEADERS });

/** Limite do corpo: uma ementa grande tem algumas centenas de KB. */
const MAX_BODY_BYTES = 5 * 1024 * 1024;

export async function readJson(request: Request): Promise<{ ok: true; body: unknown } | { ok: false; response: Response }> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) return { ok: false, response: zsJson({ error: "Payload too large" }, 413) };
  const text = await request.text().catch(() => "");
  if (text.length > MAX_BODY_BYTES) return { ok: false, response: zsJson({ error: "Payload too large" }, 413) };
  try {
    return { ok: true, body: text ? JSON.parse(text) : {} };
  } catch {
    return { ok: false, response: zsJson({ error: "Invalid JSON" }, 400) };
  }
}

/** Token do header Authorization (emitido pelo nosso endpoint de login). */
export function authorize(request: Request): ZsroiTokenClaims | Response {
  return verifyToken(request.headers.get("authorization")) ?? zsJson({ error: "Unauthorized" }, 401);
}
