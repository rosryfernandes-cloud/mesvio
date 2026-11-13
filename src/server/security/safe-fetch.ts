import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Ir buscar um link dado por um utilizador (ex.: o site do restaurante) sem abrir a porta a
 * ataques SSRF: só http(s) nas portas normais, nunca endereços internos (rede local, loopback,
 * metadados da cloud), redirecionamentos verificados um a um, tamanho e tempo limitados.
 */
export type SafeFetchResult = { ok: true; url: string; contentType: string; bytes: Buffer } | { ok: false; reason: "INVALID_URL" | "BLOCKED" | "TOO_LARGE" | "HTTP_ERROR" | "NETWORK" };

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((n, part) => (n << 8) + Number(part), 0) >>> 0;
}

const V4_BLOCKED: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

/** Endereço que não é da internet pública (não se pode visitar a partir do servidor). */
export function isPrivateAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) {
    const n = ipv4ToInt(ip);
    return V4_BLOCKED.some(([base, bits]) => (n >>> (32 - bits)) === (ipv4ToInt(base) >>> (32 - bits)));
  }
  if (version === 6) {
    const v = ip.toLowerCase();
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    if (v === "::" || v === "::1") return true;
    const first = parseInt(v.split(":")[0] || "0", 16);
    return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80 || (first & 0xff00) === 0xff00 || v.startsWith("64:ff9b:") || v.startsWith("2001:db8:");
  }
  return true;
}

export type Resolver = (host: string) => Promise<string[]>;
const dnsResolver: Resolver = async (host) => (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);

/** O link pode ser visitado? (protocolo, porta, nome e todos os endereços para onde aponta). */
export async function checkPublicUrl(raw: string, resolve: Resolver = dnsResolver): Promise<URL | null> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== "80" && url.port !== "443") return null;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) return null;
  const addresses = isIP(host) ? [host] : await resolve(host).catch(() => []);
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) return null;
  return url;
}

export async function safeFetch(
  raw: string,
  { maxBytes, timeoutMs = 10_000, accept = "*/*", resolve = dnsResolver }: { maxBytes: number; timeoutMs?: number; accept?: string; resolve?: Resolver },
): Promise<SafeFetchResult> {
  let current = raw;
  const deadline = AbortSignal.timeout(timeoutMs);
  for (let hop = 0; hop <= 3; hop++) {
    const url = await checkPublicUrl(current, resolve);
    if (!url) return { ok: false, reason: hop === 0 && !/^https?:\/\//i.test(current) ? "INVALID_URL" : "BLOCKED" };
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: "manual",
        signal: deadline,
        headers: { Accept: accept, "User-Agent": "Mozilla/5.0 (compatible; MESVIO-menu-import/1.0)" },
      });
    } catch {
      return { ok: false, reason: "NETWORK" };
    }
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return { ok: false, reason: "HTTP_ERROR" };
      current = new URL(location, url).toString();
      continue;
    }
    if (!res.ok || !res.body) return { ok: false, reason: "HTTP_ERROR" };
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > maxBytes) return { ok: false, reason: "TOO_LARGE" };
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = res.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > maxBytes) {
          await reader.cancel().catch(() => undefined);
          return { ok: false, reason: "TOO_LARGE" };
        }
        chunks.push(value);
      }
    } catch {
      return { ok: false, reason: "NETWORK" };
    }
    return { ok: true, url: url.toString(), contentType: (res.headers.get("content-type") ?? "").toLowerCase(), bytes: Buffer.concat(chunks) };
  }
  return { ok: false, reason: "BLOCKED" };
}
