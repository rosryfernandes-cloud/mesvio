import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";
// HSTS e "upgrade-insecure-requests" só com o domínio público em https: em testes locais (http no
// IP da rede, teste de carga em localhost) partiam o site.
const httpsSite = (process.env.NEXT_PUBLIC_APP_URL ?? "").startsWith("https://");

/**
 * Content-Security-Policy: o browser só executa e liga ao próprio site. Imagens podem vir de
 * qualquer endereço https (fotografias do POS, logótipos dos restaurantes). Sem iframes de
 * terceiros a embeber o site (clickjacking), sem <object>, sem formulários para fora.
 * 'unsafe-inline' nos scripts é exigido pelo Next sem nonces; passar a nonces obriga a render
 * dinâmico de todas as páginas (fica como melhoria: docs/15).
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self'",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  ...(httpsSite ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self)" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // 2 anos; sem "preload" por agora (difícil de desfazer se o domínio mudar).
  ...(httpsSite && !isDev ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // PGlite carrega ficheiros .wasm/.data a partir do pacote: não o empacotar.
  serverExternalPackages: ["@electric-sql/pglite"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
