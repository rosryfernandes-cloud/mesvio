import type { Locale } from "./messages";

/**
 * Alergénios (os 14 do Regulamento (UE) 1169/2011) e etiquetas habituais, tal como vêm do POS
 * em português, traduzidos automaticamente. O que não estiver aqui aparece como vem.
 */
type Terms = Record<Exclude<Locale, "pt">, string>;

const ALLERGENS: Record<string, Terms> = {
  "glúten": { en: "gluten", es: "gluten", fr: "gluten", de: "Gluten" },
  "crustáceos": { en: "crustaceans", es: "crustáceos", fr: "crustacés", de: "Krebstiere" },
  "ovos": { en: "eggs", es: "huevos", fr: "œufs", de: "Eier" },
  "peixe": { en: "fish", es: "pescado", fr: "poisson", de: "Fisch" },
  "amendoim": { en: "peanuts", es: "cacahuetes", fr: "arachides", de: "Erdnüsse" },
  "soja": { en: "soy", es: "soja", fr: "soja", de: "Soja" },
  "leite": { en: "milk", es: "leche", fr: "lait", de: "Milch" },
  "frutos de casca rija": { en: "tree nuts", es: "frutos de cáscara", fr: "fruits à coque", de: "Schalenfrüchte" },
  "aipo": { en: "celery", es: "apio", fr: "céleri", de: "Sellerie" },
  "mostarda": { en: "mustard", es: "mostaza", fr: "moutarde", de: "Senf" },
  "sésamo": { en: "sesame", es: "sésamo", fr: "sésame", de: "Sesam" },
  "sulfitos": { en: "sulphites", es: "sulfitos", fr: "sulfites", de: "Sulfite" },
  "tremoço": { en: "lupin", es: "altramuces", fr: "lupin", de: "Lupinen" },
  "moluscos": { en: "molluscs", es: "moluscos", fr: "mollusques", de: "Weichtiere" },
};

const TAGS: Record<string, Terms> = {
  vegetariano: { en: "vegetarian", es: "vegetariano", fr: "végétarien", de: "vegetarisch" },
  vegano: { en: "vegan", es: "vegano", fr: "végan", de: "vegan" },
  "sem glúten": { en: "gluten-free", es: "sin gluten", fr: "sans gluten", de: "glutenfrei" },
  "sem lactose": { en: "lactose-free", es: "sin lactosa", fr: "sans lactose", de: "laktosefrei" },
  picante: { en: "spicy", es: "picante", fr: "épicé", de: "scharf" },
  novo: { en: "new", es: "nuevo", fr: "nouveau", de: "neu" },
  "sugestão do chef": { en: "chef's choice", es: "sugerencia del chef", fr: "suggestion du chef", de: "Empfehlung des Küchenchefs" },
  "sem álcool": { en: "alcohol-free", es: "sin alcohol", fr: "sans alcool", de: "alkoholfrei" },
};

function lookup(table: Record<string, Terms>, value: string, locale: Locale): string {
  if (locale === "pt") return value;
  return table[value.trim().toLowerCase()]?.[locale] ?? value;
}

export const translateAllergen = (value: string, locale: Locale) => lookup(ALLERGENS, value, locale);
export const translateTag = (value: string, locale: Locale) => lookup(TAGS, value, locale);
