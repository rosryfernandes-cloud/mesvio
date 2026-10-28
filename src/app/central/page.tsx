import Link from "next/link";
import { PLAN_LABEL } from "@/lib/plan";
import { getDb } from "@/server/db/client";
import { requirePlatformAdmin } from "@/server/platform/page-guard";
import { getPlatformOverview } from "@/server/platform/platform-service";
import { CentralShell } from "@/components/central/central-shell";
import { formatEur } from "@/lib/money";

export const dynamic = "force-dynamic";

const POS_STATE: Record<string, { label: string; className: string }> = {
  healthy: { label: "A funcionar", className: "bg-[#ecfdf3] text-ok" },
  degraded: { label: "Com falhas", className: "bg-amber-100 text-amber-900" },
  failing: { label: "Em baixo", className: "bg-danger-soft text-danger" },
  not_configured: { label: "Por configurar", className: "bg-line text-ink-soft" },
  disabled: { label: "Desligado", className: "bg-line text-ink-soft" },
};
const POS_NAME: Record<string, string> = { mock: "MockPOS (testes)", zonesoft: "ZoneSoft", mesvio: "Sem POS (ementa MESVIO)" };
const ALERT_CLASS = { danger: "bg-danger-soft text-danger", warning: "bg-amber-50 text-amber-900", info: "bg-brand-soft text-brand" };

export default async function CentralOverviewPage() {
  const admin = await requirePlatformAdmin();
  const o = await getPlatformOverview(await getDb());
  const month = new Date(o.periodStart).toLocaleDateString("pt-PT", { month: "long", year: "numeric", timeZone: "Europe/Lisbon" });
  const kpis = [
    { label: "Restaurantes", value: String(o.totals.restaurants) },
    { label: `Pedidos em ${month}`, value: o.totals.ordersThisMonth.toLocaleString("pt-PT") },
    { label: "Volume elegível sem IVA", value: formatEur(o.totals.netCentsThisMonth) },
    { label: "Comissões (estimativa)", value: formatEur(o.totals.commissionCentsThisMonth) },
  ];

  return (
    <CentralShell adminName={admin.displayName ?? admin.email ?? ""}>
      <h1 className="text-3xl tracking-tight">Visão geral</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Mês de {month}. Contam os pedidos confirmados (aceites, em preparação ou servidos). A comissão é estimada sobre o valor sem
        IVA; o valor a faturar confirma-se com a faturação do POS.
      </p>

      <ul className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <li key={k.label} className="rounded-3xl border border-line bg-card p-5">
            <p className="text-sm text-ink-soft">{k.label}</p>
            <p className="mt-2 text-xl font-extrabold tracking-tight whitespace-nowrap tabular-nums sm:text-3xl">{k.value}</p>
          </li>
        ))}
      </ul>

      <section aria-labelledby="alertas" className="mt-8">
        <h2 id="alertas" className="text-lg">
          Alertas
        </h2>
        {o.alerts.length === 0 ? (
          <p className="mt-3 rounded-2xl bg-[#ecfdf3] px-4 py-3 text-sm text-ok">Sem alertas. Tudo a funcionar.</p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {o.alerts.map((a, i) => (
              <li key={i} className={`rounded-2xl px-4 py-3 text-sm ${ALERT_CLASS[a.level]}`}>
                {a.establishmentId ? (
                  <Link href={`/central/restaurantes/${a.establishmentId}`} className="underline-offset-2 hover:underline">
                    {a.text}
                  </Link>
                ) : (
                  a.text
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="restaurantes" className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="restaurantes" className="text-lg">
            Restaurantes
          </h2>
          <Link href="/central/restaurantes/novo" className="min-h-10 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white">
            Novo restaurante
          </Link>
        </div>
        {o.establishments.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-line px-6 py-10 text-center text-ink-soft">Ainda não há restaurantes.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-3xl border border-line bg-card">
            <table className="w-full min-w-[46rem] text-left text-sm">
              <thead className="border-b border-line text-ink-soft">
                <tr>
                  <th scope="col" className="px-5 py-3 font-semibold">Restaurante</th>
                  <th scope="col" className="px-5 py-3 font-semibold">POS</th>
                  <th scope="col" className="px-5 py-3 text-right font-semibold">Lugares</th>
                  <th scope="col" className="px-5 py-3 text-right font-semibold">Pedidos</th>
                  <th scope="col" className="px-5 py-3 text-right font-semibold">Sem IVA</th>
                  <th scope="col" className="px-5 py-3 text-right font-semibold">Comissão</th>
                </tr>
              </thead>
              <tbody>
                {o.establishments.map((e) => {
                  const pos = POS_STATE[e.posStatus] ?? POS_STATE.not_configured;
                  return (
                    <tr key={e.id} className="border-b border-line last:border-0">
                      <td className="px-5 py-3">
                        <Link href={`/central/restaurantes/${e.id}`} className="font-semibold text-brand hover:underline">
                          {e.name}
                        </Link>
                        <span className="block text-xs text-ink-soft">{e.legalName}</span>
                        <span className="mt-1 inline-block rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand">{PLAN_LABEL[e.plan]}</span>
                      </td>
                      <td className="px-5 py-3">
                        <span className="block">{POS_NAME[e.posProvider] ?? e.posProvider}</span>
                        <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${pos.className}`}>{pos.label}</span>
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">{e.tables}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{e.ordersThisMonth.toLocaleString("pt-PT")}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{formatEur(e.netCentsThisMonth)}</td>
                      <td className="px-5 py-3 text-right font-semibold tabular-nums">
                        {formatEur(e.commissionCentsThisMonth)}
                        <span className="block text-xs font-normal text-ink-soft">{(e.commissionBps / 100).toLocaleString("pt-PT")}%</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </CentralShell>
  );
}
