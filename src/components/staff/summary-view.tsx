"use client";

import { useCallback, useEffect, useState } from "react";
import type { DaySummary } from "@/server/staff/summary-service";
import { formatEur } from "@/lib/money";

function wait(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 1) return "< 1 s";
  return seconds < 60 ? `${seconds} s` : `${Math.round(seconds / 60)} min`;
}

/** Resumo do dia para o dono/gerente: os números de hoje, atualizados a cada minuto. */
export function SummaryView() {
  const [data, setData] = useState<DaySummary | null>(null);
  const load = useCallback(async () => {
    const res = await fetch("/api/painel/resumo", { cache: "no-store" }).catch(() => null);
    if (res?.ok) setData(await res.json());
  }, []);
  useEffect(() => {
    void load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  if (!data) return <p className="text-ink-soft">A carregar…</p>;
  const kpis = [
    { label: "Pedidos hoje", value: String(data.orders) },
    { label: "Vendas hoje", value: formatEur(data.salesCents) },
    { label: "Ticket médio", value: data.orders ? formatEur(data.averageTicketCents) : "—" },
    { label: "Do pedido à cozinha", value: wait(data.secondsToKitchen) },
  ];
  const peak = Math.max(1, ...data.byHour.map((h) => h.orders));

  return (
    <div className="grid gap-4">
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <li key={k.label} className="rounded-2xl border border-line bg-card p-5">
            <p className="text-sm text-ink-soft">{k.label}</p>
            <p className="mt-1 text-3xl font-extrabold tracking-tight tabular-nums">{k.value}</p>
          </li>
        ))}
      </ul>
      {data.orders === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-ink-soft">Ainda não há vendas hoje. Os números aparecem aqui ao longo do dia.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border border-line bg-card p-5" aria-label="Pedidos por hora">
            <h2 className="font-semibold">Pedidos por hora</h2>
            <ul className="mt-4 grid gap-2">
              {data.byHour.map((h) => (
                <li key={h.hour} className="flex items-center gap-3 text-sm">
                  <span className="w-12 shrink-0 tabular-nums text-ink-soft">{String(h.hour).padStart(2, "0")}h</span>
                  <span className="h-6 rounded-md bg-brand" style={{ width: `${(h.orders / peak) * 100}%`, minWidth: "0.5rem" }} />
                  <span className="tabular-nums">{h.orders}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-2xl border border-line bg-card p-5" aria-label="Mais pedidos hoje">
            <h2 className="font-semibold">Mais pedidos hoje</h2>
            <ol className="mt-4 grid gap-2">
              {data.topProducts.map((p, i) => (
                <li key={p.name} className="flex items-baseline justify-between gap-3 border-b border-line pb-2 last:border-0">
                  <span>
                    <span className="mr-2 text-ink-soft tabular-nums">{i + 1}.</span>
                    {p.name}
                  </span>
                  <span className="font-semibold tabular-nums">{p.quantity}×</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}
      <p className="text-sm text-ink-soft">Contam os pedidos que chegaram à cozinha hoje (os recusados, cancelados ou por pagar não entram). Valores com IVA.</p>
    </div>
  );
}
