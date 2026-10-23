/**
 * Regras de escolha de variantes/extras e cálculo do preço unitário.
 * Partilhado entre cliente (pré-visualização) e servidor (decisão final). O servidor
 * corre sempre esta validação sobre o catálogo do POS — nunca confia no cliente.
 */
import type { PosModifierGroup } from "@/server/pos/types";

export interface PriceableProduct {
  name: string;
  priceCents: number;
  available: boolean;
  modifierGroups: PosModifierGroup[];
}

export const ORDER_LIMITS = {
  maxLines: 30,
  maxQuantityPerLine: 20,
  maxNotesLength: 200,
} as const;

export type SelectionResult =
  | { ok: true; unitPriceCents: number; modifierNames: string[] }
  | { ok: false; reason: string };

export function priceSelection(product: PriceableProduct, modifierRefs: string[]): SelectionResult {
  if (!product.available) return { ok: false, reason: `${product.name} está esgotado.` };
  if (new Set(modifierRefs).size !== modifierRefs.length) {
    return { ok: false, reason: `Opção repetida em ${product.name}.` };
  }

  const known = new Set(product.modifierGroups.flatMap((g) => g.modifiers.map((m) => m.posModifierRef)));
  const unknown = modifierRefs.find((r) => !known.has(r));
  if (unknown) return { ok: false, reason: `Opção inválida para ${product.name}.` };

  let unitPriceCents = product.priceCents;
  const modifierNames: string[] = [];
  for (const group of product.modifierGroups) {
    const chosen = group.modifiers.filter((m) => modifierRefs.includes(m.posModifierRef));
    if (chosen.length < group.minSelect) {
      return { ok: false, reason: `Escolha ${group.name.toLowerCase()} para ${product.name}.` };
    }
    if (chosen.length > group.maxSelect) {
      return { ok: false, reason: `No máximo ${group.maxSelect} em ${group.name.toLowerCase()}.` };
    }
    for (const m of chosen) {
      if (!m.available) return { ok: false, reason: `${m.name} está esgotado.` };
      unitPriceCents += m.priceDeltaCents;
      modifierNames.push(m.name);
    }
  }
  return { ok: true, unitPriceCents, modifierNames };
}
