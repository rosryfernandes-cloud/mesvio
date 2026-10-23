// Gera os ficheiros SVG da marca a partir de src/components/brand/logo-geometry.ts.
// Uso: node --experimental-strip-types scripts/brand/gerar-logos.ts (fora do tsconfig: importa com extensão .ts)
import { mkdirSync, writeFileSync } from "node:fs";
import {
  BRAND,
  MARK_DOT,
  MARK_M,
  MARK_STROKE,
  MARK_VIEWBOX,
  STROKE,
  WORDMARK_DOT,
  WORDMARK_I_DOT,
  WORDMARK_PATHS,
  WORDMARK_VIEWBOX,
} from "../../src/components/brand/logo-geometry.ts";

const circle = (c: { cx: number; cy: number; r: number }, fill: string) => `<circle cx="${c.cx}" cy="${c.cy}" r="${c.r}" fill="${fill}"/>`;

function wordmark(letters: string, dot: string, background?: string) {
  const [x, y, w, h] = WORDMARK_VIEWBOX.split(" ").map(Number);
  const pad = background ? 24 : 0;
  const box = `${x - pad} ${y - pad} ${w + pad * 2} ${h + pad * 2}`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}" role="img" aria-label="mesvio">`,
    background ? `<rect x="${x - pad}" y="${y - pad}" width="${w + pad * 2}" height="${h + pad * 2}" rx="20" fill="${background}"/>` : "",
    `<g fill="none" stroke="${letters}" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round">`,
    ...WORDMARK_PATHS.map((d) => `<path d="${d}"/>`),
    `</g>`,
    circle(WORDMARK_I_DOT, letters),
    circle(WORDMARK_DOT, dot),
    `</svg>`,
  ].join("");
}

function mark(bg: string, fg: string) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARK_VIEWBOX}" role="img" aria-label="mesvio">`,
    `<rect width="64" height="64" rx="16" fill="${bg}"/>`,
    `<path d="${MARK_M}" fill="none" stroke="${fg}" stroke-width="${MARK_STROKE}" stroke-linecap="round" stroke-linejoin="round"/>`,
    circle(MARK_DOT, BRAND.mint),
    `</svg>`,
  ].join("");
}

const files: Record<string, string> = {
  "public/brand/mesvio-principal.svg": wordmark(BRAND.ink, BRAND.mint),
  "public/brand/mesvio-negativo.svg": wordmark(BRAND.white, BRAND.mint),
  "public/brand/mesvio-negativo-fundo.svg": wordmark(BRAND.white, BRAND.mint, BRAND.forest),
  "public/brand/mesvio-mono-escuro.svg": wordmark(BRAND.ink, BRAND.ink),
  "public/brand/mesvio-mono-branco.svg": wordmark(BRAND.white, BRAND.white),
  "public/brand/mesvio-icone.svg": mark(BRAND.forest, BRAND.white),
  "public/brand/mesvio-icone-claro.svg": mark(BRAND.cream, BRAND.forest),
  // Favicon servido automaticamente pelo Next.js.
  "src/app/icon.svg": mark(BRAND.forest, BRAND.white),
};

mkdirSync("public/brand", { recursive: true });
for (const [path, svg] of Object.entries(files)) {
  writeFileSync(path, svg + "\n");
  console.log("✓", path);
}
