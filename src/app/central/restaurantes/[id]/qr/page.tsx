import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { requirePlatformAdmin } from "@/server/platform/page-guard";
import { getEstablishmentDetail } from "@/server/platform/platform-service";
import { tableUrl } from "@/server/tables/table-token";
import { isLocalOnlyUrl, resolvePublicBaseUrl, tableQrSvg } from "@/server/tables/table-qr";
import { PrintButton } from "@/app/qr/print-button";
import { Logo } from "@/components/brand/logo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "QR Codes" };

/** Folha de QR Codes e URLs NFC de um restaurante, para imprimir. */
export default async function EstablishmentQrPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformAdmin();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const d = await getEstablishmentDetail(await getDb(), id);
  if (!d) notFound();
  const h = await headers();
  const base = resolvePublicBaseUrl(process.env.NEXT_PUBLIC_APP_URL, h.get("host"), h.get("x-forwarded-proto"));
  const tables = await Promise.all(
    d.tables
      .filter((t) => t.active)
      .map(async (t) => {
        const url = tableUrl(base, t.publicToken);
        return { ...t, url, svg: await tableQrSvg(url) };
      }),
  );

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 print:max-w-none print:p-0">
      <div className="print:hidden">
        <Link href={`/central/restaurantes/${id}`} className="text-sm text-ink-soft underline">
          ← {d.summary.name}
        </Link>
        <h1 className="mt-3 text-3xl tracking-tight">QR Codes · {d.summary.name}</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-soft">
          Um por lugar. Para NFC, grave o URL de cada lugar numa etiqueta NTAG213/215 como registo URI (ex.: app NFC Tools).
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
        {tables.map((t) => (
          <li key={t.id} className="flex break-inside-avoid flex-col items-center rounded-2xl border border-line bg-white p-4 text-center print:rounded-none print:border-dashed">
            <p className="text-lg font-bold">{t.label}</p>
            <div className="mt-2 w-40 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: t.svg }} />
            <p className="mt-2 text-xs text-ink-soft">Leia ou aproxime o telemóvel para pedir</p>
            <p className="mt-1 text-[10px] break-all text-ink-soft print:hidden">{t.url}</p>
            <Logo className="mt-2 h-3 w-auto" />
          </li>
        ))}
      </ul>
    </main>
  );
}
