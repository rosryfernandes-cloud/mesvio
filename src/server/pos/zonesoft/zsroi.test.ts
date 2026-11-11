import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type Db } from "@/server/db/client";
import { orders, posIntegrations } from "@/server/db/schema";
import { DEMO_USERS } from "@/server/db/seed-demo";
import { DEMO_PRODUCTS, DEMO_TABLES } from "@/server/pos/mock/demo-data";
import { MockPosAdapter } from "@/server/pos/mock/mock-pos-adapter";
import { MesvioMenuAdapter } from "@/server/pos/mesvio/mesvio-menu-adapter";
import { placeOrder } from "@/server/orders/place-order";
import { resolveStaffContext, type StaffContext } from "@/server/staff/context";
import { issueToken, signRequest, verifyToken } from "./zsroi-auth";
import { parseZsroiMenu } from "./zsroi-menu";
import { linkZoneSoft, zsroiLogin, zsroiOrderStatus, zsroiReceiveMenu } from "./zsroi-service";

/** O exemplo oficial (example_menu.txt do portal), resumido a dois dias de horário. */
const EXAMPLE_MENU = {
  families: [{ name: "HAMBURGUER", subfamilies: [{ name: "HAMBURGUER", products: ["1978"] }] }],
  products: [
    {
      id: "1978",
      name: "Menu Portuguesa",
      price: 800,
      tax_rate: "13",
      image_url: "https://cdn1.ZoneSoft.org/repo/images/x/produtos/y.jpeg",
      description: "Menu portuguesa estrelado.",
      attributes_groups: ["1978_2", "1978_3", "1978_1"],
      availability: [
        { enabled: true, time_periods: [{ start_time: "09:00", end_time: "23:00" }], day_of_week: "monday" },
        { enabled: true, time_periods: [{ start_time: "07:00", end_time: "23:00" }], day_of_week: "tuesday" },
      ],
    },
  ],
  attribute_groups: [
    { id: "1978_2", name: "Acompanhamento", min: 1, max: 1, attributes: ["1978_2_1908", "1978_2_170"] },
    { id: "1978_3", name: "Bebida", min: 1, max: 1, attributes: ["1978_3_399", "1978_3_390"] },
    { id: "1978_1", name: "Menu Portuguesa", min: 1, max: 1, attributes: ["1978_1_1976"] },
  ],
  attributes: [
    { id: "1978_2_1908", name: "ARROZ THAI", selected_by_default: "false", price_impact: "0.00", tax_rate: "13", attribute_groups: [] },
    { id: "1978_2_170", name: "BATATA RODELA", selected_by_default: "false", price_impact: "0.00", tax_rate: "13", attribute_groups: [] },
    { id: "1978_3_399", name: "FANTA ANANAS", selected_by_default: "false", price_impact: "0.00", tax_rate: "23", attribute_groups: [] },
    { id: "1978_3_390", name: "FANTA LARANJA", selected_by_default: "false", price_impact: "1.50", tax_rate: "23", attribute_groups: [], packaging: "1991" },
    { id: "1978_1_1976", name: "CHAMPIGNON", selected_by_default: "false", price_impact: "0.00", tax_rate: "13", attribute_groups: [] },
  ],
  packagings: [{ id: "1991", reference_name: "Deposit Return System (DRS)", price: 10 }],
};

const CREDS = { serial: "D_TESTE01", storeId: "59", appKey: "chave-do-cliente-123", appSecret: "segredo-do-cliente-456" };
const MESA = DEMO_TABLES.find((t) => t.orderingMode === "pay_later")!;

let db: Db;
let owner: StaffContext;

beforeEach(async () => {
  db = await createTestDb();
  owner = (await resolveStaffContext(db, DEMO_USERS[0].userId))!;
});

const link = () => linkZoneSoft(db, "admin-teste", owner.establishmentId, CREDS);
const claims = () => ({ establishmentId: owner.establishmentId, organizationId: owner.organizationId });
const storedCatalog = () => new MesvioMenuAdapter(owner.establishmentId, async () => db).fetchCatalog();

describe("ZSROI: ementa", () => {
  it("lê o exemplo oficial: subfamília como categoria, família como separador, opções e IVA", () => {
    const r = parseZsroiMenu(EXAMPLE_MENU);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.catalog.categories).toEqual([{ posCategoryRef: "zs:hamburguer/hamburguer", name: "HAMBURGUER", sortOrder: 0, section: "HAMBURGUER" }]);
    const p = r.catalog.products[0];
    expect(p).toMatchObject({ posProductRef: "1978", priceCents: 800, vatRateBps: 1300, available: true });
    expect(p.modifierGroups.map((g) => [g.name, g.kind, g.minSelect, g.maxSelect])).toEqual([
      ["Acompanhamento", "variant", 1, 1],
      ["Bebida", "variant", 1, 1],
      ["Menu Portuguesa", "variant", 1, 1],
    ]);
    expect(p.modifierGroups[1].modifiers.find((m) => m.posModifierRef === "1978_3_390")!.priceDeltaCents).toBe(150);
  });

  it("recusa uma ementa sem famílias, com o erro no formato do manual", () => {
    const r = parseZsroiMenu({ products: [] });
    expect(r).toMatchObject({ ok: false });
    expect((r as { error: string }).error).toMatch(/families/);
  });
});

describe("ZSROI: login e token", () => {
  it("só entra com as chaves do cliente ligado; o token identifica o restaurante", async () => {
    expect(await zsroiLogin(db, { app_store_username: CREDS.appKey, app_store_secret: CREDS.appSecret })).toEqual({ ok: false, status: 401 });
    expect(await link()).toEqual({ ok: true });
    expect(await zsroiLogin(db, { app_store_username: CREDS.appKey, app_store_secret: "errado-errado" })).toEqual({ ok: false, status: 401 });
    expect(await zsroiLogin(db, {})).toEqual({ ok: false, status: 400 });
    const ok = await zsroiLogin(db, { app_store_username: CREDS.appKey, app_store_secret: CREDS.appSecret });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(verifyToken(ok.accessToken)).toEqual(claims());
    expect(verifyToken(`Bearer ${ok.accessToken}`)).toEqual(claims());
    // As credenciais ficam cifradas na BD.
    const [row] = await db.select().from(posIntegrations).where(eq(posIntegrations.establishmentId, owner.establishmentId));
    expect(row.provider).toBe("zonesoft");
    expect(row.credentialsCiphertext).not.toContain(CREDS.appSecret);
  });

  it("recusa tokens alterados ou expirados", () => {
    const { accessToken } = issueToken(claims(), new Date("2026-01-01"));
    expect(verifyToken(accessToken, new Date("2026-01-02"))).toEqual(claims());
    expect(verifyToken(accessToken, new Date("2026-03-01"))).toBeNull();
    expect(verifyToken(accessToken.slice(0, -2) + "xx", new Date("2026-01-02"))).toBeNull();
    expect(verifyToken("qualquer-coisa")).toBeNull();
    expect(verifyToken(null)).toBeNull();
  });

  it("assina os pedidos para a ZSROI como o manual (HMAC-SHA256 do corpo, hex)", () => {
    expect(signRequest("{}", "segredo")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("valida o formulário da Central", async () => {
    expect(await linkZoneSoft(db, "admin-teste", owner.establishmentId, { serial: "" })).toMatchObject({ ok: false, code: "INVALID" });
    expect(await linkZoneSoft(db, "admin-teste", randomUUID(), CREDS)).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });
});

describe("ZSROI: sincronizar a ementa", () => {
  it("guarda a ementa da ZoneSoft; ressincronizar atualiza sem duplicar e tira o que saiu", async () => {
    await link();
    expect(await zsroiReceiveMenu(db, claims(), EXAMPLE_MENU)).toMatchObject({ ok: true, products: 1 });
    let catalog = await storedCatalog();
    expect(catalog.products).toHaveLength(1);
    expect(catalog.products[0]).toMatchObject({ posProductRef: "1978", name: "Menu Portuguesa", priceCents: 800, available: true });
    expect(catalog.products[0].modifierGroups).toHaveLength(3);
    // Os pratos antigos do restaurante (do MockPOS de demonstração) não aparecem.
    expect(catalog.products.some((p) => DEMO_PRODUCTS.some((d) => d.posProductRef === p.posProductRef))).toBe(false);

    const newMenu = {
      ...EXAMPLE_MENU,
      families: [{ name: "BEBIDAS", subfamilies: [{ name: "Sumos", products: ["2001"] }] }],
      products: [{ id: "2001", name: "Sumo de laranja", price: 350, tax_rate: "23" }],
    };
    expect(await zsroiReceiveMenu(db, claims(), newMenu)).toMatchObject({ ok: true, products: 1, hidden: 1 });
    catalog = await storedCatalog();
    expect(catalog.categories.map((c) => c.name)).toEqual(["Sumos"]);
    expect(catalog.products.map((p) => [p.posProductRef, p.available])).toEqual([["2001", true]]);

    // Voltar a mandar o menu antigo reaproveita o prato (mesma referência), sem duplicar.
    await zsroiReceiveMenu(db, claims(), EXAMPLE_MENU);
    catalog = await storedCatalog();
    expect(catalog.products.filter((p) => p.posProductRef === "1978")).toHaveLength(1);
    expect(catalog.products.find((p) => p.posProductRef === "1978")!.modifierGroups).toHaveLength(3);
  });

  it("recusa a ementa se o restaurante já não estiver na ZoneSoft", async () => {
    expect(await zsroiReceiveMenu(db, claims(), EXAMPLE_MENU)).toMatchObject({ ok: false, status: 404 });
  });
});

describe("ZSROI: estado dos pedidos", () => {
  it("aceita, marca pronto e não volta atrás", async () => {
    const mock = new MockPosAdapter();
    const placed = await placeOrder(
      { tableToken: MESA.publicToken, idempotencyKey: randomUUID(), lines: [{ productRef: DEMO_PRODUCTS.find((p) => p.modifierGroups.length === 0)!.posProductRef, quantity: 1 }] },
      { clientIpHash: randomUUID() },
      { db, resolvePos: () => mock, now: () => new Date() },
    );
    expect(placed.ok).toBe(true);
    const orderId = (placed as { order: { id: string } }).order.id;
    await db.update(orders).set({ status: "SUBMITTED" }).where(eq(orders.id, orderId));
    await link();

    expect(await zsroiOrderStatus(db, claims(), { order_id: orderId, status: "accept", estimated_time: 600 })).toEqual({ ok: true, changed: true });
    expect(await zsroiOrderStatus(db, claims(), { order_id: orderId, status: "ready" })).toEqual({ ok: true, changed: true });
    // Um "accept" atrasado não desfaz o "ready"; "remind" não muda nada.
    expect(await zsroiOrderStatus(db, claims(), { order_id: orderId, status: "accept" })).toEqual({ ok: true, changed: false });
    expect(await zsroiOrderStatus(db, claims(), { order_id: orderId, status: "remind" })).toEqual({ ok: true, changed: false });
    const [o] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, orderId));
    expect(o.status).toBe("SERVED");

    expect(await zsroiOrderStatus(db, claims(), { order_id: randomUUID(), status: "accept" })).toMatchObject({ ok: false, status: 404 });
    expect(await zsroiOrderStatus(db, claims(), { order_id: "123123", status: "accept" })).toMatchObject({ ok: false, status: 404 });
    expect(await zsroiOrderStatus(db, claims(), { order_id: orderId, status: "voar" })).toMatchObject({ ok: false, status: 400 });
  });
});
