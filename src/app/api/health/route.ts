import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";

export const dynamic = "force-dynamic";

const DB_TIMEOUT_MS = 5000;

/**
 * Para o alerta externo de quebras: 200 se o site e a base de dados respondem, 503 se não.
 * Público, por isso não diz mais do que isto.
 */
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    const db = await getDb();
    await Promise.race([
      db.execute(sql`select 1`),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), DB_TIMEOUT_MS)),
    ]);
    return NextResponse.json({ status: "ok", time: new Date().toISOString() }, { headers });
  } catch (err) {
    console.error("[health] base de dados indisponível", err);
    return NextResponse.json({ status: "error", time: new Date().toISOString() }, { status: 503, headers });
  }
}
