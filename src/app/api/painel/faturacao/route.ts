import { getDb } from "@/server/db/client";
import { guardStaff, json } from "@/server/staff/http";
import { getInvoicingSettings, recentInvoices, removeInvoicingSettings, retryInvoice, saveInvoicingSettings } from "@/server/invoicing/invoices";

export const dynamic = "force-dynamic";

/** Fatura por email: conta InvoiceXpress ligada e últimas faturas (dono/gerente). */
export async function GET(request: Request) {
  const ctx = await guardStaff(request, { mutating: false, permission: "settings.edit" });
  if (ctx instanceof Response) return ctx;
  const db = await getDb();
  const [settings, invoices] = await Promise.all([getInvoicingSettings(db, ctx), recentInvoices(db, ctx)]);
  return json({ ...settings, invoices });
}

/** Ligar ({ account, apiKey }), desligar ({ remove: true }) ou tentar de novo uma fatura ({ retry: paymentId }). */
export async function POST(request: Request) {
  const ctx = await guardStaff(request, { mutating: true, permission: "settings.edit" });
  if (ctx instanceof Response) return ctx;
  const body = (await request.json().catch(() => null)) as { remove?: boolean; retry?: unknown } | null;
  const db = await getDb();
  if (typeof body?.retry === "string") {
    return (await retryInvoice(db, ctx, body.retry)) ? json({ ok: true }) : json({ message: "Esta fatura já não pode ser repetida." }, 409);
  }
  if (body?.remove) {
    await removeInvoicingSettings(db, ctx);
    return json({ ok: true });
  }
  const r = await saveInvoicingSettings(db, ctx, body);
  return r.ok ? json({ ok: true }) : json({ message: r.message }, 400);
}
