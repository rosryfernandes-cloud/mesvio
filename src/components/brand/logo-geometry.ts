/**
 * Geometria do logótipo "mesvio." — desenhada à mão com traços (sem fonte), para não depender
 * de licenças de tipografia e ficar igual em qualquer tamanho. Fonte única para o componente
 * <Logo> e para os ficheiros SVG em public/brand (scripts/brand/gerar-logos.ts).
 */
export const STROKE = 9;

/** Palavra "mesvio" (traço, sem preenchimento). viewBox: WORDMARK_VIEWBOX. */
export const WORDMARK_PATHS = [
  // m
  "M4.5 60V34a12 12 0 0 1 24 0v26M28.5 34a12 12 0 0 1 24 0v26",
  // e
  "M71.5 40h31A15.5 15.5 0 1 0 98 51",
  // s
  "M145 26.5c-4-5-10.5-6-15-6-6 0-10.5 3.5-10.5 9 0 11 26 7 26 19.5 0 6-5 10.5-12 10.5-5.5 0-10.5-2.5-13.5-6.5",
  // v
  "M162.5 20l16 40 16-40",
  // i (haste)
  "M212 22v38",
  // o
  "M261.5 40a15.5 15.5 0 1 1-31 0 15.5 15.5 0 1 1 31 0",
];
/** Pingo do i (preenchido, mesma cor das letras). */
export const WORDMARK_I_DOT = { cx: 212, cy: 6, r: 5.5 };
/** Ponto final em verde-menta. */
export const WORDMARK_DOT = { cx: 279, cy: 58.5, r: 6.5 };
export const WORDMARK_VIEWBOX = "0 -2 288 70";

/** Ícone "m." num quadrado arredondado. viewBox: MARK_VIEWBOX. */
export const MARK_VIEWBOX = "0 0 64 64";
export const MARK_M = "M13 44V27.5a8.5 8.5 0 0 1 17 0V44M30 27.5a8.5 8.5 0 0 1 17 0V44";
export const MARK_STROKE = 6.5;
export const MARK_DOT = { cx: 53.5, cy: 41.5, r: 4.5 };

export const BRAND = {
  forest: "#062D25",
  deep: "#102C2B",
  mint: "#91E9C3",
  soft: "#C8E9DA",
  white: "#FFFFFF",
  cream: "#F7F5F0",
  ink: "#10211D",
} as const;
