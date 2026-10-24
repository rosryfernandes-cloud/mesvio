import { createContext, useContext } from "react";
import { TEXT } from "../script";

/**
 * O espaço mostrado nos ecrãs (ementa, confirmação, painel e autocolante). Os valores por omissão
 * são os do anúncio original de 30 s; as campanhas v2 trocam-nos com <PlaceContext.Provider>.
 */
export interface PlaceInfo {
  restaurant: string;
  /** "Mesa 12", "Cama 12"… */
  table: string;
  area: string;
  /** Etiqueta no canto do painel. */
  panelBadge: string;
  /** Pedidos já no painel (número, lugar, artigos, total). */
  oldOrders: [string, string, string, string][];
}

export const DEFAULT_PLACE: PlaceInfo = {
  restaurant: TEXT.restaurant,
  table: TEXT.table,
  area: "Esplanada",
  panelBadge: "● POS ligado",
  oldOrders: [
    ["#013", "Mesa 4", "2× Imperial · 1× Tosta mista", "11,50 €"],
    ["#012", "Cama 3", "1× Bowl de açaí", "9,50 €"],
    ["#011", "Mesa 7", "3× Limonada · 1× Couvert", "20,50 €"],
  ],
};

export const PlaceContext = createContext<PlaceInfo>(DEFAULT_PLACE);
export const usePlace = () => useContext(PlaceContext);

/** Artigos pedidos (quantidades da ementa) → linhas e total, no formato da app. */
export function orderLines(qty: { burger: number; mojito: number }) {
  const lines: [string, string][] = [];
  if (qty.burger) lines.push([`${qty.burger}× Hambúrguer da casa`, euros(qty.burger * 1400)]);
  if (qty.mojito) lines.push([`${qty.mojito}× Mojito de maracujá`, euros(qty.mojito * 950)]);
  return { lines, total: euros(qty.burger * 1400 + qty.mojito * 950) };
}

export const euros = (cents: number) => `${(cents / 100).toFixed(2).replace(".", ",")} €`;
