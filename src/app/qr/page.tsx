import type { Metadata } from "next";
import { headers } from "next/headers";
import { DEMO_ESTABLISHMENT, DEMO_TABLES } from "@/server/pos/mock/demo-data";
import { tableUrl } from "@/server/tables/table-token";
import { isLocalOnlyUrl, resolvePublicBaseUrl, tableQrSvg } from "@/server/tables/table-qr";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "QR Codes das mesas", robots: { index: false, follow: false } };

/**
 * Folha de QR Codes / URLs NFC das mesas de demonstração.
 * Na Fase 4 passa para o painel do restaurante, atrás de autenticação.
 */
export default async function QrSheetPage() {
  const h = await headers();
  const base = resolvePublicBaseUrl(process.env.NEXT_PUBLIC_APP_URL, h.get("host"), h.get("x-forwarded-proto"));
  const tables = await Promise.all(
    DEMO_TABLES.filter((t) => t.active).map(async (t) => {
      const url = tableUrl(base, t.publicToken);
      return { id: t.id, label: t.label, url, svg: await tableQrSvg(url) };
    }),
  );

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 print:max-w-none print:p-0">
      <div className="print:hidden">
        <p className="text-sm font-medium tracking-wide text-brand uppercase">{DEMO_ESTABLISHMENT.name}</p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-4xl">QR Codes e NFC das mesas</h1>
        <p className="mt-3 max-w-2xl text-ink-soft">
          Imprima e coloque um em cada mesa. Para NFC, grave o URL de cada mesa numa etiqueta NTAG213/215 como
          registo <strong className="text-ink">URI</strong> (por exemplo com a app gratuita NFC Tools) — o cliente só
          tem de aproximar o telemóvel.
        </p>
        {isLocalOnlyUrl(base) && (
          <p role="alert" className="mt-4 max-w-2xl rounded-xl border border-amber-500 bg-amber-50 px-4 py-3 text-sm">
            <strong>Atenção:</strong> estes códigos apontam para <code>{base}</code>, que um telemóvel não consegue abrir.
            Abra esta página pelo IP do computador na rede (ex.: <code>http://192.168.1.20:3000/qr</code>) ou defina{" "}
            <code>NEXT_PUBLIC_APP_URL</code> com o domínio público.
          </p>
        )}
        <div className="mt-6">
          <PrintButton />
        </div>
      </div>

      <ul className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 print:mt-0 print:grid-cols-2 print:gap-0">
        {tables.map((t) => (
          <li
            key={t.id}
            className="flex break-inside-avoid flex-col items-center rounded-3xl border border-line bg-card p-6 text-center print:rounded-none print:border-dashed print:p-8"
          >
            <p className="font-[family-name:var(--font-display)] text-xl">{DEMO_ESTABLISHMENT.name}</p>
            <p className="mt-1 text-3xl font-semibold">{t.label}</p>
            <div className="mt-4 w-48 [&>svg]:h-auto [&>svg]:w-full" role="img" aria-label={`QR Code da ${t.label}`}
              // SVG gerado pela biblioteca qrcode a partir de um URL nosso — sem conteúdo do utilizador.
              dangerouslySetInnerHTML={{ __html: t.svg }}
            />
            <p className="mt-4 font-semibold">Aponte a câmara ou aproxime o telemóvel</p>
            <p className="text-sm text-ink-soft">Veja a ementa e peça diretamente à cozinha</p>
            <p className="mt-3 text-[10px] break-all text-ink-soft select-all print:hidden">{t.url}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
