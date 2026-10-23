import { describe, expect, it } from "vitest";
import { apiErrorText, issueText, LOCALES, MESSAGES, pickLocale } from "./messages";
import { translateAllergen, translateTag } from "./food-terms";

describe("escolha da língua", () => {
  it("usa a escolha guardada antes da língua do telemóvel", () => {
    expect(pickLocale("de", "en-GB,en;q=0.9")).toBe("de");
  });
  it("segue a preferência do telemóvel por ordem de q", () => {
    expect(pickLocale(undefined, "nl-NL,nl;q=0.9,fr;q=0.8,en;q=0.7")).toBe("fr");
    expect(pickLocale(undefined, "en-US")).toBe("en");
    expect(pickLocale(undefined, "es;q=0.5, de;q=0.9")).toBe("de");
  });
  it("português quando nada coincide ou o cookie é inválido", () => {
    expect(pickLocale("xx", "ja-JP,zh;q=0.8")).toBe("pt");
    expect(pickLocale(undefined, null)).toBe("pt");
  });
});

describe("dicionários", () => {
  it("todas as línguas traduzem os mesmos erros da API", () => {
    const keys = Object.keys(MESSAGES.en.apiError).sort();
    for (const l of LOCALES.filter((x) => x !== "pt")) expect(Object.keys(MESSAGES[l].apiError).sort(), l).toEqual(keys);
  });
  it("erros: português usa a mensagem do servidor; as outras línguas, o código", () => {
    const data = { code: "RATE_LIMITED", message: "Demasiados pedidos (servidor)." };
    expect(apiErrorText(MESSAGES.pt, "pt", data, "x")).toBe("Demasiados pedidos (servidor).");
    expect(apiErrorText(MESSAGES.en, "en", data, "x")).toBe(MESSAGES.en.apiError.RATE_LIMITED);
    expect(apiErrorText(MESSAGES.de, "de", { code: "DESCONHECIDO" }, "fallback")).toBe("fallback");
  });
  it("motivos do carrinho na língua do cliente", () => {
    expect(issueText(MESSAGES.en, { kind: "choose", group: "Fries", name: "Swara burger" })).toBe("Choose fries for Swara burger.");
    expect(issueText(MESSAGES.fr, { kind: "notOnMenu" })).toBe("N'est plus à la carte.");
  });
});

describe("alergénios e etiquetas", () => {
  it("traduz os 14 alergénios vindos do POS e deixa o resto como está", () => {
    expect(translateAllergen("glúten", "en")).toBe("gluten");
    expect(translateAllergen("Frutos de casca rija", "de")).toBe("Schalenfrüchte");
    expect(translateAllergen("tremoço", "fr")).toBe("lupin");
    expect(translateAllergen("glúten", "pt")).toBe("glúten");
    expect(translateTag("vegetariano", "es")).toBe("vegetariano");
    expect(translateTag("12h–15h · 19h–22h", "en")).toBe("12h–15h · 19h–22h");
  });
});
