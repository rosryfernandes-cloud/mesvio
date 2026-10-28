import { getDb } from "@/server/db/client";
import { guardStaff, json } from "@/server/staff/http";
import { listTables } from "@/server/tables/table-sessions";
import { getPaymentsSetting } from "@/server/staff/staff-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ctx = await guardStaff(request, { mutating: false, permission: "orders.act" });
  if (ctx instanceof Response) return ctx;
  const db = await getDb();
  const payments = await getPaymentsSetting(db, ctx);
  return json({ tables: await listTables(db, ctx), paymentsEnabled: payments.enabled, paymentsInPlan: payments.planAllows });
}
