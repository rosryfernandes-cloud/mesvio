import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type Db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { withTenant } from "@/server/db/tenant";
import { DEMO_ESTABLISHMENT, DEMO_ORGANIZATION, DEMO_TABLES } from "@/server/pos/mock/demo-data";
import { DEMO_USERS } from "@/server/db/seed-demo";
import { MockPosAdapter } from "@/server/pos/mock/mock-pos-adapter";
import { placeOrder } from "@/server/orders/place-order";
import { getOrderForTable } from "@/server/orders/order-view";
import { getTableBillByToken } from "@/server/tables/table-sessions";
import { resolveStaffContext, type StaffContext } from "@/server/staff/context";
import { listTranslatable, saveTranslations } from "@/server/staff/translations-service";
import { getTableMenu } from "./get-table-menu";

const T1 = DEMO_TABLES[0];
let db: Db;
let manager: StaffContext;
beforeEach(async () => {
  db = await createTestDb();
  manager = (await resolveStaffContext(db, DEMO_USERS[1].userId))!;
});

const product = (menu: Awaited<ReturnType<typeof getTableMenu>>, ref: string) => menu!.categories.flatMap((c) => c.products).find((p) => p.ref === ref)!;

describe("ementa em várias línguas", () => {
  it("português: tudo como vem do POS", async () => {
    const menu = await getTableMenu(T1.publicToken, { db, locale: "pt" });
    expect(menu!.categories[0]).toMatchObject({ name: "Couvert", section: "Comida", sectionKey: "Comida" });
    expect(product(menu, "F101").allergens).toEqual(["glúten", "leite"]);
  });

  it("inglês: secções, categorias, pratos, opções e alergénios traduzidos; a chave da secção não muda", async () => {
    const menu = await getTableMenu(T1.publicToken, { db, locale: "en" });
    expect(menu!.categories[0]).toMatchObject({ name: "Bread & starters", section: "Food", sectionKey: "Comida" });
    const burger = product(menu, "F162");
    expect(burger.name).toBe("Swara burger (180 g)");
    expect(burger.description).toMatch(/^Brioche bun, beef/);
    expect(burger.allergens).toContain("gluten");
    expect(burger.modifierGroups[0].name).toBe("Fries");
    expect(burger.modifierGroups[0].modifiers.map((m) => m.name)).toEqual(["Mediterranean potatoes", "French fries", "Sweet potato fries"]);
    expect(burger.priceCents).toBe(1800);
  });

  it("espanhol: categorias em espanhol; pratos sem tradução espanhola usam o inglês", async () => {
    const menu = await getTableMenu(T1.publicToken, { db, locale: "es" });
    expect(menu!.categories.find((c) => c.ref === "F-ENTRADAS")!.name).toBe("Entrantes");
    expect(product(menu, "F111").name).toBe("Vegetable tempura");
    expect(product(menu, "F111").allergens).toEqual(["gluten", "huevos", "leche"]);
  });

  it("o pedido e a conta mostram os artigos na língua do cliente (o POS recebe o original)", async () => {
    const r = await placeOrder(
      { tableToken: T1.publicToken, idempotencyKey: randomUUID(), lines: [{ productRef: "F162", quantity: 1, modifierRefs: ["GRP-BATATA-2"] }] },
      { clientIpHash: "ip" },
      { db, resolvePos: () => new MockPosAdapter(), backoffMs: () => 0 },
    );
    expect(r.ok).toBe(true);
    const orderId = r.ok ? r.order.id : "";
    const [item] = await db.select().from(t.orderItems).where(eq(t.orderItems.orderId, orderId));
    expect(item.name).toBe("Hambúrguer Swara (180 g)");

    const en = await getOrderForTable(db, T1.publicToken, orderId, "en");
    expect(en!.lines[0]).toMatchObject({ name: "Swara burger (180 g)", modifierNames: ["French fries"] });
    const pt = await getOrderForTable(db, T1.publicToken, orderId);
    expect(pt!.lines[0].name).toBe("Hambúrguer Swara (180 g)");
    const bill = await getTableBillByToken(db, T1.publicToken, new Date(), "de");
    expect(bill!.orders[0].lines[0].modifierNames).toEqual(["Pommes frites"]);
  });
});

describe("traduções no painel", () => {
  it("lista o que há para traduzir, com o original e a tradução atual", async () => {
    const items = await listTranslatable(db, manager, "fr");
    const tempura = items.find((i) => i.kind === "product" && i.ref === "F111")!;
    expect(tempura.original.name).toBe("Tempura de Legumes");
    expect(tempura.translated).toBeNull();
    expect(items.find((i) => i.kind === "category" && i.ref === "F-ENTRADAS")!.translated?.name).toBe("Entrées");
  });

  it("grava, apaga e ignora referências que não existem na ementa", async () => {
    const res = await saveTranslations(db, manager, {
      locale: "fr",
      changes: [
        { kind: "product", ref: "F111", name: "Tempura de légumes", description: "Courgette, carotte, poivron rouge." },
        { kind: "category", ref: "F-ENTRADAS", name: "" },
        { kind: "product", ref: "NAO-EXISTE", name: "Fantasma" },
      ],
    });
    expect(res).toEqual({ saved: 1, removed: 1 });
    const menu = await getTableMenu(T1.publicToken, { db, locale: "fr" });
    expect(product(menu, "F111")).toMatchObject({ name: "Tempura de légumes", description: "Courgette, carotte, poivron rouge." });
    // Sem tradução francesa, a categoria volta ao inglês.
    expect(menu!.categories.find((c) => c.ref === "F-ENTRADAS")!.name).toBe("Starters");
  });

  it("as traduções de um restaurante não se veem a partir de outro (RLS)", async () => {
    const otherOrg = "00000000-0000-4000-8000-00000000c001";
    await db.insert(t.organizations).values({ id: otherOrg, legalName: "Outro, Lda.", nif: "999999992", status: "active" });
    await withTenant(db, { organizationId: otherOrg }, async (tx) => {
      expect(await tx.select().from(t.menuTranslations).where(eq(t.menuTranslations.establishmentId, DEMO_ESTABLISHMENT.id))).toHaveLength(0);
    });
    await withTenant(db, { organizationId: DEMO_ORGANIZATION.id }, async (tx) => {
      expect((await tx.select().from(t.menuTranslations)).length).toBeGreaterThan(100);
    });
  });
});
