import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { placeOrder, startOfLocalDay, type PlaceOrderDeps } from "./place-order";
import { getOrderForTable } from "./order-view";
import { runOutboxOnce } from "./outbox-worker";
import { createTestDb, type Db } from "@/server/db/client";
import { orderEvents, orders, outbox } from "@/server/db/schema";
import { MockPosAdapter, type MockPosOptions } from "@/server/pos/mock/mock-pos-adapter";
import { DEMO_TABLES } from "@/server/pos/mock/demo-data";
import { priceSelection } from "@/lib/order-pricing";

const TOKEN = DEMO_TABLES[2].publicToken; // Mesa 3
const CTX = { clientIpHash: "ip-teste" };

let db: Db;
beforeEach(async () => {
  db = await createTestDb();
});

function setup(posOpts: MockPosOptions = {}, extra: Partial<PlaceOrderDeps> = {}) {
  const pos = new MockPosAdapter(posOpts);
  const deps: PlaceOrderDeps = { db, resolvePos: () => pos, backoffMs: () => 0, ...extra };
  return { pos, deps };
}

const input = (over: Record<string, unknown> = {}) => ({
  tableToken: TOKEN,
  idempotencyKey: randomUUID(),
  lines: [
    { productRef: "F162", quantity: 2, modifierRefs: ["GRP-BATATA-2", "GRP-EXTRAS-HAMB-1"] }, // 2 × Hambúrguer Swara (18,00 + bacon 1,00)
    { productRef: "D361", quantity: 1 }, // Imperial 0,2 L 2,50
  ],
  ...over,
});

describe("priceSelection", () => {
  const plain = { name: "Teste", priceCents: 1300, available: true, modifierGroups: [] as never[] };
  it("exige variantes obrigatórias e respeita o máximo", async () => {
    const catalog = await new MockPosAdapter().fetchCatalog();
    const cha = catalog.products.find((p) => p.posProductRef === "D351")!; // 2 escolhas obrigatórias + 1 extra
    expect(priceSelection(cha, ["GRP-CHA-TEMP-1"]).ok).toBe(false);
    expect(priceSelection(cha, ["GRP-CHA-TEMP-1", "GRP-CHA-TEMP-2", "GRP-CHA-1"]).ok).toBe(false);
    expect(priceSelection(cha, ["GRP-CHA-TEMP-2", "GRP-CHA-8", "GRP-CHA-MEL-1"])).toEqual({
      ok: true,
      unitPriceCents: 350,
      modifierNames: ["Frio", "Frutos vermelhos", "Adoçado com mel"],
    });
  });
  it("rejeita opções desconhecidas ou repetidas", async () => {
    expect(priceSelection(plain, ["MOD-X"]).ok).toBe(false);
    const catalog = await new MockPosAdapter().fetchCatalog();
    const hamburguer = catalog.products.find((p) => p.posProductRef === "F162")!;
    expect(priceSelection(hamburguer, ["GRP-BATATA-1", "GRP-EXTRAS-HAMB-1", "GRP-EXTRAS-HAMB-1"]).ok).toBe(false);
  });
});

describe("placeOrder (Postgres)", () => {
  it("grava o pedido, recalcula preços e envia à mesa certa do POS", async () => {
    const { deps, pos } = setup();
    const r = await placeOrder(input(), CTX, deps);
    if (!r.ok) throw new Error(r.message);
    expect(r.order).toMatchObject({ status: "ACCEPTED", totalCents: 2 * 1900 + 250, tableLabel: "Mesa 3", shortCode: "001" });
    expect(r.order.lines[0]).toMatchObject({ name: "Hambúrguer Swara (180 g)", modifierNames: ["Palito", "Bacon"], lineTotalCents: 3800 });

    const [row] = await db.select().from(orders).where(eq(orders.id, r.order.id));
    expect(row).toMatchObject({ totalGrossCents: 4050, totalNetCents: 3363 + 203, posOrderRef: "MOCK-000001", clientIpHash: "ip-teste" });
    const events = await db.select().from(orderEvents).where(eq(orderEvents.orderId, r.order.id));
    expect(events.map((e) => e.toStatus)).toEqual(["RECEIVED", "SUBMITTING", "ACCEPTED"]);
    expect((await db.select().from(outbox))[0].status).toBe("DONE");
    expect(pos.invoiceOrder(r.order.id).grossCents).toBe(4050);
  });

  it("numera os pedidos do dia por estabelecimento", async () => {
    const { deps } = setup();
    await placeOrder(input(), CTX, deps);
    const r = await placeOrder(input(), CTX, deps);
    expect(r.ok && r.order.shortCode).toBe("002");
  });

  it("ignora preços enviados pelo cliente", async () => {
    const { deps } = setup();
    const r = await placeOrder(input({ lines: [{ productRef: "F137", quantity: 1, unitPriceCents: 1 }] }), CTX, deps);
    expect(r.ok && r.order.totalCents).toBe(2400); // Amêijoas à Bulhão Pato
  });

  it("é idempotente: a mesma chave não cria nem envia um segundo pedido", async () => {
    const { deps } = setup();
    const body = input();
    const [a, b] = await Promise.all([placeOrder(body, CTX, deps), placeOrder(body, CTX, deps)]);
    expect(a.ok && b.ok && a.order.id === b.order.id).toBe(true);
    expect(await db.select().from(orders)).toHaveLength(1);
    expect(await db.select().from(outbox)).toHaveLength(1);
  });

  it("recusa quando o total visto pelo cliente já não corresponde", async () => {
    const { deps } = setup();
    expect(await placeOrder(input({ expectedTotalCents: 100 }), CTX, deps)).toMatchObject({ ok: false, code: "PRICE_CHANGED" });
  });

  it("recusa artigos esgotados, desconhecidos ou sem variante obrigatória", async () => {
    const { deps, pos } = setup();
    pos.setAvailability("F137", false);
    for (const lines of [
      [{ productRef: "F137", quantity: 1 }],
      [{ productRef: "NOPE", quantity: 1 }],
      [{ productRef: "D308", quantity: 1 }], // Coca-Cola sem escolher normal/zero
    ]) {
      expect(await placeOrder(input({ lines }), CTX, deps)).toMatchObject({ ok: false, code: "INVALID_ITEMS" });
    }
    expect(await db.select().from(orders)).toHaveLength(0);
  });

  it("valida a entrada e a mesa", async () => {
    const { deps } = setup();
    expect(await placeOrder(input({ lines: [] }), CTX, deps)).toMatchObject({ code: "INVALID_INPUT" });
    expect(await placeOrder(input({ idempotencyKey: "x" }), CTX, deps)).toMatchObject({ code: "INVALID_INPUT" });
    expect(await placeOrder(input({ lines: [{ productRef: "D301", quantity: 99 }] }), CTX, deps)).toMatchObject({ code: "INVALID_INPUT" });
    expect(await placeOrder(input({ tableToken: "AAAAAAAAAAAAAAAAAAAAAA" }), CTX, deps)).toMatchObject({ code: "TABLE_NOT_FOUND" });
  });

  it("não mostra 'aceite' quando o POS só confirma a receção", async () => {
    const { deps } = setup({ acceptMode: "submit_only" });
    const r = await placeOrder(input(), CTX, deps);
    expect(r.ok && r.order.status).toBe("SUBMITTED");
  });

  it("só devolve o pedido a quem tem o token da mesa", async () => {
    const { deps } = setup();
    const r = await placeOrder(input(), CTX, deps);
    if (!r.ok) throw new Error(r.message);
    expect((await getOrderForTable(db, TOKEN, r.order.id))?.id).toBe(r.order.id);
    expect(await getOrderForTable(db, DEMO_TABLES[0].publicToken, r.order.id)).toBeNull();
    expect(await getOrderForTable(db, TOKEN, "not-a-uuid")).toBeNull();
  });
});

describe("fila de envio ao POS (outbox)", () => {
  it("com o POS em baixo, o pedido fica gravado e é enviado quando o POS volta", async () => {
    let t = new Date("2026-10-22T20:00:00Z");
    const { deps } = setup({ transientFailuresPerOrder: 2 }, { now: () => t, backoffMs: () => 5_000 });

    const r = await placeOrder(input(), CTX, deps);
    if (!r.ok) throw new Error(r.message);
    expect(r.order.status).toBe("FAILED_RETRYING"); // 1.ª tentativa falhou, mas o pedido não se perdeu

    expect(await runOutboxOnce(db, deps)).toBe(0); // ainda dentro do backoff
    t = new Date(t.getTime() + 5_000);
    expect(await runOutboxOnce(db, deps)).toBe(1); // 2.ª tentativa: falha
    t = new Date(t.getTime() + 5_000);
    await runOutboxOnce(db, deps); // 3.ª tentativa: aceite

    const view = await getOrderForTable(db, TOKEN, r.order.id);
    expect(view?.status).toBe("ACCEPTED");
    const [job] = await db.select().from(outbox);
    expect(job).toMatchObject({ status: "DONE", attempts: 3 });
  });

  it("desiste ao fim do máximo de tentativas e marca NEEDS_ATTENTION", async () => {
    let t = new Date("2026-10-22T20:00:00Z");
    const { deps } = setup({ transientFailuresPerOrder: 99 }, { now: () => t, maxAttempts: 3, backoffMs: () => 1_000 });
    const r = await placeOrder(input(), CTX, deps);
    if (!r.ok) throw new Error(r.message);
    for (let i = 0; i < 5; i++) {
      t = new Date(t.getTime() + 1_000);
      await runOutboxOnce(db, deps);
    }
    expect((await getOrderForTable(db, TOKEN, r.order.id))?.status).toBe("NEEDS_ATTENTION");
    expect((await db.select().from(outbox))[0]).toMatchObject({ status: "DEAD", attempts: 3 });
  });

  it("recupera tarefas de um worker que morreu a meio (lease expirado) sem duplicar no POS", async () => {
    let t = new Date("2026-10-22T20:00:00Z");
    const { deps, pos } = setup({}, { now: () => t });
    const r = await placeOrder(input(), CTX, deps);
    if (!r.ok) throw new Error(r.message);
    // Simula: a tarefa foi reclamada e o processo caiu antes de terminar.
    await db.update(outbox).set({ status: "DISPATCHED", availableAt: new Date(t.getTime() + 120_000) });
    await db.update(orders).set({ status: "SUBMITTING" });

    expect(await runOutboxOnce(db, deps)).toBe(0); // lease ainda válido
    t = new Date(t.getTime() + 121_000);
    expect(await runOutboxOnce(db, deps)).toBe(1);
    expect((await getOrderForTable(db, TOKEN, r.order.id))?.status).toBe("ACCEPTED");
    expect(pos.invoiceOrder(r.order.id).posDocumentRef).toBeTruthy(); // um único pedido no POS
  });

  it("trata o POS que não responde como falha temporária (timeout)", async () => {
    const hanging = new MockPosAdapter();
    hanging.submitOrder = () => new Promise(() => {});
    const deps: PlaceOrderDeps = { db, resolvePos: () => hanging, posTimeoutMs: 20 };
    const r = await placeOrder(input(), CTX, deps);
    expect(r.ok && r.order.status).toBe("FAILED_RETRYING");
  });
});

describe("rate limit", () => {
  const tight = { perIp: { limit: 2, windowSeconds: 300 }, perTable: { limit: 3, windowSeconds: 900 } };

  it("trava muitos pedidos do mesmo telemóvel", async () => {
    const { deps } = setup({}, { rateLimits: tight });
    expect((await placeOrder(input(), CTX, deps)).ok).toBe(true);
    expect((await placeOrder(input(), CTX, deps)).ok).toBe(true);
    const r = await placeOrder(input(), CTX, deps);
    expect(r).toMatchObject({ ok: false, code: "RATE_LIMITED" });
    expect(!r.ok && r.code === "RATE_LIMITED" && r.retryAfterSeconds).toBeGreaterThan(0);
    // Outro telemóvel na mesma mesa continua a poder pedir.
    expect((await placeOrder(input(), { clientIpHash: "outro" }, deps)).ok).toBe(true);
  });

  it("trava a mesa inteira acima do limite, mesmo com telemóveis diferentes", async () => {
    const { deps } = setup({}, { rateLimits: tight });
    for (const ip of ["a", "b", "c"]) expect((await placeOrder(input(), { clientIpHash: ip }, deps)).ok).toBe(true);
    expect(await placeOrder(input(), { clientIpHash: "d" }, deps)).toMatchObject({ code: "RATE_LIMITED" });
    // Outra mesa não é afetada.
    expect((await placeOrder(input({ tableToken: DEMO_TABLES[5].publicToken }), { clientIpHash: "e" }, deps)).ok).toBe(true);
  });

  it("repetir o mesmo envio (mesma chave) não gasta o limite da mesa", async () => {
    const { deps } = setup({}, { rateLimits: { ...tight, perIp: { limit: 50, windowSeconds: 300 } } });
    const body = input();
    for (let i = 0; i < 5; i++) expect((await placeOrder(body, CTX, deps)).ok).toBe(true);
    expect((await placeOrder(input(), CTX, deps)).ok).toBe(true);
  });
});

describe("startOfLocalDay", () => {
  it("usa a meia-noite de Lisboa (verão e inverno)", () => {
    // 23:30 UTC no verão já é 00:30 do dia seguinte em Lisboa.
    expect(startOfLocalDay(new Date("2026-07-15T23:30:00Z"), "Europe/Lisbon").toISOString()).toBe("2026-07-15T23:00:00.000Z");
    expect(startOfLocalDay(new Date("2026-07-15T22:30:00Z"), "Europe/Lisbon").toISOString()).toBe("2026-07-14T23:00:00.000Z");
    expect(startOfLocalDay(new Date("2026-12-15T10:00:00Z"), "Europe/Lisbon").toISOString()).toBe("2026-12-15T00:00:00.000Z");
  });
});
