import "server-only";
import { readMenu, type ReadMenuResult, detectPhotoType, type MenuReader } from "./menu-import";
import { extractWebPage } from "./web-menu";
import { safeFetch, type Resolver } from "@/server/security/safe-fetch";

/** Uma página web ou PDF de ementa pode ser grande; acima disto pede-se capturas de ecrã. */
const MAX_LINK_BYTES = 4 * 1024 * 1024;

/**
 * Lê a ementa a partir de um link dado pelo dono: uma página do site (texto e fotos dos pratos), um
 * PDF ou uma imagem. Não grava nada: devolve a proposta para rever, como a leitura por fotos.
 */
export async function readMenuFromLink(rawUrl: string, deps: { reader?: MenuReader; resolve?: Resolver } = {}): Promise<ReadMenuResult> {
  const url = /^https?:\/\//i.test(rawUrl.trim()) ? rawUrl.trim() : `https://${rawUrl.trim()}`;
  const page = await safeFetch(url, { maxBytes: MAX_LINK_BYTES, timeoutMs: 15_000, accept: "text/html,application/pdf,image/*;q=0.8,*/*;q=0.5", resolve: deps.resolve });
  if (!page.ok) {
    const message =
      page.reason === "TOO_LARGE"
        ? "Esta página é demasiado grande. Tire capturas de ecrã da ementa e envie-as como fotos."
        : page.reason === "INVALID_URL" || page.reason === "BLOCKED"
          ? "Este link não é válido. Copie o endereço completo da página da ementa (começa por https://)."
          : "Não foi possível abrir este link. Confirme que a página abre no telemóvel, ou envie capturas de ecrã.";
    return { ok: false, code: "UNREADABLE", message };
  }
  const type = detectPhotoType(page.bytes);
  if (type) return readMenu({ pages: [{ mediaType: type, data: page.bytes }] }, deps.reader);
  if (!page.contentType.includes("html") && !page.contentType.startsWith("text/")) {
    return { ok: false, code: "UNREADABLE", message: "Este link não é uma página, um PDF nem uma imagem. Envie capturas de ecrã da ementa." };
  }
  const { text, images } = extractWebPage(page.bytes.toString("utf8"), page.url);
  if (text.length < 80) {
    return { ok: false, code: "UNREADABLE", message: "Esta página quase não tem texto (a ementa deve estar em imagens). Tire capturas de ecrã e envie-as como fotos." };
  }
  return readMenu({ webText: { url: page.url, text, images } }, deps.reader);
}
