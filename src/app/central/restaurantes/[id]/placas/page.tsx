import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { diningTables, establishments } from "@/server/db/schema";
import { requirePlatformAdmin } from "@/server/platform/page-guard";
import { tableUrl } from "@/server/tables/table-token";
import { isLocalOnlyUrl, resolvePublicBaseUrl } from "@/server/tables/table-qr";
import { effectiveOrderingMode, planAllowsOrdering, planAllowsPayments, type Plan } from "@/lib/plan";
import { PrintButton } from "@/app/qr/print-button";
import { PlateBranding } from "@/components/central/plate-branding";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Placas para imprimir", robots: { index: false, follow: false } };

/**
 * Placas para a gráfica (só no painel central: a MESVIO trata das placas de cada cliente): uma página por lugar, no tamanho exato do formato, com o QR
 * desse lugar, o logótipo e a cor do restaurante, faixa menta com o nome do lugar, onda e "com
 * mesvio." no fundo (folha de palmeira se houver camas). "Imprimir" → "Guardar como PDF" e envia-se
 * o PDF à gráfica (impressão com dados variáveis: cada página é uma placa). Medidas pensadas para
 * acrílico com impressão UV no verso; o QR tem sempre pelo menos 1/10 da distância de leitura.
 */
const FORMATS = {
  a6: { label: "Placa de mesa", size: "A6 · 10,5 × 14,8 cm", w: 105, h: 148, qr: 50, who: "todos" },
  etiqueta: { label: "Etiqueta para camas", size: "10 × 15 cm, 2 furos", w: 100, h: 150, qr: 52, who: "camas" },
  balcao: { label: "Placa de balcão", size: "21 × 10 cm", w: 210, h: 100, qr: 64, who: "todos" },
  a4: { label: "Placa de entrada", size: "A4 · 21 × 29,7 cm", w: 210, h: 297, qr: 100, who: "todos" },
  autocolante: { label: "Autocolante redondo", size: "Ø 8 cm", w: 80, h: 80, qr: 42, who: "todos" },
  // Placa igual para todos os lugares, com um quadrado vazio onde se cola o autocolante do QR (troca-se o
  // QR sem refazer a placa: ver "Novo QR Code" nos QR Codes do restaurante). Com ?demo=1 sai sem a marca do restaurante.
  base: { label: "Placa base sem QR", size: "A6, quadrado de 5 cm", w: 105, h: 148, qr: 50, who: "todos" },
  autocolantes: { label: "Folha de autocolantes QR", size: "A4, 20 de 4,8 cm", w: 210, h: 297, qr: 48, who: "todos" },
} as const;
type Format = keyof typeof FORMATS;

const WHO = { todos: "Todos os lugares", mesas: "Só mesas", camas: "Só camas" } as const;
type Who = keyof typeof WHO;

/**
 * Desenhos das placas (mesmo QR e textos, aparência diferente). Os três primeiros usam a cor do
 * restaurante; praia, azulejo e noite têm cores próprias; formas mistura a cor do restaurante com branco.
 */
const STYLES = {
  marca: { label: "Cor do restaurante", hint: "Fundo na cor da casa, onda menta" },
  claro: { label: "Fundo claro", hint: "Branco com detalhes na cor da casa" },
  formas: { label: "Formas", hint: "Círculos suaves na cor da casa" },
  praia: { label: "Praia", hint: "Areia, sol e ondas" },
  azulejo: { label: "Azulejo", hint: "Tasca portuguesa, azul e creme" },
  noite: { label: "Noite", hint: "Escuro com moldura dourada" },
  marinheiro: { label: "Marinheiro", hint: "Riscas azuis e âncora, praia e peixe" },
  tasca: { label: "Tasca", hint: "Quadrados vermelhos e brancos" },
  madeira: { label: "Madeira", hint: "Tons quentes, tascas e churrasqueiras" },
  marmore: { label: "Mármore", hint: "Branco com veios e bronze, mais fino" },
  vinho: { label: "Vinho", hint: "Bordeaux e uvas, garrafeiras e wine bars" },
  neon: { label: "Néon", hint: "Fundo escuro com letras a brilhar, bares" },
  minimal: { label: "Minimal", hint: "Preto e branco, impressão mais barata" },
} as const;
type Style = keyof typeof STYLES;
/** Decoração de fundo e linha por cima da assinatura. */
type Deco = "palm" | "sun" | "tiles" | "frame" | "blobs" | "stripes" | "checks" | "grain" | "grapes" | "glow" | "none";
type Line = "wave" | "waves" | "none";
type Theme = { bg: string; fg: string; accent: string; pillBg: string; pillFg: string; mark: string; dot: string; outline: boolean; deco: Deco; line: Line; tint?: string; glow?: string };

/** Mistura uma cor hexadecimal com branco (t = 0 fica igual, t = 1 fica branco). */
function tintOf(hex: string, t: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#EEF2EF";
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(c + (255 - c) * t));
  return `#${ch.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

function themeFor(style: Style, brand: string): Theme {
  switch (style) {
    case "claro":
      return { bg: "#FFFFFF", fg: brand, accent: brand, pillBg: brand, pillFg: "#FFFFFF", mark: brand, dot: MINT, outline: true, deco: "palm", line: "wave" };
    case "formas":
      return { bg: "#FFFFFF", fg: INK, accent: brand, pillBg: brand, pillFg: "#FFFFFF", mark: INK, dot: brand, outline: true, deco: "blobs", line: "none", tint: tintOf(brand, 0.78) };
    case "praia":
      return { bg: "#F6EBDD", fg: "#12485A", accent: "#2A9DB5", pillBg: "#EE7F55", pillFg: "#FFFFFF", mark: "#12485A", dot: "#EE7F55", outline: false, deco: "sun", line: "waves" };
    case "azulejo":
      return { bg: "#FBF7EF", fg: "#1E3F8A", accent: "#1E3F8A", pillBg: "#1E3F8A", pillFg: "#FBF7EF", mark: "#1E3F8A", dot: "#1E3F8A", outline: true, deco: "tiles", line: "none" };
    case "noite":
      return { bg: "#15171A", fg: "#F3EBDD", accent: "#C9A45C", pillBg: "#C9A45C", pillFg: "#15171A", mark: "#F3EBDD", dot: "#C9A45C", outline: false, deco: "frame", line: "none" };
    case "marinheiro":
      return { bg: "#FFFFFF", fg: "#13315C", accent: "#13315C", pillBg: "#13315C", pillFg: "#FFFFFF", mark: "#13315C", dot: "#D7263D", outline: true, deco: "stripes", line: "none" };
    case "tasca":
      return { bg: "#FFFDF8", fg: "#8E1020", accent: "#C8102E", pillBg: "#C8102E", pillFg: "#FFFFFF", mark: "#8E1020", dot: "#C8102E", outline: true, deco: "checks", line: "none" };
    case "madeira":
      return {
        bg: "repeating-linear-gradient(176deg, #7A4E2D 0mm, #83552F 2.2mm, #74492A 4.6mm, #7E5130 7mm)",
        fg: "#F6E7CF",
        accent: "#E9B872",
        pillBg: "#E9B872",
        pillFg: "#3B2414",
        mark: "#F6E7CF",
        dot: "#E9B872",
        outline: false,
        deco: "grain",
        line: "none",
      };
    case "marmore":
      return {
        bg: "linear-gradient(118deg, transparent 38%, rgba(140,140,135,0.22) 39%, transparent 41.5%), linear-gradient(64deg, transparent 60%, rgba(140,140,135,0.16) 61%, transparent 63.5%), linear-gradient(150deg, transparent 22%, rgba(140,140,135,0.12) 23%, transparent 24.5%), linear-gradient(160deg, #F8F8F6, #ECECE7)",
        fg: "#1F2421",
        accent: "#9C8456",
        pillBg: "#1F2421",
        pillFg: "#FFFFFF",
        mark: "#1F2421",
        dot: "#9C8456",
        outline: true,
        deco: "frame",
        line: "none",
      };
    case "vinho":
      return { bg: "#4A0E1E", fg: "#F5E6D3", accent: "#D9A35B", pillBg: "#D9A35B", pillFg: "#4A0E1E", mark: "#F5E6D3", dot: "#D9A35B", outline: false, deco: "grapes", line: "none" };
    case "neon":
      return { bg: "#0B0B12", fg: "#FFFFFF", accent: "#FF2BD6", pillBg: "#FF2BD6", pillFg: "#0B0B12", mark: "#FFFFFF", dot: "#22E1FF", outline: false, deco: "glow", line: "none", glow: "#FF2BD6" };
    case "minimal":
      return { bg: "#FFFFFF", fg: INK, accent: INK, pillBg: INK, pillFg: "#FFFFFF", mark: INK, dot: INK, outline: true, deco: "none", line: "none" };
    default:
      return { bg: brand, fg: "#FFFFFF", accent: MINT, pillBg: MINT, pillFg: INK, mark: "#FFFFFF", dot: MINT, outline: false, deco: "palm", line: "wave" };
  }
}

const DEFAULT_BRAND = "#062D25";
const MINT = "#91E9C3";
const INK = "#10211D";

function callToAction(plan: Plan, payFirst: boolean): { pt: string; sub?: string; en: string } {
  if (payFirst) return { pt: "Pede aqui", sub: "Levamos até ti", en: "Order here · We bring it to you" };
  if (planAllowsPayments(plan)) return { pt: "Pede e paga aqui", en: "Order & pay here" };
  if (planAllowsOrdering(plan)) return { pt: "Pede aqui", en: "Order here" };
  return { pt: "Vê a ementa", en: "See the menu" };
}

function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 0, color: { dark: INK, light: "#ffffff" } });
}

/** "mesvio." pequeno, a branco (assinatura discreta no fundo de cada placa). */
function Wordmark({ height, color = "#FFFFFF", dot = MINT }: { height: string; color?: string; dot?: string }) {
  return (
    <svg viewBox="0 -2 288 70" style={{ height, width: "auto" }} role="img" aria-label="mesvio">
      <g fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4.5 60V34a12 12 0 0 1 24 0v26M28.5 34a12 12 0 0 1 24 0v26" />
        <path d="M71.5 40h31A15.5 15.5 0 1 0 98 51" />
        <path d="M145 26.5c-4-5-10.5-6-15-6-6 0-10.5 3.5-10.5 9 0 11 26 7 26 19.5 0 6-5 10.5-12 10.5-5.5 0-10.5-2.5-13.5-6.5" />
        <path d="M162.5 20l16 40 16-40" />
        <path d="M212 22v38" />
        <path d="M261.5 40a15.5 15.5 0 1 1-31 0 15.5 15.5 0 1 1 31 0" />
      </g>
      <circle cx="212" cy="6" r="5.5" fill={color} />
      <circle cx="279" cy="58.5" r="6.5" fill={dot} />
    </svg>
  );
}

/** Folha de palmeira (canto superior direito): nervura curva com folíolos dos dois lados. */
const PALM_PATH = (() => {
  const p0 = [100, -4], p1 = [62, 26], p2 = [34, 74];
  const at = (t: number, a: number[], b: number[], c: number[]) => (1 - t) ** 2 * a[0] + 2 * (1 - t) * t * b[0] + t * t * c[0];
  let d = `M${p0[0]} ${p0[1]}Q${p1[0]} ${p1[1]} ${p2[0]} ${p2[1]}`;
  for (let i = 0; i < 9; i++) {
    const t = 0.12 + i * 0.095;
    const x = at(t, p0, p1, p2), y = at(t, [p0[1], 0], [p1[1], 0], [p2[1], 0]);
    const tx = 2 * (1 - t) * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0]);
    const ty = 2 * (1 - t) * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1]);
    const n = Math.hypot(tx, ty), len = 30 * (1 - t * 0.55);
    for (const side of [1, -1]) {
      const a = Math.atan2(ty, tx) + side * 0.95;
      const ex = Math.cos(a) * len, ey = Math.sin(a) * len;
      const cx = ex * 0.5 + (side * ty / n) * 4, cy = ey * 0.5 - (side * tx / n) * 4;
      d += `M${x.toFixed(1)} ${y.toFixed(1)}q${cx.toFixed(1)} ${cy.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`;
    }
  }
  return d;
})();

function Palm({ size, color = MINT }: { size: string; color?: string }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden className="pointer-events-none absolute top-0 right-0" style={{ width: size, height: size, opacity: 0.5 }}>
      <path d={PALM_PATH} fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

/** Onda menta de ponta a ponta (separa o conteúdo da assinatura). */
function Wave({ height, color = MINT }: { height: string; color?: string }) {
  return (
    <svg viewBox="0 0 200 20" preserveAspectRatio="none" aria-hidden style={{ width: "100%", height, display: "block" }}>
      <path d="M0 13C40 3 80 3 112 10s62 9 88-4" fill="none" stroke={color} strokeWidth="2.4" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Três ondas paralelas (desenho Praia). */
function Waves({ height, color }: { height: string; color: string }) {
  return (
    <svg viewBox="0 0 200 30" preserveAspectRatio="none" aria-hidden style={{ width: "100%", height, display: "block" }}>
      {[6, 15, 24].map((y, i) => (
        <path key={y} d={`M0 ${y}c25-7 50-7 75 0s50 7 75 0 37-6 50-2`} fill="none" stroke={color} strokeWidth={2.4 - i * 0.5} opacity={1 - i * 0.25} vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}

/** Um azulejo (padrão de 4 pétalas), desenhado em SVG para imprimir nítido a qualquer tamanho. */
function Tile({ color, bg }: { color: string; bg: string }) {
  return (
    <svg viewBox="0 0 40 40" aria-hidden style={{ width: "100%", height: "100%", display: "block" }}>
      <rect width="40" height="40" fill={bg} />
      <rect x="1" y="1" width="38" height="38" fill="none" stroke={color} strokeWidth="1.4" />
      {[[0, 0], [40, 0], [0, 40], [40, 40]].map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="9" fill="none" stroke={color} strokeWidth="2" />
      ))}
      <path d="M20 6C24 13 27 16 34 20 27 24 24 27 20 34 16 27 13 24 6 20 13 16 16 13 20 6Z" fill={color} />
      <circle cx="20" cy="20" r="3.4" fill={bg} />
    </svg>
  );
}

/** Decoração de fundo de cada desenho (fica por trás do conteúdo). */
function Decoration({ theme, beach, round, size, u }: { theme: Theme; beach: boolean; round: boolean; size: string; u: (v: number) => string }) {
  if (theme.deco === "palm") return beach && !round ? <Palm size={size} color={theme.accent} /> : null;
  if (theme.deco === "frame") {
    const r = round ? "50%" : undefined;
    return (
      <>
        <span aria-hidden className="pointer-events-none absolute" style={{ inset: u(3.4), border: `${u(0.45)} solid ${theme.accent}`, borderRadius: r ?? u(5.6) }} />
        <span aria-hidden className="pointer-events-none absolute" style={{ inset: u(4.6), border: `${u(0.18)} solid ${theme.accent}`, borderRadius: r ?? u(4.6) }} />
      </>
    );
  }
  if (round) return null;
  if (theme.deco === "sun")
    return <span aria-hidden className="pointer-events-none absolute rounded-full" style={{ width: u(34), height: u(34), top: u(-12), right: u(-10), background: "#F9CDB0" }} />;
  if (theme.deco === "blobs")
    return (
      <>
        <span aria-hidden className="pointer-events-none absolute rounded-full" style={{ width: u(52), height: u(52), top: u(-22), left: u(-20), background: theme.tint }} />
        <span aria-hidden className="pointer-events-none absolute rounded-full" style={{ width: u(40), height: u(40), bottom: u(-14), right: u(-16), background: theme.tint }} />
      </>
    );
  if (theme.deco === "stripes") {
    // Faixa de riscas no topo (camisola de marinheiro) e uma âncora no canto de baixo.
    return (
      <>
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0"
          style={{ height: u(9), background: `repeating-linear-gradient(180deg, ${theme.accent} 0 ${u(1.5)}, #FFFFFF ${u(1.5)} ${u(3)})` }}
        />
        <svg viewBox="0 0 24 24" aria-hidden className="pointer-events-none absolute" style={{ width: u(11), height: u(11), right: u(6), bottom: u(14), opacity: 0.18 }} fill="none" stroke={theme.accent} strokeWidth="1.8" strokeLinecap="round">
          <circle cx="12" cy="5" r="2.2" />
          <path d="M12 7.2V21M7 11h10M4 14c0 4 3.6 7 8 7s8-3 8-7" />
        </svg>
      </>
    );
  }
  if (theme.deco === "checks") {
    // Toalha de tasca: faixa de quadrados vermelhos e brancos no topo.
    const q = u(3.2);
    return (
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0"
        style={{ height: u(8), background: `repeating-conic-gradient(${theme.accent} 0 25%, #FFFFFF 0 50%) 0 0 / calc(${q} * 2) calc(${q} * 2)` }}
      />
    );
  }
  if (theme.deco === "grapes") {
    // Cacho de uvas com folha no canto de cima (desenho Vinho).
    const g = [[12, 9], [17, 9], [22, 9], [14.5, 13.5], [19.5, 13.5], [17, 18]];
    return (
      <svg viewBox="0 0 34 30" aria-hidden className="pointer-events-none absolute" style={{ width: u(26), height: u(23), top: u(4), right: u(4), opacity: 0.5 }}>
        <path d="M17 6c0-3 2-5 5-5M17 6c-3-4-9-4-11 0 4 0 7 1 11 0Z" fill="none" stroke={theme.accent} strokeWidth="1.2" strokeLinecap="round" />
        {g.map(([cx, cy]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="2.6" fill="none" stroke={theme.accent} strokeWidth="1.1" />
        ))}
      </svg>
    );
  }
  if (theme.deco === "glow") {
    // Néon: moldura a brilhar (sombra da mesma cor por dentro e por fora).
    const r = round ? "50%" : u(5.6);
    return (
      <span
        aria-hidden
        className="pointer-events-none absolute"
        style={{ inset: u(3.6), border: `${u(0.6)} solid ${theme.accent}`, borderRadius: r, boxShadow: `0 0 ${u(2.2)} ${theme.accent}, inset 0 0 ${u(2.2)} ${theme.accent}` }}
      />
    );
  }
  if (theme.deco === "grain") {
    // Madeira: veios claros por cima do fundo e uma moldura fina dourada.
    return <span aria-hidden className="pointer-events-none absolute" style={{ inset: u(3.4), border: `${u(0.35)} solid ${theme.accent}`, borderRadius: u(5.6), opacity: 0.7 }} />;
  }
  if (theme.deco === "tiles") {
    const t = u(7.5);
    const corner = (pos: React.CSSProperties) => (
      <div aria-hidden className="pointer-events-none absolute grid" style={{ gridTemplateColumns: `${t} ${t}`, ...pos }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ width: t, height: t }}>
            <Tile color={theme.accent} bg={theme.bg} />
          </div>
        ))}
      </div>
    );
    return (
      <>
        {corner({ top: 0, left: 0 })}
        {corner({ top: 0, right: 0 })}
      </>
    );
  }
  return null;
}

/** QR em caixa branca com cantos menta à volta (como uma mira de câmara). */
function QrBox({ svg, box, s, accent = MINT }: { svg: string; box: number; s: number; accent?: string }) {
  const gap = 2.6 * s, arm = 7 * s, line = 0.7 * s;
  const corner = (pos: React.CSSProperties, edges: React.CSSProperties) => (
    <span aria-hidden className="absolute" style={{ width: `${arm}mm`, height: `${arm}mm`, borderColor: accent, borderStyle: "solid", borderWidth: 0, ...pos, ...edges }} />
  );
  const w = `${line}mm`, r = `${2.4 * s}mm`;
  return (
    <div className="relative z-10 shrink-0" style={{ padding: `${gap}mm` }}>
      {corner({ top: 0, left: 0 }, { borderTopWidth: w, borderLeftWidth: w, borderTopLeftRadius: r })}
      {corner({ top: 0, right: 0 }, { borderTopWidth: w, borderRightWidth: w, borderTopRightRadius: r })}
      {corner({ bottom: 0, left: 0 }, { borderBottomWidth: w, borderLeftWidth: w, borderBottomLeftRadius: r })}
      {corner({ bottom: 0, right: 0 }, { borderBottomWidth: w, borderRightWidth: w, borderBottomRightRadius: r })}
      <div className="rounded-[2.5mm] bg-white" style={{ width: `${box}mm`, height: `${box}mm`, padding: `${box * 0.08}mm`, boxSizing: "border-box" }}>
        <div className="h-full w-full [&_svg]:h-full [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
      </div>
    </div>
  );
}

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ formato?: string; lugares?: string; demo?: string; estilo?: string }>;
};

export default async function SignsPage({ params, searchParams }: Props) {
  await requirePlatformAdmin();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const sp = await searchParams;
  const format: Format = sp.formato && sp.formato in FORMATS ? (sp.formato as Format) : "a6";
  const f = FORMATS[format];
  const who: Who = sp.lugares && sp.lugares in WHO ? (sp.lugares as Who) : f.who;
  const demo = format === "base" && sp.demo === "1";
  const style: Style = sp.estilo && sp.estilo in STYLES ? (sp.estilo as Style) : "marca";

  const db = await getDb();
  const [est] = await db
    .select({ name: establishments.name, plan: establishments.plan, brandColor: establishments.brandColor, logo: establishments.brandLogoUrl, reviews: establishments.reviewsEnabled })
    .from(establishments)
    .where(eq(establishments.id, id));
  if (!est) notFound();
  const tables = await db
    .select({ id: diningTables.id, label: diningTables.label, publicToken: diningTables.publicToken, active: diningTables.active, mode: diningTables.orderingMode })
    .from(diningTables)
    .where(eq(diningTables.establishmentId, id))
    .orderBy(asc(diningTables.label));

  const h = await headers();
  const base = resolvePublicBaseUrl(process.env.NEXT_PUBLIC_APP_URL, h.get("host"), h.get("x-forwarded-proto"));
  const natural = new Intl.Collator("pt", { numeric: true });
  const brand = demo ? DEFAULT_BRAND : (est.brandColor ?? DEFAULT_BRAND);
  const active = tables.filter((t) => t.active).map((t) => ({ ...t, payFirst: effectiveOrderingMode(est.plan, t.mode) === "pay_first" }));
  // Folha de palmeira só em quem tem camas (praia); num restaurante de cidade fica só a onda.
  const beach = active.some((t) => t.payFirst);
  const payments = planAllowsPayments(est.plan);
  // Lembrete para avaliar (o botão "Avaliar" está no fim da ementa): só se as avaliações estiverem ligadas.
  const reviews = est.reviews && !demo;
  const perPlace = await Promise.all(
    active
      .filter((t) => who === "todos" || (who === "camas" ? t.payFirst : !t.payFirst))
      .sort((a, b) => natural.compare(a.label, b.label))
      .map(async (t) => ({ ...t, svg: await qrSvg(tableUrl(base, t.publicToken)), cta: callToAction(est.plan, t.payFirst) })),
  );
  // A placa base é uma só (o lugar vai no autocolante); a folha de autocolantes leva 20 por página A4.
  const places = format === "base" ? [{ id: "base", label: "", svg: "", cta: demo ? { pt: "Pede aqui", en: "Order here" } : callToAction(est.plan, false) }] : perPlace;
  const sheets = Array.from({ length: Math.ceil(perPlace.length / 20) }, (_, i) => perPlace.slice(i * 20, i * 20 + 20));

  const href = (next: Partial<{ formato: Format; lugares: Who; demo: boolean; estilo: Style }>) => {
    const p = new URLSearchParams({ formato: next.formato ?? format, lugares: next.lugares ?? who });
    if ((next.estilo ?? style) !== "marca") p.set("estilo", next.estilo ?? style);
    if (next.demo ?? (demo && !next.formato)) p.set("demo", "1");
    return `/central/restaurantes/${id}/placas?${p}`;
  };
  // Tamanhos em mm, à escala da placa A6 (s = 1): cada lugar numa página do tamanho da placa.
  const s = format === "balcao" ? 1 : format === "autocolante" ? 0.62 : f.w / 105;
  const u = (v: number) => `${(v * s).toFixed(2)}mm`;
  const pad = format === "autocolante" ? 0 : 8;
  const name = est.name.trim();
  const initial = name.charAt(0).toUpperCase() || "M";
  // Nome em maiúsculas espaçadas, a encolher para caber numa linha.
  const nameWidth = format === "balcao" ? 120 : format === "autocolante" ? 46 : f.w - 2 * pad - (est.logo ? 13 * s : 0);
  const nameSize = Math.min(format === "balcao" ? 6.4 : 6.6 * s, nameWidth / Math.max(name.length * 0.9, 1));

  const Brand = () => (
    <div className="flex items-center" style={{ gap: u(2.6), justifyContent: format === "balcao" ? "flex-start" : "center" }}>
      {format !== "autocolante" &&
        (est.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={est.logo} alt="" className="shrink-0 rounded-full bg-white object-contain" style={{ width: u(10), height: u(10), padding: u(1) }} />
        ) : null)}
      <p className="m-0 font-semibold whitespace-nowrap uppercase" style={{ fontSize: `${nameSize.toFixed(2)}mm`, letterSpacing: "0.16em", marginRight: "-0.16em" }}>
        {name || initial}
      </p>
    </div>
  );
  const Pill = ({ label, size, theme }: { label: string; size: number; theme: Theme }) => (
    <span className="inline-block rounded-full font-extrabold whitespace-nowrap uppercase" style={{ background: theme.pillBg, color: theme.pillFg, fontSize: u(size), padding: `${u(size * 0.32)} ${u(size * 1.1)}`, letterSpacing: "0.02em", lineHeight: 1.15 }}>
      {label}
    </span>
  );
  const Signature = ({ size, theme }: { size: number; theme: Theme }) => (
    <p className="m-0 flex items-baseline justify-center" style={{ gap: u(size * 0.45), fontSize: u(size) }}>
      <span style={{ opacity: 0.85 }}>com</span>
      <Wordmark height={u(size * 1.2)} color={theme.mark} dot={theme.dot} />
    </p>
  );
  const LineAbove = ({ theme, height }: { theme: Theme; height: string }) =>
    theme.line === "wave" ? <Wave height={height} color={theme.accent} /> : theme.line === "waves" ? <Waves height={height} color={theme.accent} /> : <div style={{ height }} />;
  const headline = (pt: string, big: number) => (pt.length > 12 ? big * 0.82 : big);
  const RateUs = ({ size }: { size: number }) => (
    <p className="m-0 font-semibold whitespace-nowrap" style={{ fontSize: u(size) }}>
      <span style={{ color: "inherit" }}>★</span> Gostou? Avalie-nos <span className="font-medium italic opacity-85">· Rate us</span>
    </p>
  );

  type Place = (typeof places)[number];
  /** Uma placa, no tamanho real. `print` = vai para o PDF (as miniaturas dos desenhos não vão). */
  const plate = (t: Place, st: Style, print: boolean) => {
    const theme = themeFor(st, brand);
    return (
      <section
        key={`${st}-${t.id}`}
        aria-label={print ? t.label || f.label : undefined}
        aria-hidden={print ? undefined : true}
        className={`${print ? "placa shadow-lg print:shadow-none" : ""} relative flex shrink-0 overflow-hidden`}
        style={{
          width: `${f.w}mm`,
          height: `${f.h}mm`,
          background: theme.bg,
          color: theme.fg,
          // Fundo claro: contorno fino para se ver o recorte da placa no ecrã e no PDF.
          outline: theme.outline ? "0.2mm solid #d4d4d4" : undefined,
          outlineOffset: "-0.1mm",
          borderRadius: format === "autocolante" ? "50%" : "8mm",
          flexDirection: format === "balcao" ? "row" : "column",
          alignItems: "center",
          justifyContent: format === "autocolante" ? "center" : undefined,
          padding: `${pad}mm`,
          boxSizing: "border-box",
          printColorAdjust: "exact",
          WebkitPrintColorAdjust: "exact",
          textShadow: theme.glow ? `0 0 1.2mm ${theme.glow}` : undefined,
        }}
      >
        <Decoration theme={theme} beach={beach} round={format === "autocolante"} size={format === "balcao" ? "40mm" : u(34)} u={u} />

        {format === "autocolante" ? (
          <div className="relative z-10 flex flex-col items-center text-center" style={{ gap: "1.3mm" }}>
            <Brand />
            <QrBox svg={t.svg} box={f.qr} s={s} accent={theme.accent} />
            <Pill label={t.label} size={5} theme={theme} />
            <p className="m-0 leading-tight font-extrabold" style={{ fontSize: "2.5mm" }}>
              {t.cta.pt} <span className="font-medium italic opacity-90">· {t.cta.en}</span>
            </p>
            <Wordmark height="2.2mm" color={theme.mark} dot={theme.dot} />
          </div>
        ) : format === "balcao" ? (
          <>
            <QrBox svg={t.svg} box={f.qr} s={s} accent={theme.accent} />
            <div className="relative z-10 flex min-w-0 flex-col items-start" style={{ marginLeft: "9mm", gap: "2.2mm", alignSelf: "stretch", justifyContent: "center", paddingBottom: "6mm" }}>
              <Brand />
              <Pill label={t.label} size={4.4} theme={theme} />
              <div>
                <p className="m-0 leading-none font-extrabold" style={{ fontSize: `${headline(t.cta.pt, 11)}mm` }}>
                  {t.cta.pt}
                </p>
                {t.cta.sub && (
                  <p className="m-0 font-bold" style={{ fontSize: "5mm", marginTop: "1.2mm" }}>
                    {t.cta.sub}
                  </p>
                )}
                <p className="m-0 italic opacity-90" style={{ fontSize: "4.4mm", marginTop: "1.4mm" }}>
                  {t.cta.en}
                </p>
              </div>
              {payments && (
                <p className="m-0 font-semibold opacity-85" style={{ fontSize: "2.8mm" }}>
                  Apple Pay · MB WAY · cartão
                </p>
              )}
              {reviews && <RateUs size={3} />}
            </div>
            <div className="absolute inset-x-0 bottom-0 z-10" style={{ paddingBottom: "4mm" }}>
              <LineAbove theme={theme} height="7mm" />
              <div className="flex justify-end" style={{ paddingRight: "10mm", marginTop: "0.6mm" }}>
                <Signature size={3} theme={theme} />
              </div>
            </div>
          </>
        ) : (
          <>
            {format === "etiqueta" && (
              <div className="relative z-10 flex w-full justify-around" style={{ height: u(9), paddingInline: "18mm", boxSizing: "border-box" }} aria-hidden>
                {[0, 1].map((i) => (
                  <span key={i} className="rounded-full" style={{ width: "5mm", height: "5mm", border: `0.25mm solid ${theme.accent}`, opacity: 0.7, marginTop: "-1mm" }} />
                ))}
              </div>
            )}
            <div className="relative z-10 flex w-full flex-1 flex-col items-center justify-center text-center" style={{ gap: u(2.8) }}>
              {!demo && <Brand />}
              {t.label && <Pill label={t.label} size={4.6} theme={theme} />}
              <div>
                <p className="m-0 leading-none font-extrabold" style={{ fontSize: u(headline(t.cta.pt, 10)) }}>
                  {t.cta.pt}
                </p>
                {t.cta.sub && (
                  <p className="m-0 font-bold" style={{ fontSize: u(5), marginTop: u(1.2) }}>
                    {t.cta.sub}
                  </p>
                )}
                <p className="m-0 italic opacity-90" style={{ fontSize: u(4.4), marginTop: u(1.4) }}>
                  {t.cta.en}
                </p>
              </div>
              <QrBox svg={t.svg} box={f.qr} s={s} accent={theme.accent} />
              {reviews && <RateUs size={3.3} />}
              {payments && (
                <p className="m-0 font-semibold opacity-85" style={{ fontSize: u(2.7) }}>
                  Apple Pay · MB WAY · cartão
                </p>
              )}
            </div>
            <div className="relative z-10 w-full" style={{ marginInline: `-${pad}mm`, width: `${f.w}mm`, marginBottom: `-${pad - 4}mm` }}>
              <LineAbove theme={theme} height={u(6)} />
              <div style={{ marginTop: u(1.2) }}>
                <Signature size={3.1} theme={theme} />
              </div>
            </div>
          </>
        )}
      </section>
    );
  };

  // Miniaturas dos desenhos: a primeira placa, no formato escolhido, reduzida para caber no cartão.
  const sample = places[0];
  const thumbW = 132;
  const thumbScale = thumbW / (f.w * 3.7795);
  const step = (n: number, title: string, extra?: React.ReactNode) => (
    <h2 className="flex items-center gap-2 text-base font-bold">
      <span className="grid size-6 place-items-center rounded-full bg-brand text-xs text-white">{n}</span>
      {title}
      {extra}
    </h2>
  );
  const chip = (activeNow: boolean) =>
    `min-h-10 rounded-xl border px-3 py-2 text-sm font-semibold ${activeNow ? "border-brand bg-brand text-white" : "border-line bg-card text-ink-soft hover:border-brand"}`;
  const fixedPalette = !["marca", "claro", "formas"].includes(style);

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 print:m-0 print:max-w-none print:p-0">
      <style>{`@page { size: ${f.w}mm ${f.h}mm; margin: 0 } @media print { html, body { background: #fff } .placa { break-after: page; box-shadow: none !important; margin: 0 !important } }`}</style>
      <div className="print:hidden">
        <Link prefetch={false} href={`/central/restaurantes/${id}`} className="text-sm text-ink-soft underline">
          ← {est.name}
        </Link>
        <h1 className="mt-3 text-3xl tracking-tight">Placas · {est.name}</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-soft">Escolha com o cliente o desenho, a cor e o formato. À direita vê as placas exatamente como vão para a gráfica.</p>
        {isLocalOnlyUrl(base) && (
          <p role="alert" className="mt-4 max-w-2xl rounded-xl border border-amber-500 bg-amber-50 px-4 py-3 text-sm">
            <strong>Atenção:</strong> estes códigos apontam para <code>{base}</code>, que um telemóvel não abre. Imprima a partir do site público.
          </p>
        )}
      </div>

      <div className="mt-6 grid items-start gap-8 lg:grid-cols-[minmax(0,420px)_1fr] print:mt-0 print:block">
        <aside className="grid gap-6 rounded-3xl border border-line bg-card p-5 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto print:hidden">
          {format !== "autocolantes" && (
            <section className="grid gap-3" aria-label="Desenho">
              {step(1, "Desenho")}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
                {(Object.keys(STYLES) as Style[]).map((k) => (
                  <Link
                    key={k}
                    href={href({ estilo: k })}
                    aria-current={k === style ? "page" : undefined}
                    className={`group grid gap-2 rounded-2xl border-2 p-2 text-left transition ${k === style ? "border-brand bg-brand-soft/40" : "border-transparent hover:border-line"}`}
                  >
                    {sample ? (
                      <div className="mx-auto overflow-hidden rounded-lg" style={{ width: `${thumbW}px`, height: `${(thumbW * f.h) / f.w}px` }}>
                        <div style={{ transform: `scale(${thumbScale})`, transformOrigin: "top left", width: `${f.w}mm`, height: `${f.h}mm` }}>{plate(sample, k, false)}</div>
                      </div>
                    ) : (
                      <div className="mx-auto rounded-lg" style={{ width: `${thumbW}px`, height: `${(thumbW * f.h) / f.w}px`, background: themeFor(k, brand).bg, outline: "1px solid #d4d4d4" }} />
                    )}
                    <span className="block text-sm leading-tight font-semibold">{STYLES[k].label}</span>
                    <span className="block text-xs leading-snug text-ink-soft">{STYLES[k].hint}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section className="grid gap-2" aria-label="Cor e logótipo">
            {step(format === "autocolantes" ? 1 : 2, "Cor e logótipo")}
            {fixedPalette && format !== "autocolantes" && (
              <p className="text-xs text-ink-soft">O desenho &ldquo;{STYLES[style].label}&rdquo; tem cores próprias: a cor do restaurante não muda a placa, só o logótipo.</p>
            )}
            <PlateBranding establishmentId={id} brandColor={est.brandColor} hasLogo={Boolean(est.logo)} />
          </section>

          <section className="grid gap-2" aria-label="Formato">
            {step(format === "autocolantes" ? 2 : 3, "Formato")}
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {(Object.keys(FORMATS) as Format[]).map((k) => (
                <Link
                  key={k}
                  href={href({ formato: k, lugares: FORMATS[k].who })}
                  aria-current={k === format ? "page" : undefined}
                  className={`rounded-xl border px-3 py-2 text-sm ${k === format ? "border-brand bg-brand text-white" : "border-line bg-card hover:border-brand"}`}
                >
                  <span className="block font-semibold">{FORMATS[k].label}</span>
                  <span className="block text-xs opacity-80">{FORMATS[k].size}</span>
                </Link>
              ))}
            </div>
            {format === "base" && (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Marca">
                {[false, true].map((d) => (
                  <Link key={String(d)} href={href({ demo: d })} aria-current={d === demo ? "page" : undefined} className={chip(d === demo)}>
                    {d ? "Sem marca (demonstrações)" : "Com a marca do restaurante"}
                  </Link>
                ))}
              </div>
            )}
          </section>

          {format !== "base" && (
            <section className="grid gap-2" aria-label="Lugares">
              {step(format === "autocolantes" ? 3 : 4, "Lugares")}
              <div className="flex flex-wrap gap-2">
                {(Object.keys(WHO) as Who[]).map((k) => (
                  <Link key={k} href={href({ lugares: k })} aria-current={k === who ? "page" : undefined} className={chip(k === who)}>
                    {WHO[k]}
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section className="grid gap-3 border-t border-line pt-5" aria-label="Imprimir">
            <p className="text-sm">
              <strong>
                {format === "autocolantes"
                  ? `${perPlace.length} autocolantes em ${sheets.length} ${sheets.length === 1 ? "folha" : "folhas"}`
                  : `${places.length} ${places.length === 1 ? "placa" : "placas"}`}
              </strong>
              {format !== "autocolantes" && format !== "base" && places.length > 0 && ` · ${(places.length * 4).toLocaleString("pt-PT")} € a 4 € cada`}
            </p>
            <div>
              <PrintButton />
            </div>
            <p className="text-xs text-ink-soft">
              Em Imprimir escolha <strong>Guardar como PDF</strong> e envie o PDF à gráfica: cada página é uma placa.
            </p>
            <details className="text-xs text-ink-soft">
              <summary className="cursor-pointer font-semibold text-ink">Instruções para a gráfica</summary>
              <p className="mt-2">
                Acrílico (5 mm; a etiqueta 3 mm) com impressão UV <strong>no verso</strong>, camada de branco e acabamento mate, cantos arredondados de
                8 mm.
                {format === "etiqueta" && " Os dois círculos no topo marcam os furos de 5 mm."}
                {(format === "balcao" || format === "a4") && " Para o balcão ou a entrada, crie um lugar com esse nome (ex.: Balcão) e imprima só esse."}
                {format === "base" &&
                  " Uma só placa para todos os lugares: o quadrado branco recebe o autocolante do QR (Folha de autocolantes QR), que se troca se alguém pedir de fora (\"Novo QR Code\" em Imprimir QR Codes)."}
                {format === "autocolantes" && " Vinil branco com laminação mate, corte em quadrados de 48 mm (cantos de 3 mm). Peça uns 20% a mais para substituições."}
              </p>
            </details>
          </section>
        </aside>

        <section aria-label="Pré-visualização" className="min-w-0">
          <h2 className="mb-4 text-sm font-semibold tracking-wide text-ink-soft uppercase print:hidden">Pré-visualização, em tamanho real</h2>
          {places.length === 0 && <p className="text-ink-soft print:hidden">Não há lugares deste tipo.</p>}
          {format === "autocolantes" ? (
            <div className="flex flex-wrap gap-6 print:block">
              {sheets.map((sheet, i) => (
                <section
                  key={i}
                  aria-label={`Folha ${i + 1}`}
                  className="placa grid shrink-0 bg-white shadow-lg print:shadow-none"
                  style={{ width: "210mm", height: "297mm", padding: "14mm 6mm", boxSizing: "border-box", gridTemplateColumns: "repeat(4, 48mm)", gridAutoRows: "48mm", gap: "2mm", alignContent: "start" }}
                >
                  {sheet.map((t) => (
                    <div
                      key={t.id}
                      className="flex flex-col items-center justify-center"
                      style={{ width: "48mm", height: "48mm", borderRadius: "3mm", outline: "0.1mm solid #d4d4d4", outlineOffset: "-0.05mm", color: INK, gap: "1.4mm" }}
                    >
                      <div className="[&_svg]:h-full [&_svg]:w-full" style={{ width: "35mm", height: "35mm" }} dangerouslySetInnerHTML={{ __html: t.svg }} />
                      <p className="m-0 leading-none font-extrabold whitespace-nowrap uppercase" style={{ fontSize: "4.2mm", letterSpacing: "0.02em" }}>
                        {t.label}
                      </p>
                    </div>
                  ))}
                </section>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-6 print:block">{places.map((t) => plate(t, style, true))}</div>
          )}
        </section>
      </div>
    </main>
  );
}
