import "server-only";
import { readMenu, type ReadMenuResult, detectPhotoType, type MenuReader } from "./menu-import";
import { extractWebPage } from "./web-menu";
import { safeFetch, type Resolver } from "@/server/security/safe-fetch";

/**
 * Até onde se descarrega um link. Os PDFs de ementa feitos para imprimir passam facilmente dos
 * 4 MB (há vários entre 6 e 9 MB); a leitura com IA aceita PDFs até 32 MB por pedido, já em base64.
 */
const MAX_LINK_BYTES = 20 * 1024 * 1024;
/** Uma imagem enviada à IA não pode passar dos 5 MB. */
const MAX_LINK_IMAGE_BYTES = 5 * 1024 * 1024;

const SEND_FILE_INSTEAD = "Envie o PDF da ementa ou capturas de ecrã da página.";

/**
 * Lê a ementa a partir de um link: uma página do site (texto e fotos dos pratos), um PDF ou uma
 * imagem. O tipo vem dos primeiros bytes, não da extensão nem do que o servidor declara (há PDFs
 * servidos como application/octet-stream ou sem .pdf). Não grava nada: devolve a proposta para rever.
 */
export async function readMenuFromLink(rawUrl: string, deps: { reader?: MenuReader; resolve?: Resolver } = {}): Promise<ReadMenuResult> {
  const url = normalizeMenuUrl(rawUrl);
  const page = await safeFetch(url, { maxBytes: MAX_LINK_BYTES, timeoutMs: 25_000, accept: "text/html,application/xhtml+xml,application/pdf,image/*;q=0.8,*/*;q=0.5", resolve: deps.resolve });
  if (!page.ok) {
    const message =
      page.reason === "TOO_LARGE"
        ? `Este ficheiro é demasiado grande (mais de 20 MB). ${SEND_FILE_INSTEAD}`
        : page.reason === "INVALID_URL" || page.reason === "BLOCKED"
          ? "Este link não é válido. Copie o endereço completo da página da ementa (começa por https://)."
          : page.reason === "HTTP_ERROR"
            ? `O site respondeu com um erro a este link${page.status ? ` (${page.status})` : ""}. Confirme que abre no navegador, ou ${lowerFirst(SEND_FILE_INSTEAD)}`
            : `Não foi possível abrir este link (o site não respondeu a tempo). Confirme que abre no navegador, ou ${lowerFirst(SEND_FILE_INSTEAD)}`;
    return { ok: false, code: "UNREADABLE", message };
  }
  const type = detectPhotoType(page.bytes);
  if (type) {
    if (type !== "application/pdf" && page.bytes.length > MAX_LINK_IMAGE_BYTES) {
      return { ok: false, code: "UNREADABLE", message: "Esta imagem é demasiado grande para ler (mais de 5 MB). Guarde-a e envie-a como foto, que é reduzida antes de ser lida." };
    }
    return readMenu({ pages: [{ mediaType: type, data: page.bytes }] }, deps.reader);
  }
  if (!page.contentType.includes("html") && !page.contentType.startsWith("text/")) {
    return { ok: false, code: "UNREADABLE", message: `Este link não é uma página, um PDF nem uma imagem. ${SEND_FILE_INSTEAD}` };
  }
  const { text, images } = extractWebPage(decodeHtml(page.bytes, page.contentType), page.url);
  if (!looksLikeMenuText(text)) {
    return {
      ok: false,
      code: "UNREADABLE",
      message: `Não há uma ementa em texto nesta página: o site deve mostrá-la em imagens, num PDF ou só depois de carregar. Se a página tiver um botão para o PDF, cole o link desse PDF. Se não, ${lowerFirst(SEND_FILE_INSTEAD)}`,
    };
  }
  return readMenu({ webText: { url: page.url, text, images } }, deps.reader);
}

/** Aceita o link como vem colado: com espaços, sem https:// ou entre <>. */
export function normalizeMenuUrl(raw: string): string {
  const trimmed = raw.trim().replace(/^<|>$/g, "").trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed.replace(/^\/+/, "")}`;
}

/**
 * A página tem texto que possa ser uma ementa? Conta-se o texto que se lê (sem as marcas das fotos e
 * sem as linhas repetidas do menu de navegação). Uma página feita só com JavaScript ou com a ementa
 * em imagens fica com pouco mais do que a navegação e a morada, e lê-la com IA não vale a pena.
 * Há ementas em texto sem preços (só os nomes dos pratos), por isso preços chegam mas não são obrigatórios.
 */
export function looksLikeMenuText(text: string): boolean {
  const lines = [...new Set(text.split("\n").map((l) => l.replace(/\[FOTO [^\]]*\]/g, "").trim()).filter(Boolean))];
  const readable = lines.join("\n");
  const prices = readable.match(/€|\beur\b|\b\d{1,3}[.,]\d{2}\b/gi) ?? [];
  if (prices.length >= 3 && readable.length >= 80) return true;
  return readable.split(/\s+/).filter((w) => /\p{L}{2,}/u.test(w)).length >= 120;
}

/** Texto da página no conjunto de caracteres certo (há sites portugueses ainda em ISO-8859-1). */
export function decodeHtml(bytes: Buffer, contentType: string): string {
  const head = bytes.toString("latin1", 0, Math.min(bytes.length, 4096));
  const charset = (contentType.match(/charset=["']?([\w-]+)/i)?.[1] ?? head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] ?? "utf-8").toLowerCase();
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return bytes.toString("utf8");
  }
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
