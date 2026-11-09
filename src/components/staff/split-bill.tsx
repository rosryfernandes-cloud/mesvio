"use client";

import { useState } from "react";
import { formatEur } from "@/lib/money";
import type { TableBill } from "@/server/tables/table-sessions";

/**
 * Calculadora para dividir a conta ao balcão: em partes iguais ou por artigos escolhidos.
 * Só faz contas no ecrã: não guarda nada nem muda a conta da mesa.
 */
export function SplitBill({ bill, onClose }: { bill: TableBill; onClose: () => void }) {
  const [mode, setMode] = useState<"equal" | "items">("equal");
  const [people, setPeople] = useState(2);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  /** Artigos já pagos por pessoas anteriores (ficam riscados). */
  const [done, setDone] = useState<Set<string>>(new Set());
  const [person, setPerson] = useState(1);

  const due = bill.dueCents;
  // Partes iguais em cêntimos: os cêntimos que sobram vão para as primeiras pessoas.
  const base = Math.floor(due / people);
  const extra = due - base * people;

  const lines = bill.orders
    .filter((o) => !o.void && !o.awaitingPayment)
    .flatMap((o) => o.lines.map((l, i) => ({ key: `${o.id}:${i}`, order: o.shortCode, ...l })));
  const leftCents = lines.filter((l) => !done.has(l.key)).reduce((acc, l) => acc + l.lineTotalCents, 0);
  const pickedCents = lines.filter((l) => picked.has(l.key)).reduce((acc, l) => acc + l.lineTotalCents, 0);
  const toggle = (key: string) =>
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div role="dialog" aria-label="Dividir a conta" className="mt-3 rounded-xl border border-brand bg-brand-soft p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">
          Dividir a conta · {bill.paidCents > 0 ? `em falta ${formatEur(due)}` : formatEur(due)}
        </p>
        <button type="button" onClick={onClose} className="min-h-9 rounded-lg border border-line bg-card px-3 text-sm">
          Fechar
        </button>
      </div>
      <div className="mt-3 flex gap-2" role="tablist">
        {(
          [
            ["equal", "Partes iguais"],
            ["items", "Por artigos"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={mode === key}
            onClick={() => setMode(key)}
            className={`min-h-9 rounded-full border px-4 font-semibold ${mode === key ? "border-brand bg-brand text-white" : "border-line bg-card"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "equal" ? (
        <div className="mt-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Menos uma pessoa"
              disabled={people <= 2}
              onClick={() => setPeople((n) => Math.max(2, n - 1))}
              className="h-11 w-11 rounded-xl border border-line bg-card text-lg font-semibold disabled:opacity-40"
            >
              −
            </button>
            <span className="min-w-24 text-center text-base font-semibold">{people} pessoas</span>
            <button
              type="button"
              aria-label="Mais uma pessoa"
              disabled={people >= 30}
              onClick={() => setPeople((n) => Math.min(30, n + 1))}
              className="h-11 w-11 rounded-xl border border-line bg-card text-lg font-semibold disabled:opacity-40"
            >
              +
            </button>
          </div>
          <p className="mt-3 text-xl font-semibold tabular-nums">{formatEur(extra ? base + 1 : base)} por pessoa</p>
          {extra > 0 && (
            <p className="text-ink-soft">
              {extra} {extra === 1 ? "paga" : "pagam"} {formatEur(base + 1)} e {people - extra} {people - extra === 1 ? "paga" : "pagam"} {formatEur(base)}, para dar certo ao
              cêntimo.
            </p>
          )}
        </div>
      ) : (
        <div className="mt-3">
          <p className="text-ink-soft">
            Pessoa {person}: toque no que consumiu. Falta dividir {formatEur(leftCents)}.
          </p>
          <ul className="mt-2 grid gap-1">
            {lines.map((l) => (
              <li key={l.key}>
                <label className={`flex min-h-10 items-center gap-3 rounded-lg bg-card px-3 ${done.has(l.key) ? "text-ink-soft line-through" : "cursor-pointer"}`}>
                  <input
                    type="checkbox"
                    checked={picked.has(l.key) || done.has(l.key)}
                    disabled={done.has(l.key)}
                    onChange={() => toggle(l.key)}
                    className="h-5 w-5"
                  />
                  <span className="flex-1">
                    {l.quantity}× {l.name}
                    {l.modifierNames.length > 0 && <span className="text-ink-soft"> ({l.modifierNames.join(", ")})</span>}
                  </span>
                  <span className="tabular-nums">{formatEur(l.lineTotalCents)}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xl font-semibold tabular-nums">
              Pessoa {person}: {formatEur(pickedCents)}
            </p>
            <div className="flex gap-2">
              {picked.size > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setDone((d) => new Set([...d, ...picked]));
                    setPicked(new Set());
                    setPerson((n) => n + 1);
                  }}
                  className="min-h-9 rounded-lg bg-brand px-3 font-semibold text-white"
                >
                  Pagou · próxima pessoa
                </button>
              )}
              {done.size > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setDone(new Set());
                    setPicked(new Set());
                    setPerson(1);
                  }}
                  className="min-h-9 rounded-lg border border-line bg-card px-3"
                >
                  Recomeçar
                </button>
              )}
            </div>
          </div>
          {bill.paidCents > 0 && <p className="mt-1 text-ink-soft">Atenção: parte da conta já foi paga no telemóvel ({formatEur(bill.paidCents)}).</p>}
        </div>
      )}
    </div>
  );
}
