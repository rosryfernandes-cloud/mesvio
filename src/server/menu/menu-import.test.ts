import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type Db } from "@/server/db/client";
import { DEMO_PLATFORM_ADMIN, DEMO_USERS } from "@/server/db/seed-demo";
import { MockPosAdapter } from "@/server/pos/mock/mock-pos-adapter";
import { findPlatformAdmin } from "@/server/platform/admin-auth";
import { switchToOwnMenu } from "@/server/platform/platform-service";
import { resolveStaffContext, type StaffContext } from "@/server/staff/context";
import { detectPhotoType, type MenuPhoto, type MenuReading, parseReading, readMenuPhotos, toMenuDraft } from "./menu-import";
import { getOwnMenu, importMenuDraft } from "./own-menu";
import { describeKeyValue, extractApiKey } from "@/server/ai/claude";

const PHOTO: MenuPhoto = { mediaType: "image/jpeg", data: Buffer.from([0xff, 0xd8, 0xff, 0xe0]) };

const READING: MenuReading = {
  readable: true,
  categories: [
    {
      name: " Petiscos ",
      section: null,
      items: [
        { name: "Pica-pau", description: "Novilho", priceEuros: 12.5, kind: "food", unsure: false, photoId: null },
        { name: "Amêijoas", description: null, priceEuros: null, kind: "food", unsure: false, photoId: null },
        { name: "  ", description: null, priceEuros: 3, kind: "food", unsure: false, photoId: null },
      ],
    },
    { name: "Bebidas", section: "Bar", items: [{ name: "Imperial", description: null, priceEuros: 2, kind: "alcohol", unsure: true, photoId: null }] },
    { name: "Vazia", section: null, items: [] },
  ],
};

describe("ler a ementa por fotografia", () => {
  it("transforma a leitura numa proposta: cêntimos, IVA sugerido e pratos a confirmar", () => {
    expect(toMenuDraft(READING)).toEqual({
      categories: [
        {
          name: "Petiscos",
          section: null,
          products: [
            { name: "Pica-pau", description: "Novilho", priceCents: 1250, vatRateBps: 1300, unsure: false, imageUrl: null },
            // Sem preço na ementa: nunca se inventa, fica para o dono confirmar.
            { name: "Amêijoas", description: null, priceCents: null, vatRateBps: 1300, unsure: true, imageUrl: null },
          ],
        },
        { name: "Bebidas", section: "Bar", products: [{ name: "Imperial", description: null, priceCents: 200, vatRateBps: 2300, unsure: true, imageUrl: null }] },
      ],
    });
  });

  it("sem chave da API, avisa em vez de falhar", async () => {
    const before = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    expect(await readMenuPhotos([PHOTO])).toMatchObject({ ok: false, code: "NOT_CONFIGURED" });
    if (before) process.env.ANTHROPIC_API_KEY = before;
  });

  it("explica os casos em que não há proposta", async () => {
    const run = (stopReason: string | null, reading: MenuReading | null) => readMenuPhotos([PHOTO], async () => ({ stopReason, reading }));
    expect(await run("max_tokens", null)).toMatchObject({ ok: false, code: "TOO_LONG" });
    expect(await run("refusal", null)).toMatchObject({ ok: false, code: "UNREADABLE" });
    expect(await run("end_turn", { readable: false, categories: [] })).toMatchObject({ ok: false, code: "UNREADABLE" });
    expect(await run("end_turn", READING)).toMatchObject({ ok: true });
    const failing = await readMenuPhotos([PHOTO], async () => {
      throw new Error("rede");
    });
    expect(failing).toMatchObject({ ok: false, code: "UNAVAILABLE" });
  });

  it("reconhece o tipo pela assinatura do ficheiro, não pelo que o navegador diz", () => {
    expect(detectPhotoType(PHOTO.data)).toBe("image/jpeg");
    expect(detectPhotoType(Buffer.from("<svg onload=alert(1)>"))).toBeNull();
    expect(detectPhotoType(Buffer.from("RIFF0000WEBPVP8 "))).toBe("image/webp");
  });
});

describe("confirmar a ementa importada", () => {
  let db: Db;
  let owner: StaffContext;
  const MENU = {
    categories: [
      {
        name: "Petiscos",
        section: "",
        products: [
          { name: "Pica-pau", description: "", priceCents: 1250, vatRateBps: 1300 },
          { name: "Amêijoas", description: "À Bulhão Pato", priceCents: 1400, vatRateBps: 1300 },
        ],
      },
      { name: "Vinhos", section: "Bar", products: [{ name: "Vinho da casa (copo)", description: "", priceCents: 300, vatRateBps: 2300 }] },
    ],
  };

  beforeEach(async () => {
    db = await createTestDb();
    owner = (await resolveStaffContext(db, DEMO_USERS[0].userId))!;
  });

  const ownMenu = async () => switchToOwnMenu(db, (await findPlatformAdmin(db, DEMO_PLATFORM_ADMIN.userId))!, owner.establishmentId, () => new MockPosAdapter());

  it("num restaurante com POS não grava nada", async () => {
    expect(await importMenuDraft(db, owner, MENU)).toMatchObject({ ok: false, code: "NOT_OWN_MENU" });
  });

  it("acrescenta sem mexer no que existe, sem alergénios, e confirmar duas vezes não duplica", async () => {
    await ownMenu();
    const before = (await getOwnMenu(db, owner))!;
    const productsBefore = before.categories.flatMap((c) => c.products);

    expect(await importMenuDraft(db, owner, MENU)).toEqual({ ok: true, value: { categories: 2, products: 3, skipped: 0, photos: [] } });
    const after = (await getOwnMenu(db, owner))!;
    const vinhos = after.categories.find((c) => c.name === "Vinhos")!;
    expect(vinhos.section).toBe("Bar");
    expect(vinhos.station).toBe("bar");
    expect(vinhos.products[0]).toMatchObject({ priceCents: 300, vatRateBps: 2300, allergens: [], available: true });
    for (const p of productsBefore) {
      expect(after.categories.flatMap((c) => c.products).find((x) => x.id === p.id)).toEqual(p);
    }

    expect(await importMenuDraft(db, owner, MENU)).toEqual({ ok: true, value: { categories: 0, products: 0, skipped: 3, photos: [] } });
  });

  it("não aceita pratos sem preço", async () => {
    await ownMenu();
    const bad = { categories: [{ name: "X", section: "", products: [{ name: "Y", description: "", priceCents: null, vatRateBps: 1300 }] }] };
    expect(await importMenuDraft(db, owner, bad)).toMatchObject({ ok: false, code: "INVALID" });
  });
});

describe("resposta da leitura", () => {
  it("aceita só JSON no formato pedido e não rebenta com respostas cortadas", () => {
    const ok = { readable: true, categories: [{ name: "Pratos", section: null, items: [{ name: "Bitoque", description: null, priceEuros: 9.5, kind: "food", unsure: false, photoId: null }] }] };
    expect(parseReading(JSON.stringify(ok), "end_turn")).toEqual(ok);
    expect(parseReading(JSON.stringify(ok).slice(0, 40), "end_turn")).toBeNull();
    expect(parseReading(JSON.stringify({ readable: true }), "end_turn")).toBeNull();
  });
});

describe("chave da Anthropic", () => {
  const key = "sk-ant-api03-" + "a".repeat(40) + "_B-c";
  it("aproveita só a chave, mesmo com espaços, aspas ou o comando de exemplo à volta", () => {
    expect(extractApiKey(key)).toBe(key);
    expect(extractApiKey(` "${key}"\n`)).toBe(key);
    expect(extractApiKey(`curl https://api.anthropic.com/v1/messages -H "x-api-key: ${key}"`)).toBe(key);
  });
  it("sem chave devolve null e descreve o valor sem o mostrar", () => {
    expect(extractApiKey("curl https://api.anthropic.com/v1/messages -H \"x-api-key: $ANTHROPIC_API_KEY\"")).toBeNull();
    expect(extractApiKey(undefined)).toBeNull();
    const d = describeKeyValue("curl https://x");
    expect(d).toEqual({ length: 14, startsWithSkAnt: false, hasSpaces: true, hasQuotes: false, looksLikeCommand: true });
  });
});

describe("leitura por link (site com fotos)", () => {
  it("liga cada prato à foto do site indicada pela leitura", async () => {
    const { readMenu } = await import("./menu-import");
    const reading: MenuReading = {
      readable: true,
      categories: [{ name: "Pratos", section: null, items: [{ name: "Polvo", description: null, priceEuros: 18.5, kind: "food", unsure: false, photoId: "1" }, { name: "Bitoque", description: null, priceEuros: 11, kind: "food", unsure: false, photoId: "9" }] }],
    };
    const r = await readMenu({ webText: { url: "https://r.pt", text: "…", images: new Map([["1", "https://r.pt/polvo.jpg"]]) } }, async () => ({ stopReason: "end_turn", reading }));
    expect(r.ok && r.draft.categories[0].products.map((p) => p.imageUrl)).toEqual(["https://r.pt/polvo.jpg", null]);
  });

  it("reconhece PDFs", () => {
    expect(detectPhotoType(Buffer.from("%PDF-1.7\n..."))).toBe("application/pdf");
  });
});
