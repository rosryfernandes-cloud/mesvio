import "server-only";
import QRCode from "qrcode";

/**
 * SVG do QR Code de uma mesa. Correção de erros "M" (15%): aguenta riscos e
 * reflexos de plastificação sem tornar o código demasiado denso para impressão pequena.
 */
export function tableQrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 1, color: { dark: "#1c1917", light: "#ffffff" } });
}

/**
 * Base dos URLs gravados em QR/NFC: `NEXT_PUBLIC_APP_URL` quando definida, senão o
 * endereço por onde esta página foi aberta (útil para testar com telemóveis na rede local).
 */
export function resolvePublicBaseUrl(envUrl: string | undefined, host: string | null, proto: string | null): string {
  if (envUrl?.trim()) return envUrl.trim().replace(/\/+$/, "");
  return `${proto ?? "http"}://${host ?? "localhost:3000"}`;
}

export function isLocalOnlyUrl(base: string): boolean {
  try {
    const h = new URL(base).hostname;
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h.endsWith(".localhost");
  } catch {
    return true;
  }
}
