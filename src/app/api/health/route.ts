import { NextResponse } from "next/server";
import { getDemoPosAdapter } from "@/server/pos/registry";

export const dynamic = "force-dynamic";

export async function GET() {
  const pos = await getDemoPosAdapter().healthCheck();
  return NextResponse.json({ status: "ok", time: new Date().toISOString(), pos }, { headers: { "Cache-Control": "no-store" } });
}
