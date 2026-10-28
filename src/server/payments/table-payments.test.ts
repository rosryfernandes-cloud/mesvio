import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type Db } from "@/server/db/client";
import { establishments, payments } from "@/server/db/schema";
import { DEMO_USERS } from "@/server/db/seed-demo";
import { DEMO_TABLES } from "@/server/pos/mock/demo-data";
import { MockPosAdapter } from "@/server/pos/mock/mock-pos-adapter";
import { placeOrder, type PlaceOrderDeps } from "@/server/orders/place-order";
import { resolveStaffContext } from "@/server/staff/context";
import { setManualAcceptance } from "@/server/staff/staff-service";
import { closeTable, getTableBillByToken, listTables } from "@/server/tables/table-sessions";
import { MockPaymentProvider } from "./provider";
import { ABANDONED_PAYMENT_MS, applicationFee, reconcilePendingPayments, refreshTablePayment, startTablePayment } from "./table-payments";

const T1 = DEMO_TABLES[0];
const T2 = DEMO_TABLES[1];

let db: Db;
let provider: MockPaymentProvider;
let deps: PlaceOrderDeps;
beforeEach(async () => {
  db = await createTestDb();
  provider = new MockPaymentProvider();
  const pos = new MockPosAdapter();
  deps = { db, resolvePos: () => pos };
});

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
    deps,
  );

async function pay(table = T1, approved = true) {
  const r = await startTablePayment(db, table.publicToken, provider);
  if (!r.ok) throw new Error(r.message);
  const [row] = (await db.select().from(payments)).filter((p) => p.id === r.paymentId);
  provider.complete(row.providerRef, "mb_way", approved);
  return { start: r, refreshed: (await refreshTablePayment(db, table.publicToken, r.paymentId, provider))! };
}

describe("comissão da plataforma", () => {
  it("é 1% do valor sem IVA, arredondado ao cêntimo", () => {
    expect(applicationFee(1796)).toBe(18);
    expect(applicationFee(1593)).toBe(16);
    expect(applicationFee(49)).toBe(0);
    expect(applicationFee(50)).toBe(1);
  });
});

describe("pagar a conta da mesa", () => {
  it("paga o que falta; a conta fica paga e o fornecedor retém a comissão", async () => {
    await order();
    const { start, refreshed } = await pay();
    expect(start).toMatchObject({ ok: true, provider: "mock", amountCents: 2050 });
    const [row] = await db.select().from(payments);
    expect(row).toMatchObject({ amountCents: 2050, applicationFeeCents: 18, status: "SUCCEEDED", method: "mb_way" });
    expect(refreshed.status).toBe("SUCCEEDED");
    expect(refreshed.bill).toMatchObject({ totalCents: 2050, paidCents: 2050, dueCents: 0 });
    expect(await startTablePayment(db, T1.publicToken, provider)).toMatchObject({ ok: false, code: "ALREADY_PAID" });
  });

  it("tocar duas vezes em pagar não cria dois pagamentos", async () => {
    await order();
    const a = await startTablePayment(db, T1.publicToken, provider);
    const b = await startTablePayment(db, T1.publicToken, provider);
    expect(a.ok && b.ok && a.paymentId === b.paymentId).toBe(true);
    expect(await db.select().from(payments)).toHaveLength(1);
  });

  it("pagamento recusado não conta e pode tentar-se de novo", async () => {
    await order();
    const { refreshed } = await pay(T1, false);
    expect(refreshed.status).toBe("FAILED");
    expect(refreshed.bill.dueCents).toBe(2050);
    const again = await pay(T1, true);
    expect(again.refreshed.bill.dueCents).toBe(0);
  });

  it("pedidos feitos depois de pagar ficam em falta", async () => {
    await order();
    await pay();
    await order();
    const bill = (await getTableBillByToken(db, T1.publicToken))!;
    expect(bill).toMatchObject({ totalCents: 4100, paidCents: 2050, dueCents: 2050 });
    const { start } = await pay();
    expect(start.amountCents).toBe(2050);
  });

  it("não deixa pagar com pedidos por confirmar", async () => {
    const staff = (await resolveStaffContext(db, DEMO_USERS[1].userId))!;
    await setManualAcceptance(db, staff, true);
    await order();
    expect(await startTablePayment(db, T1.publicToken, provider)).toMatchObject({ ok: false, code: "PENDING_ORDERS" });
  });

  it("recusa quando não há nada para pagar ou o restaurante não aceita pagamentos", async () => {
    expect(await startTablePayment(db, T1.publicToken, provider)).toMatchObject({ code: "NOTHING_TO_PAY" });
    await order();
    await db.update(establishments).set({ paymentsEnabled: false });
    expect(await startTablePayment(db, T1.publicToken, provider)).toMatchObject({ code: "PAYMENTS_DISABLED" });
    expect(await startTablePayment(db, "AAAAAAAAAAAAAAAAAAAAAA", provider)).toMatchObject({ code: "TABLE_NOT_FOUND" });
  });

  it("um pagamento de uma mesa não pode ser consultado por outra", async () => {
    await order();
    const r = await startTablePayment(db, T1.publicToken, provider);
    if (!r.ok) throw new Error();
    expect(await refreshTablePayment(db, T2.publicToken, r.paymentId, provider)).toBeNull();
  });

  it("o painel vê a mesa paga; ao fechar, os próximos clientes começam do zero", async () => {
    await order();
    await pay();
    const staff = (await resolveStaffContext(db, DEMO_USERS[2].userId))!;
    const mesa1 = (await listTables(db, staff)).find((t) => t.label === "Mesa 1")!;
    expect(mesa1.bill).toMatchObject({ paidCents: 2050, dueCents: 0 });
    expect(await closeTable(db, staff, T1.id)).toMatchObject({ ok: true });
    expect(await getTableBillByToken(db, T1.publicToken)).toMatchObject({ openedAt: null, paidCents: 0, dueCents: 0 });
  });

  it("um pagamento abandonado é cancelado aos 15 min e a mesa pode então ser fechada", async () => {
    await order();
    await startTablePayment(db, T1.publicToken, provider);
    const staff = (await resolveStaffContext(db, DEMO_USERS[2].userId))!;
    expect(await closeTable(db, staff, T1.id)).toMatchObject({ ok: false, code: "PENDING_PAYMENT" });
    // Ainda dentro do prazo: continua pendente.
    expect(await reconcilePendingPayments(db, provider, new Date(Date.now() + 60_000))).toMatchObject({ cancelled: 0 });
    const later = new Date(Date.now() + ABANDONED_PAYMENT_MS + 60_000);
    expect(await reconcilePendingPayments(db, provider, later)).toMatchObject({ cancelled: 1 });
    expect((await db.select().from(payments))[0].status).toBe("CANCELLED");
    expect(await closeTable(db, staff, T1.id)).toMatchObject({ ok: true });
  });

  it("dois telemóveis a pagar ao mesmo tempo ficam com um só pagamento", async () => {
    await order();
    const [a, b] = await Promise.all([
      startTablePayment(db, T1.publicToken, provider),
      startTablePayment(db, T1.publicToken, provider),
    ]);
    expect(a.ok && b.ok && a.paymentId === b.paymentId).toBe(true);
    expect(await db.select().from(payments)).toHaveLength(1);
  });
});

describe("gorjeta e aviso no painel", () => {
  it("a gorjeta soma-se ao cobrado, não paga comissão e a conta fica paga (sem 'pago a mais')", async () => {
    await order();
    const r = await startTablePayment(db, T1.publicToken, provider, new Date(), { tipCents: 205 });
    expect(r).toMatchObject({ ok: true, amountCents: 2255 });
    const [row] = await db.select().from(payments);
    expect(row).toMatchObject({ amountCents: 2255, tipCents: 205, applicationFeeCents: 18 });
    provider.complete(row.providerRef, "apple_pay", true);
    const refreshed = (await refreshTablePayment(db, T1.publicToken, (r as { paymentId: string }).paymentId, provider))!;
    expect(refreshed.bill).toMatchObject({ totalCents: 2050, paidCents: 2050, dueCents: 0, overpaidCents: 0, tipCents: 205 });
  });

  it("recusa gorjetas negativas ou acima de 30% da conta", async () => {
    await order();
    expect(await startTablePayment(db, T1.publicToken, provider, new Date(), { tipCents: -1 })).toMatchObject({ ok: false, code: "INVALID_TIP" });
    expect(await startTablePayment(db, T1.publicToken, provider, new Date(), { tipCents: 616 })).toMatchObject({ ok: false, code: "INVALID_TIP" });
    expect(await startTablePayment(db, T1.publicToken, provider, new Date(), { tipCents: 615 })).toMatchObject({ ok: true });
  });

  it("mudar a gorjeta antes de pagar troca o pagamento pendente (só um ativo)", async () => {
    await order();
    const a = await startTablePayment(db, T1.publicToken, provider, new Date(), { tipCents: 0 });
    const b = await startTablePayment(db, T1.publicToken, provider, new Date(), { tipCents: 103 });
    expect(a.ok && b.ok && a.paymentId !== b.paymentId).toBe(true);
    const rows = await db.select().from(payments);
    expect(rows.filter((p) => p.status === "PENDING")).toHaveLength(1);
  });

  it("quando a mesa paga, o painel recebe o aviso e o 'Pedir a conta' fica resolvido", async () => {
    await order();
    const staff = (await resolveStaffContext(db, DEMO_USERS[0].userId))!;
    const { createServiceRequest } = await import("@/server/tables/service-requests");
    const { getBoard } = await import("@/server/staff/staff-service");
    await createServiceRequest(db, T1.publicToken, { kind: "bill", detail: "card" }, { ipHash: "x" });
    expect((await getBoard(db, staff)).calls.map((c) => c.kind)).toEqual(["bill"]);

    const r = await startTablePayment(db, T1.publicToken, provider, new Date(), { tipCents: 100 });
    const [row] = await db.select().from(payments);
    provider.complete(row.providerRef, "mb_way", true);
    await refreshTablePayment(db, T1.publicToken, (r as { paymentId: string }).paymentId, provider);
    // Repetir a verificação (webhook + cliente) não duplica o aviso.
    await refreshTablePayment(db, T1.publicToken, (r as { paymentId: string }).paymentId, provider);

    const calls = (await getBoard(db, staff)).calls;
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ kind: "paid", tableLabel: T1.label, paidCents: 2150, tipCents: 100, dueCents: 0 });
    // O cliente não vê o aviso como uma chamada dele.
    const { getTableCalls } = await import("@/server/tables/service-requests");
    expect(await getTableCalls(db, T1.publicToken)).toEqual([]);
    expect((await listTables(db, staff)).find((t) => t.label === T1.label)!.calls).toEqual(["paid"]);
  });
});
