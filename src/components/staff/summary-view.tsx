"use client";

import { useCallback, useEffect, useState } from "react";
import type { DaySummary, WeekSummary } from "@/server/staff/summary-service";
import { formatEur } from "@/lib/money";

type Period = "dia" | "semana";

function wait(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 1) return "< 1 s";
  return seconds < 60 ? `${seconds} s` : `${Math.round(seconds / 60)} min`;
}

/** "+12% que na semana anterior"; null quando a semana anterior não tem dados para comparar. */
function versus(now: number, before: number): { text: string; up: boolean } | null {
  if (before <= 0) return null;
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return { text: "igual à semana anterior", up: true };
  return { text: `${pct > 0 ? "+" : ""}${pct}% que na semana anterior`, up: pct > 0 };
}

const weekday = (date: string, style: "short" | "long") =>
  new Intl.DateTimeFormat("pt-PT", { weekday: style, timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`)).replace(".", "");

const hourRange = (h: number) => `${String(h).padStart(2, "0")}h–${String((h + 1) % 24).padStart(2, "0")}h`;

/** Resumo para o dono/gerente: o dia de hoje, atualizado a cada minuto, ou os últimos 7 dias. */
export function SummaryView() {
  const [period, setPeriod] = useState<Period>("dia");
  const [day, setDay] = useState<DaySummary | null>(null);
  const [week, setWeek] = useState<WeekSummary | null>(null);

  const load = useCallback(async (p: Period) => {
    const res = await fetch(p === "semana" ? "/api/painel/resumo?periodo=semana" : "/api/painel/resumo", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const data = await res.json();
    if (p === "semana") setWeek(data);
    else setDay(data);
  }, []);
  useEffect(() => {
    void load(period);
    const t = setInterval(() => load(period), 60_000);
    return () => clearInterval(t);
  }, [load, period]);

  return (
    <div className="grid gap-4">
      <div role="group" aria-label="Período" className="flex gap-2">
        {(
          [
            ["dia", "Hoje"],
            ["semana", "Últimos 7 dias"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={period === id}
            onClick={() => setPeriod(id)}
            className={`min-h-11 rounded-xl border px-4 font-semibold ${period === id ? "border-brand bg-brand text-white" : "border-line bg-card"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {period === "dia" ? <DayView data={day} /> : <WeekView data={week} />}
    </div>
  );
}

function Kpis({ items }: { items: { label: string; value: string; note?: { text: string; up: boolean } | null }[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((k) => (
        <li key={k.label} className="rounded-2xl border border-line bg-card p-5">
          <p className="text-sm text-ink-soft">{k.label}</p>
          <p className="mt-1 text-3xl font-extrabold tracking-tight tabular-nums">{k.value}</p>
          {k.note && <p className={`mt-1 text-sm font-semibold ${k.note.up ? "text-ok" : "text-danger"}`}>{k.note.text}</p>}
        </li>
      ))}
    </ul>
  );
}

function Bars({ title, rows }: { title: string; rows: { key: string; label: string; value: number; display?: string }[] }) {
  const peak = Math.max(1, ...rows.map((r) => r.value));
  return (
    <section className="rounded-2xl border border-line bg-card p-5" aria-label={title}>
      <h2 className="font-semibold">{title}</h2>
      <ul className="mt-4 grid gap-2">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center gap-3 text-sm">
            <span className="w-12 shrink-0 tabular-nums text-ink-soft">{r.label}</span>
            <span className="h-6 rounded-md bg-brand" style={{ width: `${(r.value / peak) * 100}%`, minWidth: r.value ? "0.5rem" : "0" }} />
            <span className="tabular-nums">{r.display ?? r.value}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Top({ title, items }: { title: string; items: { name: string; quantity: number }[] }) {
  return (
    <section className="rounded-2xl border border-line bg-card p-5" aria-label={title}>
      <h2 className="font-semibold">{title}</h2>
      <ol className="mt-4 grid gap-2">
        {items.map((p, i) => (
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
  );
}

function DayView({ data }: { data: DaySummary | null }) {
  if (!data) return <p className="text-ink-soft">A carregar…</p>;
  return (
    <>
      <Kpis
        items={[
          { label: "Pedidos hoje", value: String(data.orders) },
          { label: "Vendas hoje", value: formatEur(data.salesCents) },
          { label: "Ticket médio", value: data.orders ? formatEur(data.averageTicketCents) : "—" },
          { label: "Do pedido à cozinha", value: wait(data.secondsToKitchen) },
        ]}
      />
      {data.orders === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-ink-soft">Ainda não há vendas hoje. Os números aparecem aqui ao longo do dia.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Bars title="Pedidos por hora" rows={data.byHour.map((h) => ({ key: String(h.hour), label: `${String(h.hour).padStart(2, "0")}h`, value: h.orders }))} />
          <Top title="Mais pedidos hoje" items={data.topProducts} />
        </div>
      )}
      <p className="text-sm text-ink-soft">Contam os pedidos que chegaram à cozinha hoje (os recusados, cancelados ou por pagar não entram). Valores com IVA.</p>
    </>
  );
}

function WeekView({ data }: { data: WeekSummary | null }) {
  if (!data) return <p className="text-ink-soft">A carregar…</p>;
  const best = data.orders ? data.byDay.reduce((a, b) => (b.salesCents > a.salesCents ? b : a)) : null;
  const busiest = data.byHour.length ? data.byHour.reduce((a, b) => (b.orders > a.orders ? b : a)) : null;
  const highlights = [
    best && `O melhor dia foi ${weekday(best.date, "long")}, com ${formatEur(best.salesCents)} em vendas.`,
    busiest && `A hora de mais movimento foi das ${hourRange(busiest.hour)}: reforce a equipa a essa hora.`,
    data.topProducts[0] && `O mais pedido foi ${data.topProducts[0].name} (${data.topProducts[0].quantity}×).`,
  ].filter(Boolean) as string[];

  return (
    <>
      <Kpis
        items={[
          { label: "Pedidos", value: String(data.orders), note: versus(data.orders, data.previous.orders) },
          { label: "Vendas", value: formatEur(data.salesCents), note: versus(data.salesCents, data.previous.salesCents) },
          { label: "Ticket médio", value: data.orders ? formatEur(data.averageTicketCents) : "—" },
          { label: "Melhor dia", value: best ? weekday(best.date, "long") : "—" },
        ]}
      />
      {data.orders === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-ink-soft">Ainda não há vendas nos últimos 7 dias.</p>
      ) : (
        <>
          <section className="rounded-2xl border border-line bg-card p-5" aria-label="A semana em resumo">
            <h2 className="font-semibold">A semana em resumo</h2>
            <ul className="mt-2 grid list-disc gap-1 pl-5">
              {highlights.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          </section>
          <div className="grid gap-4 lg:grid-cols-2">
            <Bars
              title="Vendas por dia"
              rows={data.byDay.map((d) => ({ key: d.date, label: weekday(d.date, "short"), value: d.salesCents, display: formatEur(d.salesCents) }))}
            />
            <Bars title="Pedidos por hora" rows={data.byHour.map((h) => ({ key: String(h.hour), label: `${String(h.hour).padStart(2, "0")}h`, value: h.orders }))} />
            <Top title="Mais pedidos da semana" items={data.topProducts} />
            {data.notOrdered.length > 0 && (
              <section className="rounded-2xl border border-line bg-card p-5" aria-label="Ninguém pediu esta semana">
                <h2 className="font-semibold">Ninguém pediu esta semana</h2>
                <p className="mt-1 text-sm text-ink-soft">Vale a pena pôr uma foto, mudar a descrição ou tirar da ementa.</p>
                <ul className="mt-3 grid gap-1">
                  {data.notOrdered.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </>
      )}
      <p className="text-sm text-ink-soft">
        Últimos 7 dias, hoje incluído, comparados com os 7 dias anteriores. Contam os pedidos que chegaram à cozinha. Valores com IVA.
      </p>
    </>
  );
}
