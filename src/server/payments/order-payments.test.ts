import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type Db } from "@/server/db/client";
import { orders, outbox, payments } from "@/server/db/schema";
import { DEMO_USERS } from "@/server/db/seed-demo";
import { DEMO_TABLES } from "@/server/pos/mock/demo-data";
import { MockPosAdapter } from "@/server/pos/mock/mock-pos-adapter";
import { getDemoPosAdapter } from "@/server/pos/registry";
import { placeOrder, type PlaceOrderDeps } from "@/server/orders/place-order";
import { runOutboxOnce } from "@/server/orders/outbox-worker";
import { getOrderForTable } from "@/server/orders/order-view";
import { resolveStaffContext } from "@/server/staff/context";
import { getBoard, setManualAcceptance } from "@/server/staff/staff-service";
import { getTableBillByToken } from "@/server/tables/table-sessions";
import { MockPaymentProvider } from "./provider";
import { startOrderPayment } from "./order-payments";
import { ABANDONED_PAYMENT_MS, reconcilePendingPayments, refreshTablePayment } from "./table-payments";

const SUNBED = DEMO_TABLES.find((t) => t.label === "Cama 1")!;
const SUNBED_2 = DEMO_TABLES.find((t) => t.label === "Cama 2")!;
const TABLE = DEMO_TABLES[0];

let db: Db;
let pos: MockPosAdapter;
let deps: PlaceOrderDeps;
let provider: MockPaymentProvider;
beforeEach(async () => {
  db = await createTestDb();
  pos = new MockPosAdapter();
  deps = { db, resolvePos: () => pos, backoffMs: () => 0, paymentsAvailable: true };
  provider = new MockPaymentProvider();
});

/** Mojito de maracujá (9,50 €) + Imperial (2,50 €) = 12,00 €. */
const order = (spot = SUNBED, lines: unknown[] = [{ productRef: "X524", quantity: 1, modifierRefs: ["GRP-MOJITO-3"] }, { productRef: "D361", quantity: 1 }]) =>
  placeOrder({ tableToken: spot.publicToken, idempotencyKey: randomUUID(), lines }, { clientIpHash: randomUUID() }, deps);

async function placed(spot = SUNBED) {
  const r = await order(spot);
  if (!r.ok) throw new Error(r.message);
  return r.order;
}

async function pay(orderId: string, approved = true, spot = SUNBED) {
  const s = await startOrderPayment(db, spot.publicToken, orderId, provider);
  if (!s.ok) throw new Error(s.message);
  const [row] = await db.select().from(payments).where(eq(payments.id, s.paymentId));
  provider.complete(row.providerRef, "apple_pay", approved);
  return { start: s, refreshed: (await refreshTablePayment(db, spot.publicToken, s.paymentId, provider))! };
}

const statusOf = async (id: string, spot = SUNBED) => (await getOrderForTable(db, spot.publicToken, id))?.status;

describe("espreguiçadeiras: pagar ao pedir", () => {
  it("o pedido espera pelo pagamento e não vai para a cozinha nem aparece ao staff para preparar", async () => {
    const o = await placed();
    expect(o.status).toBe("AWAITING_PAYMENT");
    expect(o.totalCents).toBe(1200);
    expect(await db.select().from(outbox)).toHaveLength(0);
    expect(() => pos.invoiceOrder(o.id)).toThrow();
    const staff = (await resolveStaffContext(db, DEMO_USERS[2].userId))!;
    const onBoard = (await getBoard(db, staff)).orders.find((x) => x.id === o.id);
    expect(onBoard?.status).toBe("AWAITING_PAYMENT"); // visível como "por pagar", não como pedido para preparar
    expect(onBoard?.awaitingApproval).toBe(false);
  });

  it("depois de pago segue para o POS; o pagamento tem a comissão de 1% sem IVA", async () => {
    const o = await placed();
    const { start, refreshed } = await pay(o.id);
    expect(start).toMatchObject({ ok: true, amountCents: 1200 });
    expect(refreshed.status).toBe("SUCCEEDED");
    expect(await statusOf(o.id)).toBe("ACCEPTED");
    expect(getDemoPosAdapter().invoiceOrder(o.id).grossCents).toBe(1200);
    const [p] = await db.select().from(payments);
    // Mojito 950 @23% → 772; Imperial 250 @23% → 203; 975 sem IVA → 1% = 9,75 → 10 cêntimos.
    expect(p).toMatchObject({ orderId: o.id, amountCents: 1200, applicationFeeCents: 10, status: "SUCCEEDED" });
  });

  it("o cliente fecha o browser depois de aprovar: o worker confirma e envia", async () => {
    const o = await placed();
    const s = await startOrderPayment(db, SUNBED.publicToken, o.id, provider);
    if (!s.ok) throw new Error();
    const [row] = await db.select().from(payments);
    provider.complete(row.providerRef, "mb_way");
    const later = new Date(Date.now() + 30_000); // próximo ciclo do worker
    await reconcilePendingPayments(db, provider, later);
    expect(await statusOf(o.id)).toBe("RECEIVED");
    await runOutboxOnce(db, { ...deps, now: () => later });
    expect(await statusOf(o.id)).toBe("ACCEPTED");
    expect(pos.invoiceOrder(o.id).grossCents).toBe(1200);
  });

  it("confirmações repetidas (cliente + worker) só enviam o pedido uma vez", async () => {
    const o = await placed();
    await pay(o.id);
    await reconcilePendingPayments(db, provider, new Date(Date.now() + 30_000));
    await runOutboxOnce(db, deps);
    const jobs = await db.select().from(outbox);
    expect(jobs).toHaveLength(1);
  });

  it("tocar duas vezes em pagar não cria dois pagamentos", async () => {
    const o = await placed();
    const [a, b] = await Promise.all([
      startOrderPayment(db, SUNBED.publicToken, o.id, provider),
      startOrderPayment(db, SUNBED.publicToken, o.id, provider),
    ]);
    expect(a.ok && b.ok && a.paymentId === b.paymentId).toBe(true);
    expect(await db.select().from(payments)).toHaveLength(1);
  });

  it("pagamento recusado: o pedido continua à espera e pode tentar-se de novo", async () => {
    const o = await placed();
    expect((await pay(o.id, false)).refreshed.status).toBe("FAILED");
    expect(await statusOf(o.id)).toBe("AWAITING_PAYMENT");
    expect((await pay(o.id, true)).refreshed.status).toBe("SUCCEEDED");
    expect(await statusOf(o.id)).toBe("ACCEPTED");
  });

  it("pagamento abandonado: aos 15 min cancela-se o pagamento e o pedido, que nunca chega à cozinha", async () => {
    const o = await placed();
    await startOrderPayment(db, SUNBED.publicToken, o.id, provider);
    await reconcilePendingPayments(db, provider, new Date(Date.now() + ABANDONED_PAYMENT_MS + 60_000));
    expect(await statusOf(o.id)).toBe("CANCELLED");
    expect((await db.select().from(payments))[0].status).toBe("CANCELLED");
    expect(await startOrderPayment(db, SUNBED.publicToken, o.id, provider)).toMatchObject({ ok: false, code: "EXPIRED" });
  });

  it("pedido que nunca chegou a ser pago expira aos 15 min", async () => {
    const o = await placed();
    await db.update(orders).set({ createdAt: new Date(Date.now() - ABANDONED_PAYMENT_MS - 60_000) }).where(eq(orders.id, o.id));
    await reconcilePendingPayments(db, provider);
    expect(await statusOf(o.id)).toBe("CANCELLED");
  });

  it("um pedido caro pago não precisa de aprovação (o pagamento prova que é verdadeiro)", async () => {
    const r = await order(SUNBED, [{ productRef: "D441", quantity: 2 }]); // 2 × Moët = 180 €
    if (!r.ok) throw new Error(r.message);
    await pay(r.order.id);
    expect(await statusOf(r.order.id)).toBe("ACCEPTED");
  });

  it("com a aprovação manual ligada, depois de pago espera pelo staff", async () => {
    const manager = (await resolveStaffContext(db, DEMO_USERS[1].userId))!;
    await setManualAcceptance(db, manager, true);
    const o = await placed();
    await pay(o.id);
    expect(await statusOf(o.id)).toBe("RECEIVED");
    const onBoard = (await getBoard(db, manager)).orders.find((x) => x.id === o.id);
    expect(onBoard?.awaitingApproval).toBe(true);
  });

  it("a conta da espreguiçadeira só conta o que foi pago", async () => {
    const a = await placed();
    await pay(a.id);
    await placed(); // segundo pedido, ainda por pagar
    const bill = (await getTableBillByToken(db, SUNBED.publicToken))!;
    expect(bill).toMatchObject({ totalCents: 1200, paidCents: 1200, dueCents: 0 });
    expect(bill.orders.map((o) => o.awaitingPayment)).toEqual([false, true]);
  });

  it("não se paga o pedido de outro lugar, e as mesas continuam a pagar no fim", async () => {
    const o = await placed();
    expect(await startOrderPayment(db, SUNBED_2.publicToken, o.id, provider)).toMatchObject({ code: "NOT_FOUND" });
    const t = await order(TABLE);
    expect(t.ok && t.order.status).toBe("ACCEPTED");
  });

  it("sem fornecedor de pagamentos, a espreguiçadeira não aceita pedidos", async () => {
    const r = await placeOrder(
      { tableToken: SUNBED.publicToken, idempotencyKey: randomUUID(), lines: [{ productRef: "D361", quantity: 1 }] },
      { clientIpHash: "x" },
      { ...deps, paymentsAvailable: false },
    );
    expect(r).toMatchObject({ ok: false, code: "ORDERING_DISABLED" });
  });
});

describe("fatura depois de pagar (camas)", () => {
  it("o cliente pede a fatura depois de pagar; sai com os artigos desse pedido e só uma vez", async () => {
    const { saveInvoicingSettings, requestOrderInvoice, issuePendingInvoices } = await import("@/server/invoicing/invoices");
    const owner = (await resolveStaffContext(db, DEMO_USERS[0].userId))!;
    const bodies: unknown[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      if (init.body) bodies.push(JSON.parse(String(init.body)));
      if (url.includes("/invoice_receipts.json")) return Response.json({ invoice_receipt: { id: 7 } });
      return Response.json({});
    }) as unknown as typeof fetch;
    await saveInvoicingSettings(db, owner, { account: "swara", apiKey: "chave-de-teste-123" }, { fetchImpl });

    const o = await placed();
    // Antes de pagar não há nada para faturar.
    expect(await requestOrderInvoice(db, SUNBED.publicToken, o.id, { email: "c@x.pt" })).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect((await getOrderForTable(db, SUNBED.publicToken, o.id))!.invoice).toBeUndefined();
    await pay(o.id);
    expect((await getOrderForTable(db, SUNBED.publicToken, o.id))!.invoice).toEqual({ status: null });

    expect(await requestOrderInvoice(db, SUNBED.publicToken, o.id, { nif: "123456789", email: "c@x.pt" })).toEqual({ ok: true });
    expect(await requestOrderInvoice(db, SUNBED.publicToken, o.id, { email: "outro@x.pt" })).toMatchObject({ ok: false });
    // Outro lugar não pode pedir a fatura deste pedido.
    expect(await requestOrderInvoice(db, SUNBED_2.publicToken, o.id, { email: "c@x.pt" })).toMatchObject({ ok: false });
    expect((await getOrderForTable(db, SUNBED.publicToken, o.id))!.invoice).toEqual({ status: "pending" });

    expect(await issuePendingInvoices(db, { fetchImpl })).toEqual({ checked: 1, issued: 1 });
    const created = bodies.find((b) => (b as { invoice_receipt?: unknown }).invoice_receipt && (b as { invoice_receipt: { items?: unknown } }).invoice_receipt.items) as {
      invoice_receipt: { client: { fiscal_id: string }; items: { quantity: string }[] };
    };
    expect(created.invoice_receipt.client.fiscal_id).toBe("123456789");
    expect(created.invoice_receipt.items).toHaveLength(2);
    expect((await getOrderForTable(db, SUNBED.publicToken, o.id))!.invoice).toEqual({ status: "issued" });
  });
});
