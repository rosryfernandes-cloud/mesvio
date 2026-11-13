/**
 * Página web de um restaurante → texto para a leitura da ementa, com as fotos marcadas no sítio
 * onde aparecem ([FOTO 3]), para cada prato poder ficar com a sua foto.
 */
export const MAX_WEB_TEXT = 60_000;
export const MAX_WEB_IMAGES = 120;

export interface WebPage {
  text: string;
  /** id → URL absoluto da imagem (só http(s), sem SVG nem ícones pequenos). */
  images: Map<string, string>;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", euro: "€", ccedil: "ç", atilde: "ã", otilde: "õ", aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", agrave: "à", ecirc: "ê", ocirc: "ô" };

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1));
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const attr = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"))?.slice(2).find((v) => v !== undefined);

export function extractWebPage(html: string, baseUrl: string): WebPage {
  const images = new Map<string, string>();
  const seen = new Map<string, string>();
  let body = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe|head)\b[\s\S]*?<\/\1>/gi, " ");

  body = body.replace(/<img\b[^>]*>/gi, (tag) => {
    const srcset = attr(tag, "data-srcset") ?? attr(tag, "srcset");
    const src = attr(tag, "data-src") ?? attr(tag, "data-lazy-src") ?? attr(tag, "src") ?? srcset?.split(",").pop()?.trim().split(/\s+/)[0];
    if (!src || src.startsWith("data:")) return " ";
    const width = Number(attr(tag, "width") ?? 0);
    const height = Number(attr(tag, "height") ?? 0);
    if ((width && width < 80) || (height && height < 80)) return " ";
    let absolute: string;
    try {
      const u = new URL(decode(src), baseUrl);
      if (u.protocol !== "https:" && u.protocol !== "http:") return " ";
      if (/\.svg($|\?)/i.test(u.pathname) || /(logo|icon|favicon|sprite|avatar|flag)/i.test(u.pathname)) return " ";
      absolute = u.toString();
    } catch {
      return " ";
    }
    let id = seen.get(absolute);
    if (!id) {
      if (images.size >= MAX_WEB_IMAGES) return " ";
      id = String(images.size + 1);
      seen.set(absolute, id);
      images.set(id, absolute);
    }
    const alt = decode(attr(tag, "alt") ?? "").trim().slice(0, 80);
    return ` [FOTO ${id}${alt ? `: ${alt}` : ""}] `;
  });

  const text = decode(
    body
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article)\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\f\v\r]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_WEB_TEXT);
  return { text, images };
}
