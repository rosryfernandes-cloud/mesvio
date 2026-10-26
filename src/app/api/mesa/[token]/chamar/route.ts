import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { clientIpFromHeaders, hashClientIp } from "@/server/security/rate-limit";
import { createServiceRequest, getTableCalls } from "@/server/tables/service-requests";

export const dynamic = "force-dynamic";

const STATUS = { INVALID_INPUT: 400, TABLE_NOT_FOUND: 404, NOT_ALLOWED: 409, RATE_LIMITED: 429 } as const;
const noStore = { "Cache-Control": "no-store" };

/** Chamadas abertas da mesa ("Chamado" / "A caminho"), para quem tem o QR/NFC. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const calls = await getTableCalls(await getDb(), token);
  if (!calls) return NextResponse.json({ message: "Mesa não encontrada." }, { status: 404 });
  return NextResponse.json({ calls }, { headers: noStore });
}

/** Pedir a conta ({ kind: "bill", detail: "card" | "cash" }) ou chamar um empregado ({ kind: "waiter", detail }). */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await request.json().catch(() => null);
  const r = await createServiceRequest(await getDb(), token, body, { ipHash: hashClientIp(clientIpFromHeaders(request.headers)) });
  if (!r.ok) {
    const headers: Record<string, string> = { ...noStore };
    if (r.retryAfterSeconds) headers["Retry-After"] = String(r.retryAfterSeconds);
    return NextResponse.json({ code: r.code, message: r.message }, { status: STATUS[r.code], headers });
  }
  return NextResponse.json({ calls: r.calls }, { status: 201, headers: noStore });
}
