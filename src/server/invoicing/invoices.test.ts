import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type Db } from "@/server/db/client";
import { establishments, payments } from "@/server/db/schema";
import { DEMO_USERS } from "@/server/db/seed-demo";
import { DEMO_TABLES } from "@/server/pos/mock/demo-data";
import { MockPosAdapter } from "@/server/pos/mock/mock-pos-adapter";
import { placeOrder } from "@/server/orders/place-order";
import { MockPaymentProvider } from "@/server/payments/provider";
import { refreshTablePayment, startTablePayment } from "@/server/payments/table-payments";
import { resolveStaffContext, type StaffContext } from "@/server/staff/context";
import { getTableBillByToken } from "@/server/tables/table-sessions";
import { getInvoicingSettings, invoiceRequestSchema, issuePendingInvoices, saveInvoicingSettings } from "./invoices";

const T1 = DEMO_TABLES[0];
const T2 = DEMO_TABLES[1];
let db: Db;
let owner: StaffContext;
let provider: MockPaymentProvider;
const pos = new MockPosAdapter();

beforeEach(async () => {
  db = await createTestDb();
  owner = (await resolveStaffContext(db, DEMO_USERS[0].userId))!;
  provider = new MockPaymentProvider();
});

/** InvoiceXpress de mentira: regista os pedidos e responde como a API. */
function fakeInvoiceXpress({ fail = false } = {}) {
  const requests: { method: string; url: string; body: unknown }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    requests.push({ method: init.method!, url, body: init.body ? JSON.parse(String(init.body)) : undefined });
    if (fail) return new Response("erro", { status: 500 });
    if (url.includes("/invoice_receipts.json")) return Response.json({ invoice_receipt: { id: 42 } });
    if (url.includes("change-state")) return Response.json({ invoice_receipt: { inverted_sequence_number: "FR 2026/17" } });
    return Response.json({});
  }) as unknown as typeof fetch;
  return { fetchImpl, requests };
}

/** Hambúrguer Swara (18,00 €, IVA 13%) + Imperial 0,2 L (2,50 €, IVA 23%) = 20,50 €. */
const order = (table = T1) =>
  placeOrder(
    {
      tableToken: table.publicToken,
      idempotencyKey: randomUUID(),
      lines: [
        { productRef: "F162", quantity: 1, modifierRefs: ["GRP-BATATA-1"] },
        { productRef: "D361", quantity: 1 },
      ],
    },
    { clientIpHash: randomUUID() },
    { db, resolvePos: () => pos },
  );

async function payWithInvoice(invoice: { nif: string | null; email: string } | null, tipCents = 0, table = T1) {
  const r = await startTablePayment(db, table.publicToken, provider, new Date(), { tipCents, invoice });
  if (!r.ok) throw new Error(r.message);
  const [row] = (await db.select().from(payments)).filter((p) => p.id === r.paymentId);
  provider.complete(row.providerRef, "mb_way", true);
  await refreshTablePayment(db, table.publicToken, r.paymentId, provider);
  return r.paymentId;
}

const connect = (fetchImpl: typeof fetch) => saveInvoicingSettings(db, owner, { account: "https://swara.app.invoicexpress.com", apiKey: "chave-de-teste-123" }, { fetchImpl });

describe("fatura por email (InvoiceXpress)", () => {
  it("ligar: confirma a chave, guarda-a cifrada e a conta da mesa passa a oferecer fatura", async () => {
    const ix = fakeInvoiceXpress();
    expect(await connect(ix.fetchImpl)).toEqual({ ok: true });
    expect(ix.requests[0].url).toMatch(/^https:\/\/swara\.app\.invoicexpress\.com\/clients\.json\?per_page=1&api_key=/);
    expect(await getInvoicingSettings(db, owner)).toEqual({ configured: true, account: "swara" });
    const [e] = await db.select({ key: establishments.invoicingApiKeyCiphertext }).from(establishments).where(eq(establishments.id, owner.establishmentId));
    expect(e.key).not.toContain("chave-de-teste-123");
    await order();
    expect((await getTableBillByToken(db, T1.publicToken))!.invoicing).toBe(true);
  });

  it("chave errada não fica guardada", async () => {
    expect(await connect(fakeInvoiceXpress({ fail: true }).fetchImpl)).toMatchObject({ ok: false });
    expect((await getInvoicingSettings(db, owner)).configured).toBe(false);
  });

  it("valida o NIF e o email que o cliente escreve", () => {
    expect(invoiceRequestSchema.safeParse({ nif: "123 456 789", email: "a@b.pt" }).success).toBe(true);
    expect(invoiceRequestSchema.safeParse({ nif: "123456780", email: "a@b.pt" }).success).toBe(false);
    expect(invoiceRequestSchema.parse({ nif: "", email: "A@B.PT" })).toEqual({ nif: null, email: "a@b.pt" });
    expect(invoiceRequestSchema.safeParse({ email: "não é email" }).success).toBe(false);
  });

  it("conta paga de uma vez: emite a fatura-recibo com os artigos e o IVA de cada um, sem a gorjeta, e envia-a", async () => {
    const ix = fakeInvoiceXpress();
    await connect(ix.fetchImpl);
    await order();
    const id = await payWithInvoice({ nif: "123456789", email: "cliente@exemplo.pt" }, 200);
    expect(await issuePendingInvoices(db, { fetchImpl: ix.fetchImpl })).toEqual({ checked: 1, issued: 1 });

    const create = ix.requests.find((r) => r.url.includes("/invoice_receipts.json"))!.body as {
      invoice_receipt: { client: Record<string, string>; items: { name: string; unit_price: string; quantity: string; tax: { name: string } }[] };
    };
    expect(create.invoice_receipt.client).toMatchObject({ fiscal_id: "123456789", email: "cliente@exemplo.pt" });
    expect(create.invoice_receipt.items.map((i) => i.tax.name).sort()).toEqual(["IVA13", "IVA23"]);
    const gross = create.invoice_receipt.items.reduce((n, i) => n + Number(i.unit_price) * Number(i.quantity) * (i.tax.name === "IVA13" ? 1.13 : 1.23), 0);
    expect(Math.round(gross * 100)).toBe(2050); // a gorjeta (2 €) não entra na fatura
    expect(ix.requests.some((r) => r.url.includes("/invoice_receipts/42/change-state.json"))).toBe(true);
    expect(ix.requests.find((r) => r.url.includes("email-document"))!.body).toMatchObject({ message: { client: { email: "cliente@exemplo.pt" } } });

    const [row] = await db.select().from(payments).where(eq(payments.id, id));
    expect(row).toMatchObject({ invoiceStatus: "issued", invoiceRef: "FR 2026/17" });
    // Não volta a emitir.
    expect(await issuePendingInvoices(db, { fetchImpl: ix.fetchImpl })).toEqual({ checked: 0, issued: 0 });
  });

  it("sem pedido de fatura não emite nada; conta paga em várias partes fica para emitir à mão", async () => {
    const ix = fakeInvoiceXpress();
    await connect(ix.fetchImpl);
    await order();
    await payWithInvoice(null);
    expect(await issuePendingInvoices(db, { fetchImpl: ix.fetchImpl })).toEqual({ checked: 0, issued: 0 });

    // Segunda ronda na mesma conta, paga à parte e com fatura: não se adivinha que artigos levar.
    await order();
    const id = await payWithInvoice({ nif: null, email: "x@y.pt" });
    await issuePendingInvoices(db, { fetchImpl: ix.fetchImpl });
    const [row] = await db.select().from(payments).where(eq(payments.id, id));
    expect(row).toMatchObject({ invoiceStatus: "manual" });
    expect(row.invoiceError).toMatch(/várias partes/);
    expect(ix.requests.some((r) => r.url.includes("/invoice_receipts.json"))).toBe(false);
  });

  it("com erro do programa de faturação fica marcado e não repete sozinho", async () => {
    await connect(fakeInvoiceXpress().fetchImpl);
    await order(T2);
    const id = await payWithInvoice({ nif: null, email: "x@y.pt" }, 0, T2);
    const broken = fakeInvoiceXpress({ fail: true });
    await issuePendingInvoices(db, { fetchImpl: broken.fetchImpl });
    const [row] = await db.select().from(payments).where(eq(payments.id, id));
    expect(row.invoiceStatus).toBe("failed");
    expect(await issuePendingInvoices(db, { fetchImpl: broken.fetchImpl })).toEqual({ checked: 0, issued: 0 });
  });
});
