import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type Db } from "@/server/db/client";
import { DEMO_PLATFORM_ADMIN } from "@/server/db/seed-demo";
import { findPlatformAdmin, type PlatformAdmin } from "./admin-auth";
import { createPreview, createPreviewFromLink, deletePreview, isDoNotContact, markDoNotContact, markPreviewEmailed, markPreviewFollowedUp, nameKey, getPreviewByToken, listPreviews, prunePreviews, recordPreviewView, requestActivation } from "./menu-previews";

let db: Db;
let admin: PlatformAdmin;
beforeEach(async () => {
  db = await createTestDb();
  admin = (await findPlatformAdmin(db, DEMO_PLATFORM_ADMIN.userId))!;
});

const MENU = {
  categories: [{ name: "Pratos", products: [{ name: "Polvo", description: null, priceCents: 1850, imageUrl: "http://site.pt/polvo.jpg" }, { name: "Bitoque", description: "Bife e ovo", priceCents: 1100, imageUrl: "https://site.pt/bitoque.jpg" }] }],
};

describe("pré-visualizações para potenciais clientes", () => {
  it("cria um link privado, conta as visitas, regista o pedido de ativação e expira", async () => {
    const now = new Date("2026-11-13T12:00:00Z");
    const r = await createPreview(db, admin, { restaurantName: "Casa do Mar", menu: MENU, translations: { en: { "p0-0": { name: "Octopus" } } } }, now);
    expect(r.ok).toBe(true);
    const token = r.ok ? r.token : "";
    expect(token).toMatch(/^[A-Za-z0-9_-]{16}$/);

    const p = (await getPreviewByToken(db, token, now))!;
    expect(p.restaurantName).toBe("Casa do Mar");
    // Só fotos em https.
    expect(p.menu.categories[0].products.map((x) => x.imageUrl)).toEqual([null, "https://site.pt/bitoque.jpg"]);

    expect(await recordPreviewView(db, token, now)).toBe(true);
    expect(await recordPreviewView(db, token, new Date(now.getTime() + 60_000))).toBe(true);
    expect(await requestActivation(db, token, { contact: "912 345 678" }, now)).toBe(true);
    const [row] = await listPreviews(db);
    expect(row).toMatchObject({ viewCount: 2, activationContact: "912 345 678" });
    expect(row.activationRequestedAt).not.toBeNull();

    const later = new Date(now.getTime() + 31 * 86400000);
    expect(await getPreviewByToken(db, token, later)).toBeNull();
    expect(await recordPreviewView(db, token, later)).toBe(false);
    await prunePreviews(db, new Date(now.getTime() + 95 * 86400000));
    expect(await listPreviews(db)).toHaveLength(0);
  });

  it("recusa links inventados e pedidos sem ementa; apagar desliga o link", async () => {
    expect(await getPreviewByToken(db, "../../etc")).toBeNull();
    expect(await createPreview(db, admin, { restaurantName: "X", menu: { categories: [] } })).toMatchObject({ ok: false });
    const r = await createPreview(db, admin, { restaurantName: "Tasca", menu: MENU });
    const [row] = await listPreviews(db);
    expect(await deletePreview(db, row.id)).toBe(true);
    expect(await getPreviewByToken(db, r.ok ? r.token : "")).toBeNull();
  });
});

describe("links criados em lote a partir do link da ementa", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("lê a ementa do site, traduz, guarda com o email do restaurante e regista o envio", async () => {
    const html = `<html><body><h1>Ementa</h1><h2>Pratos</h2><p>Polvo à lagareiro 18,50 €</p><p>Bitoque 11,00 €</p><p>Bacalhau à Brás 14,00 €</p><p>Imperial 2,00 €</p></body></html>`;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } })));
    const r = await createPreviewFromLink(
      db,
      admin,
      { restaurantName: "Casa do Mar", url: "https://casadomar.pt/ementa", contactEmail: "geral@casadomar.pt" },
      {
        resolve: async () => ["93.184.216.34"],
        reader: async () => ({
          stopReason: "end_turn",
          reading: { readable: true, categories: [{ name: "Pratos", section: null, items: [{ name: "Polvo", description: null, priceEuros: 18.5, kind: "food", unsure: false, photoId: null }] }] },
        }),
        translate: async (items) => items.map((i) => ({ id: i.id, name: `EN ${i.name}`, description: null })),
      },
    );
    expect(r).toMatchObject({ ok: true, products: 1 });
    const p = (await getPreviewByToken(db, r.ok ? r.token : ""))!;
    expect(p.contactEmail).toBe("geral@casadomar.pt");
    expect(p.translations.en["p0-0"].name).toBe("EN Polvo");
    expect(p.translations.de["c0"].name).toBe("EN Pratos");
    expect(await markPreviewEmailed(db, p.id)).toBe(true);
    expect((await listPreviews(db))[0].emailedAt).not.toBeNull();
  });

  it("recusa emails inválidos", async () => {
    expect(await createPreviewFromLink(db, admin, { restaurantName: "X Y", url: "https://x.pt", contactEmail: "não-é-email" })).toMatchObject({ ok: false });
  });
});

describe("seguimento e não contactar", () => {
  it("regista o seguimento; quem pede para não ser contactado sai da lista e não entra em novos lotes", async () => {
    const r = await createPreview(db, admin, { restaurantName: "Praia Princesa", contactEmail: "Reservas@PraiaPrincesa.com", menu: MENU });
    const [row] = await listPreviews(db);
    expect(await markPreviewFollowedUp(db, row.id)).toBe(true);
    expect((await listPreviews(db))[0].followedUpAt).not.toBeNull();

    expect(await markDoNotContact(db, admin, row.id)).toBe(true);
    expect(await getPreviewByToken(db, r.ok ? r.token : "")).toBeNull();
    expect(await isDoNotContact(db, "praia princesa")).toBe(true);
    expect(await isDoNotContact(db, "Outro nome", "reservas@praiaprincesa.com")).toBe(true);
    expect(await createPreviewFromLink(db, admin, { restaurantName: "Praia  Princesa!", url: "https://praiaprincesa.com/menu" })).toEqual({
      ok: false,
      message: "Este restaurante pediu para não ser contactado.",
    });
  });

  it("compara nomes sem acentos nem pontuação", () => {
    expect(nameKey("  Bicho d'Água ")).toBe("bicho d agua");
  });
});
