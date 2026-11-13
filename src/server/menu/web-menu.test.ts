import { describe, expect, it } from "vitest";
import { extractWebPage } from "./web-menu";

describe("ementa num site", () => {
  it("tira o texto e marca as fotos dos pratos no sítio onde aparecem", () => {
    const html = `<html><head><title>x</title><script>alert(1)</script></head><body>
      <nav><img src="/logo.png" alt="Logo"></nav>
      <h2>Pratos</h2>
      <div><img src="/fotos/polvo.jpg" alt="Polvo à lagareiro"><h3>Polvo à lagareiro</h3><p>18,50&nbsp;&euro;</p></div>
      <div><img data-src="https://cdn.exemplo.pt/bitoque.webp" width="400"><h3>Bitoque</h3><p>11 €</p></div>
      <img src="/icon.svg"><img src="data:image/png;base64,AAA"><img src="/x.jpg" width="20">
      <style>.a{}</style></body></html>`;
    const page = extractWebPage(html, "https://restaurante.pt/menu");
    expect(page.text).not.toContain("alert");
    expect(page.text).toContain("[FOTO 1: Polvo à lagareiro]");
    expect(page.text).toContain("18,50 €");
    expect(page.text).toContain("[FOTO 2]");
    expect([...page.images.values()]).toEqual(["https://restaurante.pt/fotos/polvo.jpg", "https://cdn.exemplo.pt/bitoque.webp"]);
  });
});
