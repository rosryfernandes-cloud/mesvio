import { afterEach, describe, expect, it, vi } from "vitest";
import type { MenuReader, MenuSource } from "./menu-import";
import { decodeHtml, looksLikeMenuText, normalizeMenuUrl, readMenuFromLink } from "./menu-link";

const publicDns = async () => ["93.184.216.34"];
const PDF = Buffer.from("%PDF-1.4\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\n");
const MENU_HTML = `<html><body><h2>Entradas</h2><p>Sopa do dia 3,00 €</p><p>Pão 1,50 €</p><h2>Peixe</h2><p>Dourada grelhada 16,50 €</p><p>Polvo à lagareiro 18,00 €</p></body></html>`;

/** Leitor falso: guarda o que recebeu e devolve uma ementa com um prato. */
function fakeReader() {
  const seen: MenuSource[] = [];
  const reader: MenuReader = async (source) => {
    seen.push(source);
    return {
      stopReason: "end_turn",
      reading: { readable: true, categories: [{ name: "Peixe", section: null, items: [{ name: "Dourada", description: null, priceEuros: 16.5, kind: "food", unsure: false, photoId: null }] }] },
    };
  };
  return { reader, seen };
}

function serve(body: BodyInit | null, init: ResponseInit) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(body, init)));
}

describe("ler a ementa por link", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("um PDF é lido como um PDF enviado, mesmo sem .pdf e servido como octet-stream", async () => {
    serve(PDF, { status: 200, headers: { "content-type": "application/octet-stream" } });
    const { reader, seen } = fakeReader();
    const result = await readMenuFromLink("https://cdn.exemplo.pt/media/abc123", { reader, resolve: publicDns });
    expect(result.ok).toBe(true);
    expect(seen[0].pages?.[0].mediaType).toBe("application/pdf");
  });

  it("aceita PDFs de impressão maiores do que um upload (ex.: 9 MB)", async () => {
    serve(Buffer.concat([PDF, Buffer.alloc(9 * 1024 * 1024)]), { status: 200, headers: { "content-type": "application/pdf" } });
    const { reader } = fakeReader();
    expect((await readMenuFromLink("https://restaurante.pt/carta.pdf", { reader, resolve: publicDns })).ok).toBe(true);
  });

  it("uma página com a ementa em texto vai para a leitura como texto", async () => {
    serve(MENU_HTML, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
    const { reader, seen } = fakeReader();
    const result = await readMenuFromLink("restaurante.pt/ementa", { reader, resolve: publicDns });
    expect(result.ok).toBe(true);
    expect(seen[0].webText?.text).toContain("Dourada grelhada 16,50 €");
  });

  it("uma página só com JavaScript ou com a ementa em imagem dá um erro claro, sem gastar a leitura com IA", async () => {
    serve(`<html><body><div id="root"></div><nav>Sobre nós · Menu · Reservas · Contactos</nav><p>Rua da Praia 12, Costa da Caparica · 212 000 000</p><img src="/menu.jpg"><script src="/app.js"></script></body></html>`, {
      status: 200,
      headers: { "content-type": "text/html" },
    });
    const { reader, seen } = fakeReader();
    const result = await readMenuFromLink("https://restaurante.pt/menu", { reader, resolve: publicDns });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toMatch(/PDF/);
    expect(!result.ok && result.message).toMatch(/capturas de ecrã/);
    expect(seen).toHaveLength(0);
  });

  it("diz qual foi o erro do site", async () => {
    serve("Not found", { status: 404 });
    const result = await readMenuFromLink("https://restaurante.pt/menu", { reader: fakeReader().reader, resolve: publicDns });
    expect(!result.ok && result.message).toContain("(404)");
  });
});

describe("ajudas da leitura por link", () => {
  it("aceita o link como vem colado", () => {
    expect(normalizeMenuUrl("  <https://restaurante.pt/menu>  ")).toBe("https://restaurante.pt/menu");
    expect(normalizeMenuUrl("www.restaurante.pt/carta.pdf")).toBe("https://www.restaurante.pt/carta.pdf");
    expect(normalizeMenuUrl("http://www.casameco.pt/carta.pdf")).toBe("http://www.casameco.pt/carta.pdf");
  });

  it("reconhece texto com preços", () => {
    expect(looksLikeMenuText("Entradas\nSopa do dia 3,00\nPão 1,50\nAzeitonas 2.50\nmais texto para passar os oitenta caracteres")).toBe(true);
    expect(looksLikeMenuText("Sobre nós\nMenu\nGaleria\nReservas\nContactos\nRua da Praia 12\n2825-000 Costa da Caparica\n212 000 000")).toBe(false);
    // Só fotos e a navegação repetida: não é texto.
    expect(looksLikeMenuText(`${"Menu\nReservas\n".repeat(50)}${Array.from({ length: 13 }, (_, i) => `[FOTO ${i + 1}: Ementa página ${i + 1}]`).join("\n")}`)).toBe(false);
    // Ementa em texto sem preços (só os nomes dos pratos): vai para a leitura.
    const dishes = "Ameijoas à bulhão Pato | Cocktail de Gambas | Salada de polvo | Chocos Assados | Lula Assada | Cherne grelhado ou cozido | Espadarte Grelhado";
    expect(looksLikeMenuText(Array.from({ length: 8 }, (_, i) => `Secção ${i}\n${dishes} ${i}`).join("\n"))).toBe(true);
  });

  it("lê páginas em ISO-8859-1", () => {
    const html = Buffer.from('<meta charset="iso-8859-1"><p>Polvo à lagareiro, açorda</p>', "latin1");
    expect(decodeHtml(html, "text/html")).toContain("Polvo à lagareiro, açorda");
    expect(decodeHtml(Buffer.from("<p>Ração</p>", "latin1"), "text/html; charset=ISO-8859-1")).toContain("Ração");
  });
});
