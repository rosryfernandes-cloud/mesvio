import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { formatEur } from "@/lib/money";

export const metadata: Metadata = { title: "Painel central (demonstração)", robots: { index: false, follow: false } };

/**
 * Proposta de design do painel central da MESVIO. Ainda NÃO existe painel central real:
 * todos os números abaixo são fictícios, escritos à mão, e não vêm da base de dados.
 */
const DEMO = {
  partners: 12,
  ordersMonth: 18_420,
  eligibleNetCents: 41_250_000,
  commissionRate: 0.01,
  establishments: [
    { name: "Restaurante Exemplo A", city: "Lisboa", pos: "MockPOS", posState: "ok", orders: 3_210, netCents: 7_480_000 },
    { name: "Bar de Praia Exemplo B", city: "Costa da Caparica", pos: "MockPOS", posState: "ok", orders: 5_870, netCents: 11_920_000 },
    { name: "Hotel Exemplo C", city: "Porto", pos: "ZoneSoft (por ligar)", posState: "pending", orders: 0, netCents: 0 },
    { name: "Piscina Exemplo D", city: "Albufeira", pos: "MockPOS", posState: "warning", orders: 1_940, netCents: 3_610_000 },
  ],
  alerts: [
    { level: "warning", text: "Piscina Exemplo D: 3 pedidos à espera de verificação no POS há mais de 10 min." },
    { level: "info", text: "Hotel Exemplo C: integração ZoneSoft aguarda credenciais do fabricante." },
  ],
} as const;

const POS_STATE = {
  ok: { label: "A funcionar", className: "bg-[#ecfdf3] text-ok" },
  warning: { label: "Atenção", className: "bg-amber-100 text-amber-900" },
  pending: { label: "Por ligar", className: "bg-line text-ink-soft" },
} as const;

export default function CentralDemoPage() {
  const commissionCents = Math.round(DEMO.eligibleNetCents * DEMO.commissionRate);
  const kpis = [
    { label: "Restaurantes parceiros", value: String(DEMO.partners) },
    { label: "Pedidos processados (mês)", value: DEMO.ordersMonth.toLocaleString("pt-PT") },
    { label: "Volume elegível sem IVA", value: formatEur(DEMO.eligibleNetCents) },
    { label: "Comissões (1%)", value: formatEur(commissionCents) },
  ];

  return (
    <div className="min-h-dvh">
      <div role="note" className="bg-amber-400 px-4 py-2 text-center text-sm font-semibold text-ink">
        Demonstração de design · todos os dados desta página são fictícios
      </div>
      <header className="on-dark bg-brand text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/" aria-label="MESVIO — início" className="rounded-md">
            <Logo variant="dark" className="h-6 w-auto" />
          </Link>
          <span className="rounded-full border border-white/20 px-3 py-1 text-xs font-semibold tracking-wide text-mint uppercase">
            Central
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="text-3xl tracking-tight">Visão geral</h1>
        <p className="mt-1 text-ink-soft">Exemplo de como a equipa MESVIO acompanharia a plataforma.</p>

        <ul className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {kpis.map((k) => (
            <li key={k.label} className="rounded-3xl border border-line bg-card p-5">
              <p className="text-sm text-ink-soft">{k.label}</p>
              <p className="mt-2 text-xl font-extrabold tracking-tight whitespace-nowrap tabular-nums sm:text-3xl">{k.value}</p>
              <p className="mt-1 text-xs text-ink-soft">fictício</p>
            </li>
          ))}
        </ul>

        <section aria-labelledby="alertas" className="mt-8">
          <h2 id="alertas" className="text-lg">
            Alertas de funcionamento
          </h2>
          <ul className="mt-3 grid gap-2">
            {DEMO.alerts.map((a) => (
              <li
                key={a.text}
                className={`rounded-2xl px-4 py-3 text-sm ${a.level === "warning" ? "bg-amber-50 text-amber-900" : "bg-brand-soft text-brand"}`}
              >
                {a.text}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="estabelecimentos" className="mt-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="estabelecimentos" className="text-lg">
              Estabelecimentos e integrações
            </h2>
            <button type="button" disabled className="min-h-10 rounded-full bg-brand px-4 text-sm font-semibold text-white opacity-50">
              Adicionar estabelecimento
            </button>
          </div>
          <div className="mt-3 overflow-x-auto rounded-3xl border border-line bg-card">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="border-b border-line text-ink-soft">
                <tr>
                  <th scope="col" className="px-5 py-3 font-semibold">Estabelecimento</th>
                  <th scope="col" className="px-5 py-3 font-semibold">POS</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Estado</th>
                  <th scope="col" className="px-5 py-3 text-right font-semibold">Pedidos</th>
                  <th scope="col" className="px-5 py-3 text-right font-semibold">Elegível s/ IVA</th>
                  <th scope="col" className="px-5 py-3 text-right font-semibold">Comissão</th>
                </tr>
              </thead>
              <tbody>
                {DEMO.establishments.map((e) => {
                  const state = POS_STATE[e.posState];
                  return (
                    <tr key={e.name} className="border-b border-line last:border-0">
                      <td className="px-5 py-3">
                        <span className="block font-semibold">{e.name}</span>
                        <span className="text-ink-soft">{e.city}</span>
                      </td>
                      <td className="px-5 py-3">{e.pos}</td>
                      <td className="px-5 py-3">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${state.className}`}>{state.label}</span>
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">{e.orders.toLocaleString("pt-PT")}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{formatEur(e.netCents)}</td>
                      <td className="px-5 py-3 text-right font-semibold tabular-nums">
                        {formatEur(Math.round(e.netCents * DEMO.commissionRate))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <p className="mt-8 text-xs text-ink-soft">
          Este ecrã ainda não está ligado a dados. Quando existir, deve ler os pedidos e pagamentos reais com uma conta de
          administração própria, fora do acesso dos restaurantes.
        </p>
      </main>
    </div>
  );
}
