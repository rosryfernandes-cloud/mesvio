import { describe, expect, it } from "vitest";
import { DEMO_PRODUCTS } from "@/server/pos/mock/demo-data";
import { matchPhotos, similarity, tokens } from "./photo-matching";

const products = DEMO_PRODUCTS.map((p) => ({ ref: p.posProductRef, name: p.name }));
const refFor = (file: string) => {
  const [m] = matchPhotos([file], products);
  return m.productRef;
};

describe("associar fotos aos pratos pelo nome do ficheiro", () => {
  it("ignora acentos, maiúsculas, quantidades e a extensão", () => {
    expect(tokens("Hambúrguer Swara (180 g)")).toEqual(["hamburguer", "swara"]);
    expect(tokens("IMG_20260815_hamburguer-SWARA (1).JPG", { isFile: true })).toEqual(["hamburguer", "swara"]);
    expect(refFor("hamburguer-swara.jpg")).toBe("F162");
    expect(refFor("Camarão Pil Pil.png")).toBe("F135");
    expect(refFor("TOSTA_MISTA.webp")).toBe("F172");
  });

  it("aceita a referência do POS como nome do ficheiro", () => {
    expect(similarity("F162.jpg", { ref: "F162", name: "Hambúrguer Swara (180 g)" })).toBe(1);
    expect(refFor("x524.jpeg")).toBe("X524");
  });

  it("não inventa: nomes de câmara ficam por associar", () => {
    expect(refFor("IMG_4821.JPG")).toBeNull();
    expect(refFor("WhatsApp Image 2026-08-15 at 13.02.11.jpeg")).toBeNull();
  });

  it("cada prato recebe no máximo uma foto (a mais parecida)", () => {
    const r = matchPhotos(["mojito.jpg", "mojito-2.jpg", "caipirinha.jpg"], products);
    expect(r[0].productRef).toBe("X524");
    expect(r[1].productRef).not.toBe("X524");
    expect(r[2].productRef).toBe("X522");
  });
});
