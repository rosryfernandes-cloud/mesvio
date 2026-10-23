import { getDb } from "@/server/db/client";
import { guardStaff, json } from "@/server/staff/http";
import { listTables } from "@/server/tables/table-sessions";
import { getPaymentsEnabled } from "@/server/staff/staff-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ctx = await guardStaff(request, { mutating: false, permission: "orders.act" });
  if (ctx instanceof Response) return ctx;
  const db = await getDb();
  return json({ tables: await listTables(db, ctx), paymentsEnabled: await getPaymentsEnabled(db, ctx) });
}
