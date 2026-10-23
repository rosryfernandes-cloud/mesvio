import { describe, expect, it } from "vitest";
import { MockPosAdapter } from "./mock-pos-adapter";
import { DEMO_CATEGORIES, DEMO_PRODUCTS, DEMO_TABLES } from "./demo-data";
import { ZoneSoftAdapter } from "../zonesoft/zonesoft-adapter";

const ribeye = (unitPriceCents = 2900) => ({
  externalOrderId: "ord-1",
  posTableRef: "3",
  lines: [{ posProductRef: "F142", quantity: 2, unitPriceCents, modifiers: [] }],
});

describe("MockPOS", () => {
  it("devolve a ementa de demonstração com 10 mesas e 6 espreguiçadeiras", async () => {
    const pos = new MockPosAdapter();
    const catalog = await pos.fetchCatalog();
    expect(catalog.categories.length).toBeGreaterThanOrEqual(5);
    expect(catalog.products.length).toBeGreaterThanOrEqual(20);
    expect(await pos.fetchTables()).toHaveLength(16);
    expect(DEMO_TABLES.filter((t) => t.orderingMode === "pay_later")).toHaveLength(10);
    expect(DEMO_TABLES.filter((t) => t.orderingMode === "pay_first")).toHaveLength(6);
  });

  it("tem dados de demonstração coerentes (refs únicas, preços e IVA válidos)", () => {
    const unique = (xs: string[]) => new Set(xs).size === xs.length;
    expect(unique(DEMO_CATEGORIES.map((c) => c.posCategoryRef))).toBe(true);
    expect(unique(DEMO_PRODUCTS.map((p) => p.posProductRef))).toBe(true);
    const catRefs = new Set(DEMO_CATEGORIES.map((c) => c.posCategoryRef));
    for (const p of DEMO_PRODUCTS) {
      expect(catRefs.has(p.posCategoryRef)).toBe(true);
      expect(Number.isInteger(p.priceCents) && p.priceCents > 0).toBe(true);
      expect([1300, 2300]).toContain(p.vatRateBps);
      expect(unique(p.modifierGroups.flatMap((g) => g.modifiers.map((m) => m.posModifierRef)))).toBe(true);
    }
  });

  it("aceita um pedido válido, incluindo extras", async () => {
    const pos = new MockPosAdapter();
    const res = await pos.submitOrder({
      externalOrderId: "ord-1",
      posTableRef: "3",
      lines: [
        {
          posProductRef: "F162", // Hambúrguer Swara 18,00 € + bacon 1,00 €
          quantity: 1,
          unitPriceCents: 1800 + 100,
          modifiers: [{ posModifierRef: "GRP-BATATA-1" }, { posModifierRef: "GRP-EXTRAS-HAMB-1" }],
        },
      ],
    });
    expect(res).toEqual({ outcome: "accepted", posOrderRef: "MOCK-000001" });
  });

  it("é idempotente pelo id externo do pedido", async () => {
    const pos = new MockPosAdapter();
    const a = await pos.submitOrder(ribeye());
    const b = await pos.submitOrder(ribeye());
    expect(b).toEqual(a);
  });

  it("rejeita preços divergentes (proteção contra adulteração)", async () => {
    const pos = new MockPosAdapter();
    const res = await pos.submitOrder(ribeye(100));
    expect(res.outcome).toBe("rejected");
  });

  it("rejeita artigos esgotados", async () => {
    const pos = new MockPosAdapter();
    pos.setAvailability("F142", false);
    expect((await pos.submitOrder(ribeye())).outcome).toBe("rejected");
  });

  it("simula falhas transitórias para testar reenvios", async () => {
    const pos = new MockPosAdapter({ transientFailuresPerOrder: 2 });
    expect((await pos.submitOrder(ribeye())).outcome).toBe("retryable_error");
    expect((await pos.submitOrder(ribeye())).outcome).toBe("retryable_error");
    expect((await pos.submitOrder(ribeye())).outcome).toBe("accepted");
  });

  it("modo 'submit_only' nunca reporta aceitação", async () => {
    const pos = new MockPosAdapter({ acceptMode: "submit_only" });
    expect((await pos.submitOrder(ribeye())).outcome).toBe("submitted");
  });

  it("emite documentos de venda e notas de crédito para reconciliação", async () => {
    let t = new Date("2026-10-01T12:00:00Z");
    const pos = new MockPosAdapter({ now: () => t });
    await pos.submitOrder(ribeye());
    const doc = pos.invoiceOrder("ord-1");
    expect(doc).toMatchObject({ status: "INVOICED", grossCents: 5800, netCents: 5133 });
    pos.creditDocument(doc.posDocumentRef);
    t = new Date("2026-10-02T00:00:00Z");
    const docs = await pos.fetchSalesDocuments(new Date("2026-10-01"), new Date("2026-11-01"));
    expect(docs).toHaveLength(1);
    expect(docs[0].status).toBe("CREDITED");
  });
});

describe("ZoneSoft (esqueleto)", () => {
  it("não declara nenhuma capacidade nem finge funcionar", async () => {
    const zs = new ZoneSoftAdapter({ establishmentId: "e1", settings: {} });
    expect(Object.values(zs.capabilities).every((v) => v === false)).toBe(true);
    expect((await zs.healthCheck()).ok).toBe(false);
    await expect(zs.fetchCatalog()).rejects.toThrow(/documentação oficial/);
  });
});
