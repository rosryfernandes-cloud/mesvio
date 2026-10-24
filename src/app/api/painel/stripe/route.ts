import { getDb } from "@/server/db/client";
import { guardStaff, json } from "@/server/staff/http";
import { getConnectStatus } from "@/server/payments/stripe-connect";

export const dynamic = "force-dynamic";

/** Estado da conta Stripe do restaurante (dono/gerente veem; só o dono a liga). */
export async function GET(request: Request) {
  const ctx = await guardStaff(request, { mutating: false, permission: "settings.edit" });
  if (ctx instanceof Response) return ctx;
  try {
    const status = await getConnectStatus(await getDb(), ctx);
    return json({ ...status, canConnect: ctx.role === "owner" });
  } catch (err) {
    console.error("[stripe] estado da conta falhou", err);
    return json({ message: "Não foi possível falar com a Stripe." }, 502);
  }
}
