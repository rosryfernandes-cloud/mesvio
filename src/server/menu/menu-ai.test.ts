import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type Db } from "@/server/db/client";
import { DEMO_PLATFORM_ADMIN, DEMO_USERS } from "@/server/db/seed-demo";
import { MockPosAdapter } from "@/server/pos/mock/mock-pos-adapter";
import { MesvioMenuAdapter } from "@/server/pos/mesvio/mesvio-menu-adapter";
import type { PosProviderId } from "@/server/pos/types";
import { findPlatformAdmin } from "@/server/platform/admin-auth";
import { switchToOwnMenu } from "@/server/platform/platform-service";
import { resolveStaffContext, type StaffContext } from "@/server/staff/context";
import { type AllergenBatch, type DescribeBatch, suggestAllergens, suggestDescriptions, suggestTranslations, type TranslateBatch } from "./menu-ai";
import { getOwnMenu, saveAllergens, saveDescriptions } from "./own-menu";

describe("traduções sugeridas", () => {
  const sources = [
    { kind: "category" as const, ref: "C1", context: "Categoria", name: "Entradas" },
    { kind: "product" as const, ref: "P1", context: "Entradas", name: "Pão com manteiga", description: "Pão do dia" },
    { kind: "product" as const, ref: "P2", context: "Entradas", name: "Azeitonas" },
  ];

  it("liga cada tradução ao elemento certo e só traz descrição em pratos", async () => {
    const translate: TranslateBatch = async (items) =>
      items.map((i) => ({ id: i.id, name: `EN ${i.name}`, description: i.kind === "category" ? "ignorar" : i.description && `EN ${i.description}` }));
    const r = await suggestTranslations(sources, "en", translate);
    expect(r).toEqual({
      ok: true,
      missing: 0,
      suggestions: [
        { kind: "category", ref: "C1", name: "EN Entradas" },
        { kind: "product", ref: "P1", name: "EN Pão com manteiga", description: "EN Pão do dia" },
        { kind: "product", ref: "P2", name: "EN Azeitonas" },
      ],
    });
  });

  it("o que não vier (ou vier vazio) conta como em falta; se a API falhar, nada é sugerido", async () => {
    const partial: TranslateBatch = async (items) => [{ id: items[0].id, name: "Starters", description: null }, { id: items[1].id, name: "  ", description: null }];
    expect(await suggestTranslations(sources, "en", partial)).toMatchObject({ ok: true, missing: 2, suggestions: [{ ref: "C1", name: "Starters" }] });
    const broken: TranslateBatch = async () => {
      throw new Error("rede");
    };
    expect(await suggestTranslations(sources, "en", broken)).toMatchObject({ ok: false, code: "UNAVAILABLE" });
  });

  it("ementas grandes vão em lotes", async () => {
    const many = Array.from({ length: 250 }, (_, i) => ({ kind: "product" as const, ref: `P${i}`, context: "x", name: `Prato ${i}` }));
    const sizes: number[] = [];
    const translate: TranslateBatch = async (items) => {
      sizes.push(items.length);
      return items.map((i) => ({ id: i.id, name: i.name, description: null }));
    };
    const r = await suggestTranslations(many, "en", translate);
    expect(sizes.sort()).toEqual([100, 100, 50]);
    expect(r).toMatchObject({ ok: true, missing: 0 });
  });
});

describe("alergénios sugeridos", () => {
  it("só aceita os 14 alergénios, pela ordem oficial", async () => {
    const guess: AllergenBatch = async (items) => items.map((i) => ({ id: i.id, allergens: ["leite", "glúten"], unsure: i.name === "Bitoque" }));
    const r = await suggestAllergens(
      [
        { productId: "a", name: "Tosta mista", description: null, category: "Snacks" },
        { productId: "b", name: "Bitoque", description: null, category: "Pratos" },
      ],
      guess,
    );
    expect(r).toEqual({
      ok: true,
      missing: 0,
      suggestions: [
        { productId: "a", allergens: ["glúten", "leite"], unsure: false },
        { productId: "b", allergens: ["glúten", "leite"], unsure: true },
      ],
    });
  });
});

describe("descrições sugeridas", () => {
  it("devolve as descrições preenchidas e conta as que ficaram sem (bebidas, marcas)", async () => {
    const describe: DescribeBatch = async (items) => items.map((i) => ({ id: i.id, description: i.name === "Coca-Cola" ? null : `  ${i.name} grelhado.  ` }));
    const r = await suggestDescriptions(
      [
        { productId: "a", name: "Polvo", category: "Peixe" },
        { productId: "b", name: "Coca-Cola", category: "Bebidas" },
      ],
      describe,
    );
    expect(r).toEqual({ ok: true, skipped: 1, suggestions: [{ productId: "a", description: "Polvo grelhado." }] });
  });
});

describe("gravar alergénios revistos", () => {
  let db: Db;
  let owner: StaffContext;
  const mock = new MockPosAdapter();
  const resolvePos = (provider: PosProviderId, establishmentId: string) => (provider === "mesvio" ? new MesvioMenuAdapter(establishmentId, async () => db) : mock);

  beforeEach(async () => {
    db = await createTestDb();
    owner = (await resolveStaffContext(db, DEMO_USERS[0].userId))!;
  });

  it("com a ementa do POS não grava nada", async () => {
    expect(await saveAllergens(db, owner, [{ id: randomUUID(), allergens: ["leite"] }])).toMatchObject({ ok: false, code: "NOT_OWN_MENU" });
  });

  it("grava vários pratos de uma vez e ignora pratos de outro restaurante", async () => {
    await switchToOwnMenu(db, (await findPlatformAdmin(db, DEMO_PLATFORM_ADMIN.userId))!, owner.establishmentId, resolvePos);
    const [a, b] = (await getOwnMenu(db, owner))!.categories.flatMap((c) => c.products);
    const r = await saveAllergens(db, owner, [
      { id: a.id, allergens: ["sulfitos", "glúten"] },
      { id: b.id, allergens: [] },
      { id: randomUUID(), allergens: ["ovos"] },
    ]);
    expect(r).toEqual({ ok: true, value: { saved: 2 } });
    const after = (await getOwnMenu(db, owner))!.categories.flatMap((c) => c.products);
    expect(after.find((p) => p.id === a.id)!.allergens).toEqual(["glúten", "sulfitos"]);
    expect(after.find((p) => p.id === b.id)!.allergens).toEqual([]);
    expect(await saveAllergens(db, owner, [{ id: a.id, allergens: ["inventado"] }])).toMatchObject({ ok: false, code: "INVALID" });
  });

  it("grava descrições revistas", async () => {
    expect(await saveDescriptions(db, owner, [{ id: randomUUID(), description: "x" }])).toMatchObject({ ok: false, code: "NOT_OWN_MENU" });
    await switchToOwnMenu(db, (await findPlatformAdmin(db, DEMO_PLATFORM_ADMIN.userId))!, owner.establishmentId, resolvePos);
    const [a] = (await getOwnMenu(db, owner))!.categories.flatMap((c) => c.products);
    expect(await saveDescriptions(db, owner, [{ id: a.id, description: " Pão do dia com manteiga. " }])).toEqual({ ok: true, value: { saved: 1 } });
    expect((await getOwnMenu(db, owner))!.categories.flatMap((c) => c.products).find((p) => p.id === a.id)!.description).toBe("Pão do dia com manteiga.");
  });
});
