import { describe, expect, it } from "vitest";
import { apiErrorText, issueText, MESSAGES, pickLocale } from "./messages";
import { translateAllergen, translateTag } from "./food-terms";

describe("escolha da língua", () => {
  it("usa a escolha guardada antes da língua do telemóvel", () => {
    expect(pickLocale("pt", "en-GB,en;q=0.9")).toBe("pt");
    expect(pickLocale("en", "pt-PT")).toBe("en");
  });
  it("usa a primeira língua do telemóvel que a MESVIO tem; nas outras, inglês", () => {
    expect(pickLocale(undefined, "pt-PT,pt;q=0.9")).toBe("pt");
    expect(pickLocale(undefined, "pt-BR")).toBe("pt");
    expect(pickLocale(undefined, "de-DE,de;q=0.9,en;q=0.8")).toBe("de");
    expect(pickLocale(undefined, "es-ES")).toBe("es");
    expect(pickLocale(undefined, "fr-FR,fr;q=0.9")).toBe("fr");
    expect(pickLocale(undefined, "es;q=0.5, pt;q=0.9")).toBe("pt");
    expect(pickLocale(undefined, "nl-NL,nl;q=0.9,de;q=0.8")).toBe("de");
    expect(pickLocale(undefined, "nl-NL")).toBe("en");
  });
  it("português sem preferência; a escolha guardada vale em qualquer língua", () => {
    expect(pickLocale(undefined, null)).toBe("pt");
    expect(pickLocale("es", "pt-PT")).toBe("es");
    expect(pickLocale("xx", "fr-FR")).toBe("fr");
  });
});

describe("dicionários", () => {
  it("todas as línguas têm os códigos de erro do inglês", () => {
    for (const t of [MESSAGES.es, MESSAGES.fr, MESSAGES.de]) expect(Object.keys(t.apiError).sort()).toEqual(Object.keys(MESSAGES.en.apiError).sort());
  });
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
    expect(translateAllergen("amendoins", "en")).toBe("peanuts");
    expect(translateAllergen("leite", "es")).toBe("leche");
    expect(translateAllergen("ovos", "fr")).toBe("œufs");
    expect(translateAllergen("sulfitos", "de")).toBe("Sulfite");
    expect(translateTag("sem glúten", "de")).toBe("glutenfrei");
    expect(translateTag("vegetariano", "en")).toBe("vegetarian");
    expect(translateTag("12h–15h · 19h–22h", "en")).toBe("12h–15h · 19h–22h");
  });
});
