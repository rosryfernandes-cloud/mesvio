import Link from "next/link";
import { headers } from "next/headers";
import { tableUrl } from "@/server/tables/table-token";
import { isLocalOnlyUrl, resolvePublicBaseUrl, tableQrSvg } from "@/server/tables/table-qr";
import { PrintButton } from "@/app/qr/print-button";
import { Logo } from "@/components/brand/logo";
import { TableQrActions } from "./table-qr-actions";

export interface QrSheetTable {
  id: string;
  label: string;
  publicToken: string;
  active: boolean;
}

/** Folha de QR Codes e URLs NFC para imprimir, com ações por lugar (escondidas na impressão). */
export async function QrSheet({
  title,
  back,
  tables,
  actionsEndpoint,
  canDeactivate,
}: {
  title: string;
  back: { href: string; label: string };
  tables: QrSheetTable[];
  /** Ex.: (id) => `/api/painel/mesas/${id}`. Sem isto, não há botões. */
  actionsEndpoint?: (tableId: string) => string;
  canDeactivate: boolean;
}) {
  const h = await headers();
  const base = resolvePublicBaseUrl(process.env.NEXT_PUBLIC_APP_URL, h.get("host"), h.get("x-forwarded-proto"));
  const active = await Promise.all(
    tables
      .filter((t) => t.active)
      .map(async (t) => {
        const url = tableUrl(base, t.publicToken);
        return { ...t, url, svg: await tableQrSvg(url) };
      }),
  );
  const inactive = tables.filter((t) => !t.active);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 print:max-w-none print:p-0">
      <div className="print:hidden">
        <Link href={back.href} className="text-sm text-ink-soft underline">
          ← {back.label}
        </Link>
        <h1 className="mt-3 text-3xl tracking-tight">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-soft">
          Um por lugar. Para NFC, grave o URL de cada lugar numa etiqueta NTAG213/215 como registo URI (ex.: app NFC Tools). Se um
          QR for fotografado e usado para pedir de fora, gere um novo: o antigo deixa logo de funcionar.
        </p>
        {isLocalOnlyUrl(base) && (
          <p role="alert" className="mt-4 max-w-2xl rounded-xl border border-amber-500 bg-amber-50 px-4 py-3 text-sm">
            <strong>Atenção:</strong> estes códigos apontam para <code>{base}</code>, que um telemóvel não abre. Defina{" "}
            <code>NEXT_PUBLIC_APP_URL</code> com o domínio público antes de imprimir.
          </p>
        )}
        <div className="mt-6">
          <PrintButton />
        </div>
      </div>
      <ul className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 print:mt-0 print:grid-cols-3 print:gap-0">
        {active.map((t) => (
          <li key={t.id} className="flex break-inside-avoid flex-col items-center rounded-2xl border border-line bg-white p-4 text-center print:rounded-none print:border-dashed">
            <p className="text-lg font-bold">{t.label}</p>
            <div className="mt-2 w-40 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: t.svg }} />
            <p className="mt-2 text-xs text-ink-soft">Leia ou aproxime o telemóvel para pedir</p>
            <p className="mt-1 text-[10px] break-all text-ink-soft print:hidden">{t.url}</p>
            <Logo className="mt-2 h-3 w-auto" />
            {actionsEndpoint && (
              <TableQrActions endpoint={actionsEndpoint(t.id)} actions={canDeactivate ? ["rotate_qr", "deactivate"] : ["rotate_qr"]} />
            )}
          </li>
        ))}
      </ul>
      {inactive.length > 0 && (
        <section className="mt-10 print:hidden" aria-labelledby="desativados">
          <h2 id="desativados" className="text-lg">
            Lugares desativados
          </h2>
          <ul className="mt-3 flex flex-wrap gap-3">
            {inactive.map((t) => (
              <li key={t.id} className="rounded-2xl border border-dashed border-line px-4 py-3 text-center">
                <p className="font-semibold text-ink-soft">{t.label}</p>
                {actionsEndpoint && canDeactivate && <TableQrActions endpoint={actionsEndpoint(t.id)} actions={["activate"]} />}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
