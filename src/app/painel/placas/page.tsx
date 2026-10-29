import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { asc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";
import { getDb } from "@/server/db/client";
import { withTenant } from "@/server/db/tenant";
import { diningTables, establishments } from "@/server/db/schema";
import { can } from "@/server/staff/context";
import { getStaffContext } from "@/server/staff/http";
import { tableUrl } from "@/server/tables/table-token";
import { isLocalOnlyUrl, resolvePublicBaseUrl } from "@/server/tables/table-qr";
import { effectiveOrderingMode, planAllowsOrdering, planAllowsPayments, type Plan } from "@/lib/plan";
import { PrintButton } from "@/app/qr/print-button";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Placas para imprimir", robots: { index: false, follow: false } };

/**
 * Placas para a gráfica (dono/gerente): uma página por lugar, no tamanho exato do formato, com o QR
 * desse lugar, o logótipo e a cor do restaurante. "Imprimir" → "Guardar como PDF" e envia-se o PDF
 * à gráfica (impressão com dados variáveis: cada página é uma placa).
 */
const FORMATS = {
  autocolante: { label: "Autocolante redondo", size: "Ø 8 cm", w: 80, h: 80 },
  a6: { label: "Placa de mesa (A6)", size: "10,5 × 14,8 cm", w: 105, h: 148 },
  praia: { label: "Placa de praia", size: "15 × 10 cm", w: 150, h: 100 },
} as const;
type Format = keyof typeof FORMATS;

const WHO = { todos: "Todos os lugares", mesas: "Só mesas", camas: "Só camas" } as const;
type Who = keyof typeof WHO;

const DEFAULT_BRAND = "#062D25";

function callToAction(plan: Plan, payFirst: boolean): { pt: string; en: string } {
  if (payFirst) return { pt: "Peça daqui. Levamos até si.", en: "Order from here. We bring it to you." };
  if (planAllowsPayments(plan)) return { pt: "Peça e pague aqui", en: "Order & pay here" };
  if (planAllowsOrdering(plan)) return { pt: "Peça aqui", en: "Order here" };
  return { pt: "Veja a ementa", en: "See the menu" };
}

function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 0, color: { dark: "#10211D", light: "#ffffff" } });
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
      <circle cx="279" cy="58.5" r="6.5" fill="#91E9C3" />
    </svg>
  );
}

export default async function SignsPage({ searchParams }: { searchParams: Promise<{ formato?: string; lugares?: string }> }) {
  const ctx = await getStaffContext();
  if (!ctx) redirect("/painel/entrar");
  if (!can(ctx, "settings.edit")) notFound();
  const sp = await searchParams;
  const format: Format = sp.formato && sp.formato in FORMATS ? (sp.formato as Format) : "autocolante";
  const who: Who = sp.lugares && sp.lugares in WHO ? (sp.lugares as Who) : format === "praia" ? "camas" : "todos";
  const f = FORMATS[format];

  const { est, tables } = await withTenant(await getDb(), { organizationId: ctx.organizationId, userId: ctx.userId }, async (tx) => {
    const [est] = await tx
      .select({ name: establishments.name, plan: establishments.plan, brandColor: establishments.brandColor, logo: establishments.brandLogoUrl })
      .from(establishments)
      .where(eq(establishments.id, ctx.establishmentId));
    const tables = await tx
      .select({ id: diningTables.id, label: diningTables.label, publicToken: diningTables.publicToken, active: diningTables.active, mode: diningTables.orderingMode })
      .from(diningTables)
      .where(eq(diningTables.establishmentId, ctx.establishmentId))
      .orderBy(asc(diningTables.label));
    return { est, tables };
  });

  const h = await headers();
  const base = resolvePublicBaseUrl(process.env.NEXT_PUBLIC_APP_URL, h.get("host"), h.get("x-forwarded-proto"));
  const natural = new Intl.Collator("pt", { numeric: true });
  const brand = est.brandColor ?? DEFAULT_BRAND;
  const places = await Promise.all(
    tables
      .filter((t) => t.active)
      .map((t) => ({ ...t, payFirst: effectiveOrderingMode(est.plan, t.mode) === "pay_first" }))
      .filter((t) => who === "todos" || (who === "camas" ? t.payFirst : !t.payFirst))
      .sort((a, b) => natural.compare(a.label, b.label))
      .map(async (t) => ({ ...t, svg: await qrSvg(tableUrl(base, t.publicToken)), cta: callToAction(est.plan, t.payFirst) })),
  );

  const href = (next: Partial<{ formato: Format; lugares: Who }>) => {
    const p = new URLSearchParams({ formato: next.formato ?? format, lugares: next.lugares ?? who });
    return `/painel/placas?${p}`;
  };
  // Tamanhos em mm: cada lugar numa página do tamanho da placa (a gráfica imprime-as uma a uma).
  const mm = (v: number) => `${v}mm`;
  const initial = est.name.trim().charAt(0).toUpperCase() || "M";

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 print:m-0 print:max-w-none print:p-0">
      <style>{`@page { size: ${f.w}mm ${f.h}mm; margin: 0 } @media print { html, body { background: #fff } .placa { break-after: page; box-shadow: none !important; margin: 0 !important } }`}</style>
      <div className="print:hidden">
        <Link href="/painel" className="text-sm text-ink-soft underline">
          ← Painel
        </Link>
        <h1 className="mt-3 text-3xl tracking-tight">Placas para imprimir</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-soft">
          Uma página por lugar, no tamanho exato, com o QR de cada um, o logótipo e a cor do restaurante (separador Aparência). Carregue em
          Imprimir, escolha <strong>Guardar como PDF</strong> e envie o PDF à gráfica. Para NFC, grave em cada etiqueta o link do lugar (ver QR Codes
          dos lugares).
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
              href={href({ formato: k, lugares: k === "praia" ? "camas" : "todos" })}
              aria-current={k === format ? "page" : undefined}
              className={`min-h-11 rounded-xl border px-4 py-2.5 text-sm font-semibold ${k === format ? "border-brand bg-brand text-white" : "border-line bg-card"}`}
            >
              {FORMATS[k].label} <span className="font-normal opacity-80">· {FORMATS[k].size}</span>
            </Link>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Lugares">
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
            {places.length} {places.length === 1 ? "placa" : "placas"}
          </span>
        </div>
        <div className="mt-6">
          <PrintButton />
        </div>
        {places.length === 0 && <p className="mt-6 text-ink-soft">Não há lugares deste tipo.</p>}
      </div>

      <div className="mt-8 flex flex-wrap gap-6 print:mt-0 print:block">
        {places.map((t) => (
          <section
            key={t.id}
            aria-label={t.label}
            className="placa relative flex shrink-0 overflow-hidden text-white shadow-lg print:shadow-none"
            style={{
              width: mm(f.w),
              height: mm(f.h),
              background: brand,
              borderRadius: format === "autocolante" ? "50%" : format === "a6" ? "4mm" : "5mm",
              flexDirection: format === "praia" ? "row" : "column",
              alignItems: "center",
              justifyContent: "center",
              gap: format === "praia" ? "7mm" : format === "a6" ? "3.2mm" : "1.6mm",
              padding: format === "praia" ? "8mm" : format === "a6" ? "9mm 8mm 6mm" : "6mm",
              boxSizing: "border-box",
              printColorAdjust: "exact",
              WebkitPrintColorAdjust: "exact",
            }}
          >
            {format === "praia" ? (
              <>
                <div className="shrink-0 rounded-[3mm] bg-white" style={{ width: "62mm", height: "62mm", padding: "4mm", boxSizing: "border-box" }}>
                  <div className="[&_svg]:h-full [&_svg]:w-full" style={{ width: "54mm", height: "54mm" }} dangerouslySetInnerHTML={{ __html: t.svg }} />
                </div>
                <div className="flex min-w-0 flex-col" style={{ gap: "1.6mm" }}>
                  <p className="m-0 font-bold tracking-[0.12em] uppercase opacity-85" style={{ fontSize: "2.6mm" }}>
                    {est.name}
                  </p>
                  <p className="m-0 leading-none font-extrabold" style={{ fontSize: "11mm" }}>
                    {t.label}
                  </p>
                  <p className="m-0 leading-tight font-extrabold" style={{ fontSize: "4.6mm", marginTop: "1.5mm" }}>
                    {t.cta.pt}
                  </p>
                  <p className="m-0 leading-tight opacity-85" style={{ fontSize: "3.1mm" }}>
                    {t.cta.en}
                  </p>
                  {planAllowsPayments(est.plan) && (
                    <p className="m-0 font-semibold opacity-90" style={{ fontSize: "2.7mm", marginTop: "1mm" }}>
                      Apple Pay · MB WAY · cartão
                    </p>
                  )}
                  <div style={{ marginTop: "2mm", opacity: 0.75 }}>
                    <Wordmark height="2.8mm" />
                  </div>
                </div>
              </>
            ) : (
              <>
                {format === "a6" && (
                  <div className="flex items-center" style={{ gap: "2.6mm" }}>
                    {est.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={est.logo} alt="" className="rounded-full bg-white object-contain" style={{ width: "10mm", height: "10mm", padding: "1mm" }} />
                    ) : (
                      <span className="flex items-center justify-center rounded-full bg-white font-extrabold" style={{ width: "10mm", height: "10mm", color: brand, fontSize: "4.6mm" }}>
                        {initial}
                      </span>
                    )}
                    <p className="m-0 font-bold tracking-[0.08em] uppercase" style={{ fontSize: "3.2mm" }}>
                      {est.name}
                    </p>
                  </div>
                )}
                {format === "autocolante" && (
                  <p className="m-0 max-w-[60mm] truncate text-center font-bold tracking-[0.1em] uppercase" style={{ fontSize: "2.3mm" }}>
                    {est.name}
                  </p>
                )}
                {format === "a6" && (
                  <p className="m-0 leading-none font-extrabold" style={{ fontSize: "10mm", marginTop: "1mm" }}>
                    {t.label}
                  </p>
                )}
                <div
                  className="shrink-0 rounded-[3mm] bg-white"
                  style={format === "a6" ? { width: "52mm", height: "52mm", padding: "3.6mm", boxSizing: "border-box" } : { width: "36mm", height: "36mm", padding: "2.4mm", boxSizing: "border-box" }}
                >
                  <div className="h-full w-full [&_svg]:h-full [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: t.svg }} />
                </div>
                {format === "autocolante" && (
                  <p className="m-0 leading-none font-extrabold" style={{ fontSize: "5.4mm", marginTop: "0.6mm" }}>
                    {t.label}
                  </p>
                )}
                <p className="m-0 text-center leading-tight font-extrabold" style={{ fontSize: format === "a6" ? "5.4mm" : "2.6mm", marginTop: format === "a6" ? "1.5mm" : 0 }}>
                  {t.cta.pt}
                  {format === "autocolante" && <span className="font-medium opacity-90"> · {t.cta.en}</span>}
                </p>
                {format === "a6" && (
                  <>
                    <p className="m-0 opacity-85" style={{ fontSize: "3.4mm", marginTop: "-1.6mm" }}>
                      {t.cta.en}
                    </p>
                    <p className="m-0 font-semibold" style={{ fontSize: "2.8mm" }}>
                      Aponte a câmara · ou encoste o telemóvel
                    </p>
                    <div style={{ flexGrow: 1 }} />
                  </>
                )}
                <div style={{ opacity: 0.75 }}>
                  <Wordmark height={format === "a6" ? "3mm" : "2.2mm"} />
                </div>
              </>
            )}
          </section>
        ))}
      </div>
    </main>
  );
}
