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

/** Motivo de recusa em forma estruturada, para o telemóvel o mostrar na língua do cliente. */
export type SelectionIssue =
  | { kind: "soldOut"; name: string }
  | { kind: "repeated"; name: string }
  | { kind: "invalid"; name: string }
  | { kind: "choose"; group: string; name: string }
  | { kind: "max"; max: number; group: string }
  | { kind: "notOnMenu" };

export type SelectionResult =
  | { ok: true; unitPriceCents: number; modifierNames: string[] }
  | { ok: false; reason: string; issue: SelectionIssue };

export function priceSelection(product: PriceableProduct, modifierRefs: string[]): SelectionResult {
  if (!product.available) return { ok: false, reason: `${product.name} está esgotado.`, issue: { kind: "soldOut", name: product.name } };
  if (new Set(modifierRefs).size !== modifierRefs.length) {
    return { ok: false, reason: `Opção repetida em ${product.name}.`, issue: { kind: "repeated", name: product.name } };
  }

  const known = new Set(product.modifierGroups.flatMap((g) => g.modifiers.map((m) => m.posModifierRef)));
  const unknown = modifierRefs.find((r) => !known.has(r));
  if (unknown) return { ok: false, reason: `Opção inválida para ${product.name}.`, issue: { kind: "invalid", name: product.name } };

  let unitPriceCents = product.priceCents;
  const modifierNames: string[] = [];
  for (const group of product.modifierGroups) {
    const chosen = group.modifiers.filter((m) => modifierRefs.includes(m.posModifierRef));
    if (chosen.length < group.minSelect) {
      return {
        ok: false,
        reason: `Escolha ${group.name.toLowerCase()} para ${product.name}.`,
        issue: { kind: "choose", group: group.name, name: product.name },
      };
    }
    if (chosen.length > group.maxSelect) {
      return {
        ok: false,
        reason: `No máximo ${group.maxSelect} em ${group.name.toLowerCase()}.`,
        issue: { kind: "max", max: group.maxSelect, group: group.name },
      };
    }
    for (const m of chosen) {
      if (!m.available) return { ok: false, reason: `${m.name} está esgotado.`, issue: { kind: "soldOut", name: m.name } };
      unitPriceCents += m.priceDeltaCents;
      modifierNames.push(m.name);
    }
  }
  return { ok: true, unitPriceCents, modifierNames };
}
