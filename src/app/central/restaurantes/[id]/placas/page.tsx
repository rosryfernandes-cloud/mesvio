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
function Wordmark({ height }: { height: string }) {
  return (
    <svg viewBox="0 -2 288 70" style={{ height, width: "auto" }} role="img" aria-label="mesvio">
      <g fill="none" stroke="#FFFFFF" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4.5 60V34a12 12 0 0 1 24 0v26M28.5 34a12 12 0 0 1 24 0v26" />
        <path d="M71.5 40h31A15.5 15.5 0 1 0 98 51" />
        <path d="M145 26.5c-4-5-10.5-6-15-6-6 0-10.5 3.5-10.5 9 0 11 26 7 26 19.5 0 6-5 10.5-12 10.5-5.5 0-10.5-2.5-13.5-6.5" />
        <path d="M162.5 20l16 40 16-40" />
        <path d="M212 22v38" />
        <path d="M261.5 40a15.5 15.5 0 1 1-31 0 15.5 15.5 0 1 1 31 0" />
      </g>
      <circle cx="212" cy="6" r="5.5" fill="#FFFFFF" />
      <circle cx="279" cy="58.5" r="6.5" fill={MINT} />
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

function Palm({ size }: { size: string }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden className="pointer-events-none absolute top-0 right-0" style={{ width: size, height: size, opacity: 0.5 }}>
      <path d={PALM_PATH} fill="none" stroke={MINT} strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

/** Onda menta de ponta a ponta (separa o conteúdo da assinatura). */
function Wave({ height }: { height: string }) {
  return (
    <svg viewBox="0 0 200 20" preserveAspectRatio="none" aria-hidden style={{ width: "100%", height, display: "block" }}>
      <path d="M0 13C40 3 80 3 112 10s62 9 88-4" fill="none" stroke={MINT} strokeWidth="2.4" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function NfcIcon({ size }: { size: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden style={{ width: size, height: size, flexShrink: 0 }} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <rect x="10" y="2.5" width="10" height="19" rx="2.2" />
      <path d="M6.5 9.5a3.5 3.5 0 0 1 0 5M3.5 7a7 7 0 0 1 0 10" />
    </svg>
  );
}

/** QR em caixa branca com cantos menta à volta (como uma mira de câmara). */
function QrBox({ svg, box, s }: { svg: string; box: number; s: number }) {
  const gap = 2.6 * s, arm = 7 * s, line = 0.7 * s;
  const corner = (pos: React.CSSProperties, edges: React.CSSProperties) => (
    <span aria-hidden className="absolute" style={{ width: `${arm}mm`, height: `${arm}mm`, borderColor: MINT, borderStyle: "solid", borderWidth: 0, ...pos, ...edges }} />
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
  searchParams: Promise<{ formato?: string; lugares?: string; demo?: string; nfc?: string }>;
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
  // Sem etiqueta NFC colada atrás, a placa não pode prometer "Aproxima o telemóvel".
  const nfc = sp.nfc !== "0";

  const db = await getDb();
  const [est] = await db
    .select({ name: establishments.name, plan: establishments.plan, brandColor: establishments.brandColor, logo: establishments.brandLogoUrl })
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
  const perPlace = await Promise.all(
    active
      .filter((t) => who === "todos" || (who === "camas" ? t.payFirst : !t.payFirst))
      .sort((a, b) => natural.compare(a.label, b.label))
      .map(async (t) => ({ ...t, svg: await qrSvg(tableUrl(base, t.publicToken)), cta: callToAction(est.plan, t.payFirst) })),
  );
  // A placa base é uma só (o lugar vai no autocolante); a folha de autocolantes leva 20 por página A4.
  const places = format === "base" ? [{ id: "base", label: "", svg: "", cta: demo ? { pt: "Pede aqui", en: "Order here" } : callToAction(est.plan, false) }] : perPlace;
  const sheets = Array.from({ length: Math.ceil(perPlace.length / 20) }, (_, i) => perPlace.slice(i * 20, i * 20 + 20));

  const href = (next: Partial<{ formato: Format; lugares: Who; demo: boolean; nfc: boolean }>) => {
    const p = new URLSearchParams({ formato: next.formato ?? format, lugares: next.lugares ?? who });
    if (next.demo ?? (demo && !next.formato)) p.set("demo", "1");
    if (!(next.nfc ?? nfc)) p.set("nfc", "0");
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
  const Pill = ({ label, size }: { label: string; size: number }) => (
    <span className="inline-block rounded-full font-extrabold whitespace-nowrap uppercase" style={{ background: MINT, color: INK, fontSize: u(size), padding: `${u(size * 0.32)} ${u(size * 1.1)}`, letterSpacing: "0.02em", lineHeight: 1.15 }}>
      {label}
    </span>
  );
  const Nfc = ({ size }: { size: number }) => (
    <p className="m-0 flex items-center" style={{ gap: u(size * 0.6), fontSize: u(size) }}>
      <NfcIcon size={u(size * 2.1)} />
      <span>
        Aproxima o telemóvel · <strong>NFC</strong>
      </span>
    </p>
  );
  const Signature = ({ size }: { size: number }) => (
    <p className="m-0 flex items-baseline justify-center" style={{ gap: u(size * 0.45), fontSize: u(size) }}>
      <span style={{ opacity: 0.85 }}>com</span>
      <Wordmark height={u(size * 1.2)} />
    </p>
  );
  const headline = (pt: string, big: number) => (pt.length > 12 ? big * 0.82 : big);

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 print:m-0 print:max-w-none print:p-0">
      <style>{`@page { size: ${f.w}mm ${f.h}mm; margin: 0 } @media print { html, body { background: #fff } .placa { break-after: page; box-shadow: none !important; margin: 0 !important } }`}</style>
      <div className="print:hidden">
        <Link prefetch={false} href={`/central/restaurantes/${id}`} className="text-sm text-ink-soft underline">
          ← {est.name}
        </Link>
        <h1 className="mt-3 text-3xl tracking-tight">Placas · {est.name}</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-soft">
          Uma página por lugar, no tamanho exato, com o QR de cada um, o logótipo e a cor do restaurante (separador Aparência). Carregue em
          Imprimir, escolha <strong>Guardar como PDF</strong> e envie o PDF à gráfica. Para NFC, grave em cada etiqueta o link do lugar (ver QR Codes
          deste restaurante).
        </p>
        <p className="mt-2 max-w-2xl text-sm text-ink-soft">
          Para a gráfica: acrílico (5 mm; a etiqueta 3 mm) com impressão UV <strong>no verso</strong>, camada de branco e acabamento mate, cantos
          arredondados de 8 mm.
          {nfc && " Com NFC, não use alumínio: bloqueia a etiqueta colada atrás."}
          {format === "etiqueta" && " Os dois círculos no topo marcam os furos de 5 mm."}
          {(format === "balcao" || format === "a4") && " Para o balcão ou a entrada, crie um lugar com esse nome (ex.: Balcão) e imprima só esse."}
          {format === "base" &&
            " Uma só placa para todos os lugares: o quadrado branco recebe o autocolante do QR (Folha de autocolantes QR), que se troca se alguém pedir de fora (\"Novo QR Code\" em Imprimir QR Codes)."}
          {format === "autocolantes" &&
            " Vinil branco com laminação mate, corte em quadrados de 48 mm (cantos de 3 mm). Peça uns 20% a mais para substituições."}
        </p>
        {isLocalOnlyUrl(base) && (
          <p role="alert" className="mt-4 max-w-2xl rounded-xl border border-amber-500 bg-amber-50 px-4 py-3 text-sm">
            <strong>Atenção:</strong> estes códigos apontam para <code>{base}</code>, que um telemóvel não abre. Imprima a partir do site público.
          </p>
        )}
        <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Formato">
          {(Object.keys(FORMATS) as Format[]).map((k) => (
            <Link
              key={k}
              href={href({ formato: k, lugares: FORMATS[k].who })}
              aria-current={k === format ? "page" : undefined}
              className={`min-h-11 rounded-xl border px-4 py-2.5 text-sm font-semibold ${k === format ? "border-brand bg-brand text-white" : "border-line bg-card"}`}
            >
              {FORMATS[k].label} <span className="font-normal opacity-80">· {FORMATS[k].size}</span>
            </Link>
          ))}
        </div>
        {format !== "autocolante" && format !== "autocolantes" && (
          <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="NFC">
            {[true, false].map((v) => (
              <Link
                key={String(v)}
                href={href({ nfc: v })}
                aria-current={v === nfc ? "page" : undefined}
                className={`min-h-10 rounded-xl border px-3 py-2 text-sm font-semibold ${v === nfc ? "border-brand text-brand" : "border-line bg-card text-ink-soft"}`}
              >
                {v ? "Com NFC" : "Só QR (sem NFC)"}
              </Link>
            ))}
          </div>
        )}
        {format === "base" && (
          <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Marca">
            {[false, true].map((d) => (
              <Link
                key={String(d)}
                href={href({ demo: d })}
                aria-current={d === demo ? "page" : undefined}
                className={`min-h-10 rounded-xl border px-3 py-2 text-sm font-semibold ${d === demo ? "border-brand text-brand" : "border-line bg-card text-ink-soft"}`}
              >
                {d ? "Sem marca (para demonstrações)" : "Com a marca do restaurante"}
              </Link>
            ))}
          </div>
        )}
        <div className={`mt-3 flex flex-wrap items-center gap-2 ${format === "base" ? "hidden" : ""}`} role="group" aria-label="Lugares">
          {(Object.keys(WHO) as Who[]).map((k) => (
            <Link
              key={k}
              href={href({ lugares: k })}
              aria-current={k === who ? "page" : undefined}
              className={`min-h-10 rounded-xl border px-3 py-2 text-sm font-semibold ${k === who ? "border-brand text-brand" : "border-line bg-card text-ink-soft"}`}
            >
              {WHO[k]}
            </Link>
          ))}
          <span className="ml-2 text-sm text-ink-soft">
            {format === "autocolantes"
              ? `${perPlace.length} autocolantes em ${sheets.length} ${sheets.length === 1 ? "folha" : "folhas"}`
              : `${places.length} ${places.length === 1 ? "placa" : "placas"}`}
          </span>
        </div>
        <div className="mt-6">
          <PrintButton />
        </div>
        {places.length === 0 && <p className="mt-6 text-ink-soft">Não há lugares deste tipo.</p>}
      </div>

      {format === "autocolantes" ? (
        <div className="mt-8 flex flex-wrap gap-6 print:mt-0 print:block">
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
        <div className="mt-8 flex flex-wrap gap-6 print:mt-0 print:block">
          {places.map((t) => (
            <section
              key={t.id}
              aria-label={t.label || f.label}
              className="placa relative flex shrink-0 overflow-hidden text-white shadow-lg print:shadow-none"
              style={{
                width: `${f.w}mm`,
                height: `${f.h}mm`,
                background: brand,
                borderRadius: format === "autocolante" ? "50%" : "8mm",
                flexDirection: format === "balcao" ? "row" : "column",
                alignItems: "center",
                justifyContent: format === "autocolante" ? "center" : undefined,
                padding: `${pad}mm`,
                boxSizing: "border-box",
                printColorAdjust: "exact",
                WebkitPrintColorAdjust: "exact",
              }}
            >
              {beach && format !== "autocolante" && <Palm size={format === "balcao" ? "40mm" : u(34)} />}

              {format === "autocolante" ? (
                <div className="flex flex-col items-center text-center" style={{ gap: "1.3mm" }}>
                  <Brand />
                  <QrBox svg={t.svg} box={f.qr} s={s} />
                  <Pill label={t.label} size={5} />
                  <p className="m-0 leading-tight font-extrabold" style={{ fontSize: "2.5mm" }}>
                    {t.cta.pt} <span className="font-medium italic opacity-90">· {t.cta.en}</span>
                  </p>
                  <Wordmark height="2.2mm" />
                </div>
              ) : format === "balcao" ? (
                <>
                  <QrBox svg={t.svg} box={f.qr} s={s} />
                  <div className="relative z-10 flex min-w-0 flex-col items-start" style={{ marginLeft: "9mm", gap: "2.2mm", alignSelf: "stretch", justifyContent: "center", paddingBottom: "6mm" }}>
                    <Brand />
                    <Pill label={t.label} size={4.4} />
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
                    {nfc && <Nfc size={3.2} />}
                    {payments && (
                      <p className="m-0 font-semibold opacity-85" style={{ fontSize: "2.8mm" }}>
                        Apple Pay · MB WAY · cartão
                      </p>
                    )}
                  </div>
                  <div className="absolute inset-x-0 bottom-0" style={{ paddingBottom: "4mm" }}>
                    <Wave height="7mm" />
                    <div className="flex justify-end" style={{ paddingRight: "10mm", marginTop: "0.6mm" }}>
                      <Signature size={3} />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {format === "etiqueta" && (
                    <div className="flex w-full justify-around" style={{ height: u(9), paddingInline: "18mm", boxSizing: "border-box" }} aria-hidden>
                      {[0, 1].map((i) => (
                        <span key={i} className="rounded-full" style={{ width: "5mm", height: "5mm", border: `0.25mm solid ${MINT}`, opacity: 0.7, marginTop: "-1mm" }} />
                      ))}
                    </div>
                  )}
                  <div className="relative z-10 flex w-full flex-1 flex-col items-center justify-center text-center" style={{ gap: u(2.8) }}>
                    {!demo && <Brand />}
                    {t.label && <Pill label={t.label} size={4.6} />}
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
                    <QrBox svg={t.svg} box={f.qr} s={s} />
                    <div className="flex flex-col items-center" style={{ gap: u(1.2) }}>
                      {nfc && <Nfc size={3.1} />}
                      {payments && (
                        <p className="m-0 font-semibold opacity-85" style={{ fontSize: u(2.7) }}>
                          Apple Pay · MB WAY · cartão
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="w-full" style={{ marginInline: `-${pad}mm`, width: `${f.w}mm`, marginBottom: `-${pad - 4}mm` }}>
                    <Wave height={u(6)} />
                    <div style={{ marginTop: u(1.2) }}>
                      <Signature size={3.1} />
                    </div>
                  </div>
                </>
              )}
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
