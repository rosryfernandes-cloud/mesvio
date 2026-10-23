/**
 * Cor própria de um restaurante na ementa. A cor substitui o verde MESVIO nos botões (texto
 * branco), nos realces (texto da cor sobre o creme) e nos fundos suaves (texto da cor sobre um
 * tom claro derivado). Para não estragar a leitura, só se aceitam cores que passam WCAG AA
 * (4,5:1) nesses três usos.
 */

const HEX = /^#[0-9a-f]{6}$/;
const WHITE = "#ffffff";
const PAPER = "#f7f5f0";
const INK_SOFT = "#4b5b56";
export const AA = 4.5;

export function normalizeHex(input: string): string | null {
  const v = input.trim().toLowerCase();
  const full = /^#?[0-9a-f]{3}$/.test(v) ? `#${v.replace("#", "").replace(/./g, (c) => c + c)}` : v.startsWith("#") ? v : `#${v}`;
  return HEX.test(full) ? full : null;
}

function channels(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Mistura `hex` com branco; `white` = proporção de branco (0–1). */
function tint(hex: string, white: number): string {
  return (
    "#" +
    channels(hex)
      .map((c) => Math.round(c + (255 - c) * white).toString(16).padStart(2, "0"))
      .join("")
  );
}

export type BrandPalette = { brand: string; brandSoft: string };

/**
 * Tons da ementa para uma cor, ou o motivo de recusa. O tom suave é o mais saturado (menos
 * branco) que ainda deixa ler texto na cor e texto secundário por cima.
 */
export function brandPalette(input: string): { ok: true; palette: BrandPalette } | { ok: false; reason: string } {
  const brand = normalizeHex(input);
  if (!brand) return { ok: false, reason: "Use uma cor no formato #RRGGBB." };
  if (contrast(brand, WHITE) < AA || contrast(brand, PAPER) < AA) {
    return { ok: false, reason: "Esta cor é demasiado clara: o texto dos botões ficava ilegível. Escolha um tom mais escuro." };
  }
  for (let white = 0.75; white <= 0.97; white += 0.01) {
    const soft = tint(brand, white);
    if (contrast(brand, soft) >= AA && contrast(INK_SOFT, soft) >= AA) return { ok: true, palette: { brand, brandSoft: soft } };
  }
  return { ok: true, palette: { brand, brandSoft: tint(brand, 0.97) } };
}
