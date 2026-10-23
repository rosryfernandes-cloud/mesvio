import type { Locale } from "./messages";

/**
 * Alergénios (os 14 do Regulamento (UE) 1169/2011) e etiquetas habituais, tal como vêm do POS
 * em português, traduzidos automaticamente para inglês. O que não estiver aqui aparece como vem.
 */
const ALLERGENS: Record<string, string> = {
  "glúten": "gluten",
  "crustáceos": "crustaceans",
  "ovos": "eggs",
  "peixe": "fish",
  "amendoim": "peanuts",
  "soja": "soy",
  "leite": "milk",
  "frutos de casca rija": "tree nuts",
  "aipo": "celery",
  "mostarda": "mustard",
  "sésamo": "sesame",
  "sulfitos": "sulphites",
  "tremoço": "lupin",
  "moluscos": "molluscs",
};

const TAGS: Record<string, string> = {
  vegetariano: "vegetarian",
  vegano: "vegan",
  "sem glúten": "gluten-free",
  "sem lactose": "lactose-free",
  picante: "spicy",
  novo: "new",
  "sugestão do chef": "chef's choice",
  "sem álcool": "alcohol-free",
};

function lookup(table: Record<string, string>, value: string, locale: Locale): string {
  if (locale === "pt") return value;
  return table[value.trim().toLowerCase()] ?? value;
}

export const translateAllergen = (value: string, locale: Locale) => lookup(ALLERGENS, value, locale);
export const translateTag = (value: string, locale: Locale) => lookup(TAGS, value, locale);
