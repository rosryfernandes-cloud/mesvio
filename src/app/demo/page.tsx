import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { DEMO_ESTABLISHMENT, DEMO_TABLES } from "@/server/pos/mock/demo-data";

export const metadata: Metadata = { title: "Demonstração", robots: { index: false, follow: false } };

/** Demonstração: atalhos para as mesas do restaurante de demonstração (dados do MockPOS). */
export default function DemoPage() {
  const zones = [...new Set(DEMO_TABLES.map((t) => t.zone))];
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <Link href="/" aria-label="MESVIO — início" className="inline-block rounded-md">
        <Logo className="h-6 w-auto" />
      </Link>
      <p className="mt-10 flex w-fit rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold tracking-wide text-brand uppercase">
        Ambiente de demonstração
      </p>
      <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">Experimente como um cliente</h1>
      <p className="mt-3 max-w-xl leading-relaxed text-ink-soft">
        Escolha um lugar do <strong className="text-ink">{DEMO_ESTABLISHMENT.name}</strong> para abrir a ementa como se tivesse
        lido o QR Code ou aproximado o telemóvel do NFC.
      </p>

      {zones.map((zone) => {
        const tables = DEMO_TABLES.filter((t) => t.zone === zone);
        return (
          <section key={zone} aria-label={zone} className="mt-10">
            <h2 className="text-sm font-semibold tracking-wide text-ink-soft uppercase">
              {zone}
              {tables[0]?.orderingMode === "pay_first" && <span className="font-normal normal-case"> · pagam ao pedir</span>}
            </h2>
            <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
              {tables.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/m/${t.publicToken}`}
                    className="flex h-16 items-center justify-center rounded-2xl border border-line bg-card font-semibold transition hover:border-brand"
                  >
                    {t.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <div className="mt-12 grid gap-3 sm:grid-cols-2">
        <Link
          href={`/painel/entrar?r=${DEMO_ESTABLISHMENT.slug}`}
          className="rounded-2xl bg-brand p-5 text-white transition hover:bg-forest"
        >
          <span className="block font-bold">Painel do restaurante →</span>
          <span className="mt-1 block text-sm text-white/75">Pedidos em tempo real, mesas, esgotados e equipa.</span>
        </Link>
        <Link href="/qr" className="rounded-2xl border border-line bg-card p-5 transition hover:border-brand">
          <span className="block font-bold">QR Codes e NFC →</span>
          <span className="mt-1 block text-sm text-ink-soft">Folha para imprimir e URLs para gravar nas etiquetas.</span>
        </Link>
        <Link href="/central" className="rounded-2xl border border-line bg-card p-5 transition hover:border-brand sm:col-span-2">
          <span className="block font-bold">Painel central MESVIO →</span>
          <span className="mt-1 block text-sm text-ink-soft">Gestão da plataforma: restaurantes, mesas, QR Codes, pedidos e comissões. Com 2FA.</span>
        </Link>
      </div>

      <p className="mt-10 text-xs text-ink-soft">
        Dados simulados pelo MockPOS. A integração ZoneSoft aguarda documentação oficial; os pagamentos usam um fornecedor simulado.
      </p>
    </main>
  );
}
