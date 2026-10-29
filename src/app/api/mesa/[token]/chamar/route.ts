import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { clientIpFromHeaders, hashClientIp } from "@/server/security/rate-limit";
import { createServiceRequest, getTableCalls } from "@/server/tables/service-requests";
import { getTableBillByToken } from "@/server/tables/table-sessions";
import { queueTableEventByToken } from "@/server/notifications/push";

export const dynamic = "force-dynamic";

const STATUS = { INVALID_INPUT: 400, TABLE_NOT_FOUND: 404, NOT_ALLOWED: 409, RATE_LIMITED: 429 } as const;
const noStore = { "Cache-Control": "no-store" };

/**
 * Chamadas abertas da mesa ("Chamado" / "A caminho"), para quem tem o QR/NFC, e se a conta se
 * pode pagar já pelo telemóvel (o "Pedir a conta" mostra essa opção primeiro).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = await getDb();
  const calls = await getTableCalls(db, token);
  if (!calls) return NextResponse.json({ message: "Mesa não encontrada." }, { status: 404 });
  const bill = await getTableBillByToken(db, token);
  return NextResponse.json({ calls, payInApp: Boolean(bill?.paymentsEnabled && bill.dueCents > 0) }, { headers: noStore });
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
  // Notificação no telemóvel do responsável da mesa (ou da equipa), depois da resposta.
  const { kind, detail } = body as { kind: "bill" | "waiter"; detail: string };
  queueTableEventByToken(token, { kind, detail });
  return NextResponse.json({ calls: r.calls }, { status: 201, headers: noStore });
}
