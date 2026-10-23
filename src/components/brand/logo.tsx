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
} from "./logo-geometry";

/**
 * "light": para fundos claros (letras escuras). "dark": para fundos escuros (letras brancas).
 * "mono": tudo em currentColor (impressão, carimbos, uma só cor).
 */
export type LogoVariant = "light" | "dark" | "mono";

const LETTERS: Record<LogoVariant, string> = { light: BRAND.ink, dark: BRAND.white, mono: "currentColor" };
const DOT: Record<LogoVariant, string> = { light: BRAND.mint, dark: BRAND.mint, mono: "currentColor" };

/** Logótipo "mesvio." — a altura define o tamanho (largura proporcional). */
export function Logo({ variant = "light", className = "h-7 w-auto" }: { variant?: LogoVariant; className?: string }) {
  const letters = LETTERS[variant];
  return (
    <svg viewBox={WORDMARK_VIEWBOX} className={className} role="img" aria-label="mesvio">
      <g fill="none" stroke={letters} strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round">
        {WORDMARK_PATHS.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <circle {...WORDMARK_I_DOT} fill={letters} />
      {/* Em fundo claro o menta sozinho tem pouco contraste: um contorno fino escuro mantém-no visível. */}
      <circle {...WORDMARK_DOT} fill={DOT[variant]} stroke={variant === "light" ? BRAND.forest : "none"} strokeWidth={variant === "light" ? 1.5 : 0} />
    </svg>
  );
}

/** Ícone reduzido "m." (avatar, favicon, app). */
export function LogoMark({ className = "size-9", variant = "dark" }: { className?: string; variant?: "dark" | "light" }) {
  const bg = variant === "dark" ? BRAND.forest : BRAND.cream;
  const fg = variant === "dark" ? BRAND.white : BRAND.forest;
  return (
    <svg viewBox={MARK_VIEWBOX} className={className} role="img" aria-label="mesvio">
      <rect width="64" height="64" rx="16" fill={bg} />
      <path d={MARK_M} fill="none" stroke={fg} strokeWidth={MARK_STROKE} strokeLinecap="round" strokeLinejoin="round" />
      <circle {...MARK_DOT} fill={BRAND.mint} />
    </svg>
  );
}

/** Assinatura discreta da plataforma em páginas de restaurantes ("com mesvio."). */
export function PoweredBy({ className = "" }: { className?: string }) {
  return (
    <a
      href="/"
      className={`inline-flex items-center gap-1.5 text-xs text-ink-soft hover:text-ink ${className}`}
      aria-label="Pedidos digitais com mesvio"
    >
      <span>Pedidos digitais com</span>
      <Logo className="h-3 w-auto" />
    </a>
  );
}
