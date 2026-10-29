import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { submitReview } from "@/server/reviews/reviews";
import { clientIpFromHeaders, hashClientIp } from "@/server/security/rate-limit";

export const dynamic = "force-dynamic";

const STATUS = { INVALID_INPUT: 400, TABLE_NOT_FOUND: 404, NOT_ALLOWED: 409, RATE_LIMITED: 429 } as const;

/** Avaliação do cliente depois de pagar a conta ({ stars: 1–5, comment? }). */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await request.json().catch(() => null);
  const r = await submitReview(await getDb(), token, body, { ipHash: hashClientIp(clientIpFromHeaders(request.headers)) });
  if (!r.ok) return NextResponse.json({ code: r.code, message: r.message }, { status: STATUS[r.code] });
  return NextResponse.json({ ok: true }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
