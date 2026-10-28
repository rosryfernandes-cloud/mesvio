import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type Db } from "@/server/db/client";
import { DEMO_USERS } from "@/server/db/seed-demo";
import { DEMO_PLATFORM_ADMIN } from "@/server/db/seed-demo";
import { DEMO_PRODUCTS, DEMO_TABLES } from "@/server/pos/mock/demo-data";
import { MockPosAdapter } from "@/server/pos/mock/mock-pos-adapter";
import { MesvioMenuAdapter } from "@/server/pos/mesvio/mesvio-menu-adapter";
import type { PosProviderId } from "@/server/pos/types";
import { placeOrder } from "@/server/orders/place-order";
import { findPlatformAdmin } from "@/server/platform/admin-auth";
import { switchToOwnMenu } from "@/server/platform/platform-service";
import { resolveStaffContext, type StaffContext } from "@/server/staff/context";
import { getBoard } from "@/server/staff/staff-service";
import { deleteCategory, deleteProduct, getOwnMenu, move, saveCategory, saveProduct } from "./own-menu";

const MESA = DEMO_TABLES.find((t) => t.orderingMode === "pay_later")!;

let db: Db;
let owner: StaffContext;
const mock = new MockPosAdapter();
const resolvePos = (provider: PosProviderId, establishmentId: string) => (provider === "mesvio" ? new MesvioMenuAdapter(establishmentId, async () => db) : mock);

beforeEach(async () => {
  db = await createTestDb();
  owner = (await resolveStaffContext(db, DEMO_USERS[0].userId))!;
});

const switchDemo = async () => switchToOwnMenu(db, (await findPlatformAdmin(db, DEMO_PLATFORM_ADMIN.userId))!, owner.establishmentId, resolvePos);

describe("ementa própria (sem POS)", () => {
  it("enquanto o restaurante usa o POS, o editor não abre", async () => {
    expect(await getOwnMenu(db, owner)).toBeNull();
    expect(await saveCategory(db, owner, { name: "Entradas" })).toMatchObject({ ok: false, code: "NOT_OWN_MENU" });
  });

  it("passar para sem POS copia a ementa atual, com as mesmas referências (fotos, traduções, esgotados)", async () => {
    const r = await switchDemo();
    expect(r).toMatchObject({ ok: true, products: DEMO_PRODUCTS.length });
    const catalog = await new MesvioMenuAdapter(owner.establishmentId, async () => db).fetchCatalog();
    expect(catalog.products.map((p) => p.posProductRef).sort()).toEqual(DEMO_PRODUCTS.map((p) => p.posProductRef).sort());
    const withOptions = DEMO_PRODUCTS.find((p) => p.modifierGroups.length > 0)!;
    expect(catalog.products.find((p) => p.posProductRef === withOptions.posProductRef)!.modifierGroups).toEqual(withOptions.modifierGroups);
    // Repetir não duplica.
    expect(await switchDemo()).toMatchObject({ ok: true, products: 0 });
  });

  it("criar categoria e prato com opções; aparece na ementa do cliente e pode pedir-se", async () => {
    await switchDemo();
    const cat = await saveCategory(db, owner, { name: "Petiscos", section: "Comida" });
    expect(cat.ok).toBe(true);
    const categoryId = (cat as { value: { id: string } }).value.id;
    const saved = await saveProduct(db, owner, {
      categoryId,
      name: "Pica-pau",
      description: "Novilho, pickles e molho",
      priceCents: 1250,
      vatRateBps: 1300,
      allergens: ["mostarda"],
      groups: [{ name: "Acompanhamento", kind: "variant", modifiers: [{ name: "Batata frita", priceDeltaCents: 0 }, { name: "Pão", priceDeltaCents: 100 }] }],
    });
    expect(saved.ok).toBe(true);
    const menu = (await getOwnMenu(db, owner))!;
    const prod = menu.categories.find((c) => c.name === "Petiscos")!.products[0];
    expect(prod).toMatchObject({ name: "Pica-pau", priceCents: 1250, allergens: ["mostarda"], groups: [{ name: "Acompanhamento", kind: "variant" }] });

    const catalog = await new MesvioMenuAdapter(owner.establishmentId, async () => db).fetchCatalog();
    const p = catalog.products.find((x) => x.posProductRef === prod.ref)!;
    const pao = p.modifierGroups[0].modifiers.find((m) => m.name === "Pão")!;
    const order = await placeOrder(
      { tableToken: MESA.publicToken, idempotencyKey: randomUUID(), lines: [{ productRef: prod.ref, quantity: 2, modifierRefs: [pao.posModifierRef] }] },
      { clientIpHash: randomUUID() },
      { db, resolvePos, now: () => new Date() },
    );
    expect(order).toMatchObject({ ok: true, order: { totalCents: 2700 } });
    // Sem POS do outro lado: o pedido fica logo aceite (e sai em talão na cozinha).
    expect((order as { order: { status: string } }).order.status).toBe("ACCEPTED");
  });

  it("editar as opções mantém as que ficam (e as referências) e apaga as que saem", async () => {
    await switchDemo();
    const categoryId = (await getOwnMenu(db, owner))!.categories[0].id;
    const created = await saveProduct(db, owner, {
      categoryId,
      name: "Tosta",
      priceCents: 500,
      vatRateBps: 1300,
      groups: [{ name: "Extras", kind: "extra", maxSelect: 2, modifiers: [{ name: "Ovo", priceDeltaCents: 80 }, { name: "Bacon", priceDeltaCents: 120 }] }],
    });
    const id = (created as { value: { id: string } }).value.id;
    const before = (await getOwnMenu(db, owner))!.categories[0].products.find((p) => p.id === id)!;
    const g = before.groups[0];
    await saveProduct(db, owner, {
      id,
      categoryId,
      name: "Tosta mista",
      priceCents: 550,
      vatRateBps: 1300,
      groups: [{ id: g.id, name: "Extras", kind: "extra", maxSelect: 2, modifiers: [{ id: g.modifiers[0].id, name: "Ovo estrelado", priceDeltaCents: 90 }] }],
    });
    const after = (await getOwnMenu(db, owner))!.categories[0].products.find((p) => p.id === id)!;
    expect(after).toMatchObject({ name: "Tosta mista", priceCents: 550, ref: before.ref });
    expect(after.groups).toEqual([{ id: g.id, name: "Extras", kind: "extra", maxSelect: 1, modifiers: [{ id: g.modifiers[0].id, name: "Ovo estrelado", priceDeltaCents: 90 }] }]);
  });

  it("recusa dados inválidos, categorias com pratos e mexer noutro restaurante", async () => {
    await switchDemo();
    const menu = (await getOwnMenu(db, owner))!;
    const categoryId = menu.categories[0].id;
    expect(await saveProduct(db, owner, { categoryId, name: "", priceCents: 100, vatRateBps: 1300 })).toMatchObject({ ok: false, code: "INVALID" });
    expect(await saveProduct(db, owner, { categoryId, name: "X", priceCents: 100, vatRateBps: 1700 })).toMatchObject({ ok: false, code: "INVALID" });
    expect(await deleteCategory(db, owner, categoryId)).toMatchObject({ ok: false, code: "NOT_EMPTY" });
    expect(await deleteProduct(db, owner, randomUUID())).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  it("apagar pratos e categorias e mudar a ordem", async () => {
    await switchDemo();
    const [first, second] = (await getOwnMenu(db, owner))!.categories;
    expect(await move(db, owner, "category", second.id, "up")).toEqual({ ok: true });
    expect((await getOwnMenu(db, owner))!.categories.slice(0, 2).map((c) => c.id)).toEqual([second.id, first.id]);
    for (const p of first.products) expect(await deleteProduct(db, owner, p.id)).toEqual({ ok: true });
    expect(await deleteCategory(db, owner, first.id)).toEqual({ ok: true });
    expect((await getOwnMenu(db, owner))!.categories.some((c) => c.id === first.id)).toBe(false);
  });

  it("cada categoria tem um posto (cozinha ou bar) e o painel sabe de que posto é cada artigo", async () => {
    await switchDemo();
    const menu = (await getOwnMenu(db, owner))!;
    // Ao passar para sem POS, as bebidas vão para o bar e o resto para a cozinha.
    for (const c of menu.categories) expect(c.station).toBe(/bebida|caf|vinho|cerveja|cocktail|sumo|refriger|água|agua|drink/i.test(`${c.section ?? ""} ${c.name}`) ? "bar" : "kitchen");

    const bar = await saveCategory(db, owner, { name: "Cervejas" });
    const barId = (bar as { value: { id: string } }).value.id;
    const food = await saveCategory(db, owner, { name: "Pregos" });
    const foodId = (food as { value: { id: string } }).value.id;
    expect((await getOwnMenu(db, owner))!.categories.find((c) => c.id === barId)!.station).toBe("bar");
    await saveProduct(db, owner, { categoryId: barId, name: "Imperial", priceCents: 200, vatRateBps: 2300 });
    await saveProduct(db, owner, { categoryId: foodId, name: "Prego no pão", priceCents: 800, vatRateBps: 1300 });
    // Mudar o posto à mão.
    expect(await saveCategory(db, owner, { id: foodId, name: "Pregos", station: "kitchen" })).toMatchObject({ ok: true });

    const after = (await getOwnMenu(db, owner))!;
    const ref = (id: string) => after.categories.find((c) => c.id === id)!.products[0].ref;
    const order = await placeOrder(
      { tableToken: MESA.publicToken, idempotencyKey: randomUUID(), lines: [{ productRef: ref(barId), quantity: 2 }, { productRef: ref(foodId), quantity: 1 }] },
      { clientIpHash: randomUUID() },
      { db, resolvePos, now: () => new Date() },
    );
    expect(order.ok).toBe(true);
    const board = await getBoard(db, owner);
    const o = board.orders.find((x) => x.id === (order as { order: { id: string } }).order.id)!;
    expect(o.lines.map((l) => [l.name, l.station]).sort()).toEqual([["Imperial", "bar"], ["Prego no pão", "kitchen"]]);
  });
});
