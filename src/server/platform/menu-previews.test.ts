import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type Db } from "@/server/db/client";
import { DEMO_PLATFORM_ADMIN } from "@/server/db/seed-demo";
import { findPlatformAdmin, type PlatformAdmin } from "./admin-auth";
import { createPreview, deletePreview, getPreviewByToken, listPreviews, prunePreviews, recordPreviewView, requestActivation } from "./menu-previews";

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
