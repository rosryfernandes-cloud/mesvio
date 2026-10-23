import { getDb } from "@/server/db/client";
import { guardStaff, json } from "@/server/staff/http";
import { getBoard } from "@/server/staff/staff-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ctx = await guardStaff(request, { mutating: false });
  if (ctx instanceof Response) return ctx;
  return json(await getBoard(await getDb(), ctx));
}
