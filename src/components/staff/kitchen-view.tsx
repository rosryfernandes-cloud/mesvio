"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Ecrã da cozinha: os pedidos aceites por ordem de chegada, com o tempo de espera a contar, e um
 * toque em "Pronto" quando sai. Filtra por posto (cozinha / bar) para pôr um tablet em cada um.
 */

type Line = { name: string; quantity: number; modifierNames: string[]; notes?: string; station: "kitchen" | "bar" };
type Order = { id: string; shortCode: string; tableLabel: string; status: string; createdAt: string; notes?: string; awaitingApproval: boolean; lines: Line[] };
const WAITING = new Set(["RECEIVED", "SUBMITTING", "SUBMITTED", "ACCEPTED", "IN_PREPARATION"]);

export function KitchenView({ establishmentName }: { establishmentName: string }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [station, setStation] = useState<"all" | "kitchen" | "bar">("all");
  const [now, setNow] = useState(() => Date.now());
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/painel/pedidos", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return setOffline(true);
    setOffline(false);
    const board = await res.json();
    setOrders(board.orders);
  }, []);

  useEffect(() => {
    void load();
    try {
      const saved = localStorage.getItem("mesvio-cozinha-posto");
      if (saved === "kitchen" || saved === "bar") setStation(saved);
    } catch {}
    const poll = setInterval(() => void load(), 5000);
    const tick = setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [load]);

  async function ready(o: Order) {
    setBusy(o.id);
    await fetch(`/api/painel/pedidos/${o.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "ready" }) }).catch(() => null);
    setBusy(null);
    void load();
  }

  const visible = orders
    .filter((o) => WAITING.has(o.status) && !o.awaitingApproval)
    .map((o) => ({ ...o, lines: station === "all" ? o.lines : o.lines.filter((l) => l.station === station) }))
    .filter((o) => o.lines.length > 0)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return (
    <main className="min-h-dvh bg-ink p-4 text-paper">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm tracking-wide uppercase opacity-70">Cozinha · {establishmentName}</p>
          <h1 className="text-3xl font-extrabold">{visible.length === 0 ? "Sem pedidos" : `${visible.length} ${visible.length === 1 ? "pedido" : "pedidos"}`}</h1>
        </div>
        <div className="flex gap-1" role="group" aria-label="Posto">
          {(["all", "kitchen", "bar"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setStation(s);
                try {
                  localStorage.setItem("mesvio-cozinha-posto", s);
                } catch {}
              }}
              className={`min-h-11 rounded-xl px-4 font-semibold ${station === s ? "bg-paper text-ink" : "bg-white/10"}`}
            >
              {s === "all" ? "Tudo" : s === "kitchen" ? "Cozinha" : "Bar"}
            </button>
          ))}
          <a href="/painel" className="ml-2 grid min-h-11 place-items-center rounded-xl bg-white/10 px-4 text-sm">
            Painel
          </a>
        </div>
      </header>
      {offline && <p className="mb-3 rounded-xl bg-red-700 px-4 py-2">Sem ligação. A tentar de novo…</p>}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {visible.map((o) => {
          const min = Math.max(0, Math.floor((now - new Date(o.createdAt).getTime()) / 60_000));
          const late = min >= 20, warn = min >= 10;
          return (
            <li key={o.id} className={`flex flex-col rounded-2xl bg-paper text-ink ${late ? "ring-4 ring-red-500" : warn ? "ring-4 ring-amber-400" : ""}`}>
              <div className="flex items-baseline justify-between gap-2 border-b border-line px-4 py-3">
                <span className="text-2xl font-extrabold">{o.tableLabel}</span>
                <span className="text-sm text-ink-soft">#{o.shortCode}</span>
                <span className={`font-bold tabular-nums ${late ? "text-red-600" : warn ? "text-amber-700" : "text-ok"}`}>{min} min</span>
              </div>
              <ul className="flex-1 px-4 py-3 text-lg">
                {o.lines.map((l, i) => (
                  <li key={i} className="py-1">
                    <strong className="tabular-nums">{l.quantity}×</strong> {l.name}
                    {l.modifierNames.length > 0 && <span className="block text-base text-ink-soft">{l.modifierNames.join(", ")}</span>}
                    {l.notes && <span className="block text-base font-semibold text-red-700">⚠ {l.notes}</span>}
                  </li>
                ))}
                {o.notes && <li className="mt-1 text-base font-semibold text-red-700">Nota: {o.notes}</li>}
              </ul>
              {o.status === "ACCEPTED" ? (
                <button type="button" disabled={busy === o.id} onClick={() => void ready(o)} className="m-3 min-h-14 rounded-xl bg-ok text-xl font-bold text-white disabled:opacity-60">
                  {busy === o.id ? "…" : "Pronto"}
                </button>
              ) : (
                <p className="m-3 rounded-xl bg-line/60 py-3 text-center text-sm">A confirmar com o POS…</p>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
