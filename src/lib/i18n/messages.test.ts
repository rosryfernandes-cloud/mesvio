import { describe, expect, it } from "vitest";
import { apiErrorText, issueText, MESSAGES, pickLocale } from "./messages";
import { translateAllergen, translateTag } from "./food-terms";

describe("escolha da língua", () => {
  it("usa a escolha guardada antes da língua do telemóvel", () => {
    expect(pickLocale("pt", "en-GB,en;q=0.9")).toBe("pt");
    expect(pickLocale("en", "pt-PT")).toBe("en");
  });
  it("telemóvel em português fica em português; qualquer outra língua passa a inglês", () => {
    expect(pickLocale(undefined, "pt-PT,pt;q=0.9")).toBe("pt");
    expect(pickLocale(undefined, "pt-BR")).toBe("pt");
    expect(pickLocale(undefined, "de-DE,de;q=0.9,en;q=0.8")).toBe("en");
    expect(pickLocale(undefined, "es;q=0.5, pt;q=0.9")).toBe("pt");
  });
  it("português sem preferência; uma escolha antiga (ex.: espanhol) já não conta", () => {
    expect(pickLocale(undefined, null)).toBe("pt");
    expect(pickLocale("es", "pt-PT")).toBe("pt");
    expect(pickLocale("fr", "fr-FR")).toBe("en");
  });
});

describe("dicionários", () => {
  it("erros: português usa a mensagem do servidor; inglês traduz pelo código", () => {
    const data = { code: "RATE_LIMITED", message: "Demasiados pedidos (servidor)." };
    expect(apiErrorText(MESSAGES.pt, "pt", data, "x")).toBe("Demasiados pedidos (servidor).");
    expect(apiErrorText(MESSAGES.en, "en", data, "x")).toBe(MESSAGES.en.apiError.RATE_LIMITED);
    expect(apiErrorText(MESSAGES.en, "en", { code: "DESCONHECIDO" }, "fallback")).toBe("fallback");
  });
  it("motivos do carrinho em inglês", () => {
    expect(issueText(MESSAGES.en, { kind: "choose", group: "Fries", name: "Swara burger" })).toBe("Choose fries for Swara burger.");
    expect(issueText(MESSAGES.en, { kind: "notOnMenu" })).toBe("No longer on the menu.");
  });
});

describe("alergénios e etiquetas", () => {
  it("traduz os 14 alergénios vindos do POS e deixa o resto como está", () => {
    expect(translateAllergen("glúten", "en")).toBe("gluten");
    expect(translateAllergen("Frutos de casca rija", "en")).toBe("tree nuts");
    expect(translateAllergen("tremoço", "en")).toBe("lupin");
    expect(translateAllergen("glúten", "pt")).toBe("glúten");
    expect(translateTag("vegetariano", "en")).toBe("vegetarian");
    expect(translateTag("12h–15h · 19h–22h", "en")).toBe("12h–15h · 19h–22h");
  });
});
