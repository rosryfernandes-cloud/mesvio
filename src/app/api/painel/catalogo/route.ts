import { getDb } from "@/server/db/client";
import { guardStaff, json } from "@/server/staff/http";
import { getStaffCatalog } from "@/server/staff/staff-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ctx = await guardStaff(request, { mutating: false });
  if (ctx instanceof Response) return ctx;
  return json({ sections: await getStaffCatalog(await getDb(), ctx) });
}
