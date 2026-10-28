import { getDb } from "@/server/db/client";
import { guardStaff, json } from "@/server/staff/http";
import { getConnectStatus } from "@/server/payments/stripe-connect";
import { resolvePublicBaseUrl } from "@/server/tables/table-qr";

export const dynamic = "force-dynamic";

/** Estado da conta Stripe do restaurante (dono/gerente veem; só o dono a liga). */
export async function GET(request: Request) {
  const ctx = await guardStaff(request, { mutating: false, permission: "settings.edit" });
  if (ctx instanceof Response) return ctx;
  try {
    // O domínio por onde os clientes abrem a ementa (o mesmo dos QR Codes).
    const base = resolvePublicBaseUrl(process.env.NEXT_PUBLIC_APP_URL, request.headers.get("host"), request.headers.get("x-forwarded-proto"));
    const status = await getConnectStatus(await getDb(), ctx, undefined, { domain: new URL(base).hostname });
    return json({ ...status, canConnect: ctx.role === "owner" });
  } catch (err) {
    console.error("[stripe] estado da conta falhou", err);
    return json({ message: "Não foi possível falar com a Stripe." }, 502);
  }
}
