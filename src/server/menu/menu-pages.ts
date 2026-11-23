import "server-only";
import { inflateSync } from "node:zlib";
import sharp from "sharp";
import type { MenuPhoto } from "./menu-import";

/**
 * Prepara as páginas antes da leitura:
 * - um PDF que é só uma imagem (sem texto, como uma ementa exportada do Canva) passa a ser essa imagem;
 * - uma imagem muito comprida (ementa numa só página ou captura de ecrã de telemóvel inteira) é cortada
 *   em pedaços, porque a leitura reduz cada imagem a ~1.500 px e as letras deixavam de se ler.
 * Se algo falhar, a página segue como veio.
 */

/** Uma imagem com mais do que esta proporção (altura/largura) é cortada. */
const TALL_RATIO = 2.2;
/** Altura de cada pedaço, em proporção da largura (perto de uma folha A4). */
const SLICE_RATIO = 1.4;
/** Os pedaços repetem um pouco do anterior, para nenhuma linha ficar cortada a meio. */
const OVERLAP = 0.04;
/** Limite de imagens que seguem para a leitura (custo e tamanho do pedido). */
export const MAX_PREPARED_PAGES = 24;

/** As imagens JPEG de um PDF sem texto; null se o PDF tiver texto ou não for só imagens. */
export function jpegsOfImagePdf(pdf: Buffer): Buffer[] | null {
  const text = pdf.toString("latin1");
  if (/\/Font\b/.test(text) || !/\/DCTDecode\b/.test(text)) return null;
  const out: Buffer[] = [];
  let at = 0;
  for (;;) {
    const filter = text.indexOf("/DCTDecode", at);
    if (filter < 0) break;
    const dictStart = text.lastIndexOf("<<", filter);
    const stream = text.indexOf("stream", filter);
    if (stream < 0 || dictStart < 0) break;
    const dict = text.slice(dictStart, stream);
    let start = stream + "stream".length;
    if (text[start] === "\r") start++;
    if (text[start] === "\n") start++;
    const length = /\/Length\s+(\d+)\b(?!\s+\d+\s+R)/.exec(dict);
    const end = length ? start + Number(length[1]) : text.indexOf("endstream", start);
    at = Math.max(end, start);
    if (end <= start || end > pdf.length) continue;
    let data: Buffer = pdf.subarray(start, end);
    // Algumas ferramentas comprimem o JPEG outra vez ([/FlateDecode /DCTDecode]).
    if (/\/FlateDecode/.test(dict)) {
      try {
        data = inflateSync(data);
      } catch {
        continue;
      }
    }
    const eoi = data.lastIndexOf(Buffer.from([0xff, 0xd9]));
    if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff && eoi > 0) out.push(data.subarray(0, eoi + 2));
  }
  return out.length > 0 ? out : null;
}

/** Corta uma imagem comprida em pedaços legíveis; devolve a própria imagem se não for comprida. */
export async function sliceTallImage(page: MenuPhoto): Promise<MenuPhoto[]> {
  const meta = await sharp(page.data).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (!w || !h || h / w <= TALL_RATIO) return [page];
  const slice = Math.round(w * SLICE_RATIO);
  const step = Math.round(slice * (1 - OVERLAP));
  const out: MenuPhoto[] = [];
  for (let top = 0; top < h && out.length < MAX_PREPARED_PAGES; top += step) {
    const height = Math.min(slice, h - top);
    if (height < w * 0.15 && out.length > 0) break; // sobra só uma tira fina, já incluída no pedaço anterior
    const data = await sharp(page.data).extract({ left: 0, top, width: w, height }).resize({ width: Math.min(w, 1200) }).jpeg({ quality: 82 }).toBuffer();
    out.push({ mediaType: "image/jpeg", data });
    if (top + height >= h) break;
  }
  return out;
}

export async function prepareMenuPages(pages: MenuPhoto[]): Promise<MenuPhoto[]> {
  const out: MenuPhoto[] = [];
  for (const page of pages) {
    try {
      const images = page.mediaType === "application/pdf" ? jpegsOfImagePdf(page.data) : null;
      const expanded: MenuPhoto[] = images ? images.map((data) => ({ mediaType: "image/jpeg" as const, data })) : [page];
      for (const p of expanded) out.push(...(p.mediaType === "application/pdf" ? [p] : await sliceTallImage(p)));
    } catch (error) {
      console.warn("[menu-import] não foi possível preparar uma página; segue como veio", error instanceof Error ? error.message : error);
      out.push(page);
    }
  }
  return out.slice(0, MAX_PREPARED_PAGES);
}
