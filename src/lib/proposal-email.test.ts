import { describe, expect, it } from "vitest";
import { extraCents, proposalEmail } from "./proposal-email";

const base = { restaurant: "Praia Piscina", url: "https://mesvio.pt/p/abc", sender: "Rodrigo Fernandes", phone: "920 636 605", baseUrl: "https://mesvio.pt" };

describe("proposta por email", () => {
  it("com pagamentos e espreguiçadeiras: imagens, taxas da Stripe, extras e total certo", () => {
    const p = proposalEmail({ ...base, contactName: "Giovana", plan: "payments", sunbeds: true, extras: ["comandeira", "cozinha"] });
    expect(p.subject).toContain("Praia Piscina");
    for (const img of ["camas-cozinha.jpg", "mesa-chamar-conta.jpg", "linguas.png", "painel.png", "placa-qr.jpg"]) expect(p.html).toContain(`https://mesvio.pt/email/${img}`);
    expect(p.html).toContain("1,5% + 0,25 €");
    expect(p.html).toContain("Olá Giovana");
    expect(p.html).toContain("84 € por mês"); // 69 + 10 + 5
    const o = proposalEmail({ ...base, plan: "payments", sunbeds: true, extras: [], optionalExtras: ["comandeira", "cozinha"] });
    expect(o.html).toContain("69 € por mês");
    expect(o.html).toContain("Se quiserem, também temos");
    expect(o.html).toContain("Comandeira digital");
    expect(o.html).not.toContain("Extras incluídos");
    expect(p.text).toContain("https://mesvio.pt/p/abc");
    expect(p.text).toContain("920 636 605");
  });

  it("só ementa: sem pedidos, sem taxas, com a ideia dos pedidos a 59 €", () => {
    const p = proposalEmail({ ...base, plan: "menu", sunbeds: false, extras: [] });
    expect(p.html).not.toContain("camas-cozinha.jpg");
    expect(p.html).not.toContain("Stripe");
    expect(p.html).toContain("25 € por mês");
    expect(p.html).toContain("59 € por mês");
    expect(p.html).toContain("placa-qr.jpg");
  });

  it("escapa o nome do restaurante e lê o preço dos extras", () => {
    expect(proposalEmail({ ...base, restaurant: "<b>X</b>", plan: "orders", sunbeds: false, extras: [] }).html).toContain("&lt;b&gt;X&lt;/b&gt;");
    expect(extraCents("ponto")).toBe(990);
    expect(extraCents("comandeira")).toBe(1000);
  });
});
