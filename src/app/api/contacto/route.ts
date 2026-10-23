import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { createDemoRequest } from "@/server/contact/demo-requests";
import { clientIpFromHeaders, hashClientIp } from "@/server/security/rate-limit";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/** Formulário "Pedir demonstração" da landing page. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const result = await createDemoRequest(await getDb(), body, { ipHash: hashClientIp(clientIpFromHeaders(request.headers)) });
  if (result.ok) return NextResponse.json({ ok: true }, { status: 201, headers: NO_STORE });
  if (result.code === "RATE_LIMITED") {
    return NextResponse.json(
      { code: result.code, message: "Recebemos vários pedidos seguidos. Tenta de novo mais tarde." },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(result.retryAfterSeconds) } },
    );
  }
  return NextResponse.json({ code: result.code, message: result.message }, { status: 400, headers: NO_STORE });
}
