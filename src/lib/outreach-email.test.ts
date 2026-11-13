import { describe, expect, it } from "vitest";
import { outreachEmail, outreachFollowUp, outreachShortText } from "./outreach-email";

describe("mensagens para restaurantes", () => {
  it("o email leva o link, as imagens, o nome escapado e a forma de deixar de receber", () => {
    const m = outreachEmail({ restaurant: "Tasca <Zé>", url: "https://mesvio.pt/p/abc", sender: "Rodrigo", baseUrl: "https://mesvio.pt/" });
    expect(m.subject).toBe("Tasca <Zé>: a sua ementa digital em 5 línguas (já feita)");
    expect(m.html).toContain("Tasca &lt;Zé&gt;");
    expect(m.html).toContain('href="https://mesvio.pt/p/abc"');
    expect(m.html).toContain("https://mesvio.pt/email/linguas.png");
    expect(m.html).toContain("https://mesvio.pt/email/painel.png");
    expect(m.text).toContain("responda \"não\"");
    expect(m.html + m.text).not.toMatch(/pagamento|\bPOS\b|NFC/);
  });
  it("a mensagem curta tem o link", () => {
    expect(outreachShortText({ restaurant: "Casa", url: "https://mesvio.pt/p/x", sender: "Rodrigo" })).toContain("https://mesvio.pt/p/x");
  });
});

describe("seguimento", () => {
  it("responde ao mesmo assunto, leva o link e diz que é o último", () => {
    const m = outreachFollowUp({ restaurant: "Casa", url: "https://mesvio.pt/p/x", sender: "Rodrigo" });
    expect(m.subject).toBe("Re: Casa: a sua ementa digital em 5 línguas (já feita)");
    expect(m.text).toContain("https://mesvio.pt/p/x");
    expect(m.text).toContain("último email");
  });
});
