"use client";

import { useCallback, useEffect, useState } from "react";
import { formatEur } from "@/lib/money";
import type { ClosedTable } from "@/server/tables/assignments";

const PAID_LABEL: Record<string, string> = { cash: "dinheiro", card: "multibanco", other: "outro" };

/** Mesas por empregado (dono/gerente, em teste): ligar, fim de turno e quem fechou que mesas. */
export function AssignmentsCard({ onChange }: { onChange: () => void }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [closures, setClosures] = useState<ClosedTable[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/painel/mesas/responsaveis", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const d = await res.json();
    setEnabled(d.enabled);
    setClosures(d.closures ?? []);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function post(body: unknown, done: string) {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/painel/mesas/responsaveis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    setBusy(false);
    setMessage(res?.ok ? done : "Não foi possível guardar. Tente de novo.");
    await load();
    onChange();
  }

  if (enabled === null) return null;
  return (
    <section className="rounded-2xl border border-line bg-card p-4">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 size-5 accent-[var(--color-brand)]"
          checked={enabled}
          disabled={busy}
          onChange={(e) => post({ enabled: e.target.checked }, e.target.checked ? "Mesas por empregado ligadas." : "Mesas por empregado desligadas.")}
        />
        <span>
          <span className="font-semibold">Mesas por empregado</span>
          <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">em teste</span>
          <span className="block text-sm text-ink-soft">
            Cada mesa tem um responsável e cada empregado vê as suas primeiro. Fechar a mesa de um colega pede confirmação, e fechar com valor em falta pede
            como foi pago. Tudo fica registado.
          </span>
        </span>
      </label>
      {enabled && (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => post({ clear: true }, "Fim de turno: todas as mesas ficaram sem responsável.")}
              className="min-h-10 rounded-xl border border-line bg-paper px-3 text-sm font-semibold"
            >
              Fim de turno: tirar responsáveis
            </button>
            <button
              type="button"
              aria-expanded={showHistory}
              onClick={() => setShowHistory((v) => !v)}
              className="min-h-10 rounded-xl border border-line bg-paper px-3 text-sm font-semibold"
            >
              Mesas fechadas (24 h) · {closures.length}
            </button>
          </div>
          {showHistory && (
            <ul className="mt-3 grid gap-1 text-sm">
              {closures.length === 0 && <li className="text-ink-soft">Ainda nenhuma mesa fechada.</li>}
              {closures.map((c, i) => (
                <li key={`${c.at}-${i}`} className={`flex flex-wrap justify-between gap-2 rounded-xl px-3 py-2 ${c.notTheirs ? "bg-amber-50" : "bg-paper"}`}>
                  <span>
                    <strong>{c.tableLabel}</strong> · fechada por {c.closedBy}
                    {c.notTheirs && <span className="text-amber-900"> (mesa de outro empregado)</span>}
                  </span>
                  <span className="text-ink-soft">
                    {c.dueCents === null ? "" : c.dueCents > 0 ? `${formatEur(c.dueCents)} pago em ${PAID_LABEL[c.paidWith ?? "other"]} · ` : "paga na app · "}
                    {new Date(c.at).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {message && (
        <p role="status" className="mt-3 text-sm text-ink-soft">
          {message}
        </p>
      )}
    </section>
  );
}
