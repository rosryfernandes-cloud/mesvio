import { describe, expect, it } from "vitest";
import { getTableMenu } from "./get-table-menu";
import { DEMO_TABLES } from "@/server/pos/mock/demo-data";
import { getDemoPosAdapter } from "@/server/pos/registry";
import { invalidateCatalog } from "@/server/catalog/availability";
import { generateTableToken, isWellFormedTableToken, tableUrl } from "@/server/tables/table-token";
import { formatEur, netFromGross } from "@/lib/money";

describe("tokens de mesa", () => {
  it("gera tokens de 22 caracteres base64url, únicos", () => {
    const set = new Set(Array.from({ length: 1000 }, generateTableToken));
    expect(set.size).toBe(1000);
    for (const t of set) expect(isWellFormedTableToken(t)).toBe(true);
  });

  it("rejeita tokens malformados", () => {
    for (const bad of ["", "1", "../../etc/passwd", "a".repeat(23), "mesa-1", null, 42]) {
      expect(isWellFormedTableToken(bad)).toBe(false);
    }
  });

  it("constrói o URL do QR/NFC", () => {
    expect(tableUrl("https://app.exemplo.pt/", "abc")).toBe("https://app.exemplo.pt/m/abc");
  });
});

describe("ementa da mesa", () => {
  it("resolve a mesa pelo token e devolve categorias ordenadas, agrupadas por secção", async () => {
    const menu = await getTableMenu(DEMO_TABLES[4].publicToken);
    expect(menu?.table.label).toBe("Mesa 5");
    expect(menu?.establishment.name).toBe("Swara Beach ClubHouse");
    expect([...new Set(menu?.categories.map((c) => c.section))]).toEqual(["Comida", "Bebidas", "Bar & Cocktails"]);
    expect(menu?.categories[0].name).toBe("Couvert");
  });

  it("devolve null para tokens desconhecidos ou malformados", async () => {
    expect(await getTableMenu("AAAAAAAAAAAAAAAAAAAAAA")).toBeNull();
    expect(await getTableMenu("mesa-1")).toBeNull();
  });

  it("marca produtos esgotados vindos do POS", async () => {
    const pos = getDemoPosAdapter();
    pos.setAvailability("X524", false); // Mojito
    invalidateCatalog(pos); // o catálogo do POS está em cache (30 s); o POS "avisou" que mudou
    try {
      const menu = await getTableMenu(DEMO_TABLES[0].publicToken);
      const mojito = menu?.categories.flatMap((c) => c.products).find((p) => p.ref === "X524");
      expect(mojito?.available).toBe(false);
    } finally {
      pos.setAvailability("X524", true);
      invalidateCatalog(pos);
    }
  });
});

describe("dinheiro", () => {
  it("formata euros em pt-PT", () => {
    expect(formatEur(1450)).toBe("14,50 €");
  });
  it("calcula valor sem IVA com arredondamento half-up", () => {
    expect(netFromGross(12300, 2300)).toBe(10000);
    expect(netFromGross(1450, 1300)).toBe(1283); // 12,8318… → 12,83
  });
});
