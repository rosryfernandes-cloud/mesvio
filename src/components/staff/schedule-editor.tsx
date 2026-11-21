"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Escala da semana: uma linha por funcionário, uma coluna por dia. Em cada dia escreve-se o horário
 * como se diz (ex.: "9-15" ou "12-15, 19-23"); vazio = folga.
 */

type Slot = { start: string; end: string };
type Row = { employeeId: string; date: string; slots: Slot[] };
type Employee = { id: string; name: string; active: boolean };

const DAY = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const addDays = (d: string, n: number) => {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day + n)).toISOString().slice(0, 10);
};
export const mondayOf = (d: string) => {
  const dow = (new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(d, -dow);
};
const fmt = (slots: Slot[]) => slots.map((s) => `${s.start}-${s.end}`).join(", ");

/** Igual ao servidor (clock-schedule.ts): "9-15, 19:30-23" → turnos; null se não perceber. */
function parseSlots(text: string): Slot[] | null {
  const parts = text.split(/[,;+]/).map((p) => p.trim()).filter(Boolean);
  const norm = (h: string) => {
    const m = /^(\d{1,2})(?:[:h.](\d{2}))?$/.exec(h.trim());
    if (!m) return null;
    const hh = Number(m[1]), mm = Number(m[2] ?? 0);
    return hh < 24 && mm < 60 ? `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}` : null;
  };
  const out: Slot[] = [];
  for (const p of parts) {
    const [a, b] = p.split(/\s*(?:-|–|às)\s*/);
    const start = a && norm(a), end = b && norm(b);
    if (!start || !end || start === end) return null;
    out.push({ start, end });
  }
  return out.length <= 3 ? out : null;
}
const minutes = (slots: Slot[]) =>
  slots.reduce((t, s) => {
    const a = Number(s.start.slice(0, 2)) * 60 + Number(s.start.slice(3));
    const b = Number(s.end.slice(0, 2)) * 60 + Number(s.end.slice(3));
    return t + (b > a ? b - a : b + 1440 - a);
  }, 0);
const hm = (m: number) => `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, "0") : ""}`;

export function ScheduleEditor({ today, employees, onSaved }: { today: string; employees: Employee[]; onSaved: (text: string) => void }) {
  const [monday, setMonday] = useState(() => mondayOf(today));
  const [cells, setCells] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = employees.filter((e) => e.active);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const key = (emp: string, date: string) => `${emp}|${date}`;

  const fetchWeek = useCallback(async (m: string): Promise<Row[] | null> => {
    const res = await fetch(`/api/painel/ponto/escala?semana=${m}`, { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return null;
    return (await res.json()).rows as Row[];
  }, []);

  const load = useCallback(
    async (m: string) => {
      setError(null);
      const rows = await fetchWeek(m);
      if (!rows) return setError("Não foi possível abrir a escala.");
      setCells(Object.fromEntries(rows.map((r) => [key(r.employeeId, r.date), fmt(r.slots)])));
    },
    [fetchWeek],
  );
  useEffect(() => {
    void load(monday);
  }, [monday, load]);

  async function copyPrevious() {
    const rows = await fetchWeek(addDays(monday, -7));
    if (!rows) return setError("Não foi possível abrir a semana anterior.");
    setCells(Object.fromEntries(rows.map((r) => [key(r.employeeId, addDays(r.date, 7)), fmt(r.slots)])));
    onSaved("Copiámos a semana anterior. Ajuste o que for preciso e carregue em Guardar.");
  }

  async function save() {
    const rows: Row[] = [];
    for (const e of active)
      for (const d of days) {
        const text = (cells[key(e.id, d)] ?? "").trim();
        if (!text) continue;
        const slots = parseSlots(text);
        if (!slots) return setError(`Não percebi "${text}" (${e.name}, ${DAY[days.indexOf(d)]}). Escreva por exemplo 9-15 ou 12-15, 19-23.`);
        rows.push({ employeeId: e.id, date: d, slots });
      }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/painel/ponto/escala", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ monday, rows }) }).catch(() => null);
    setBusy(false);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) return setError(data.message ?? "Não foi possível guardar a escala.");
    onSaved("Escala guardada.");
    await load(monday);
  }

  const label = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("pt-PT", { day: "numeric", month: "short", timeZone: "UTC" });

  return (
    <section className="grid gap-3 rounded-3xl border border-line bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl">Escala da semana</h2>
        <div className="flex items-center gap-2">
          <button type="button" className="min-h-10 rounded-xl border border-line px-3" onClick={() => setMonday(addDays(monday, -7))} aria-label="Semana anterior">
            ←
          </button>
          <span className="text-sm font-semibold tabular-nums">
            {label(monday)} – {label(addDays(monday, 6))}
          </span>
          <button type="button" className="min-h-10 rounded-xl border border-line px-3" onClick={() => setMonday(addDays(monday, 7))} aria-label="Semana seguinte">
            →
          </button>
        </div>
      </div>
      <p className="text-sm text-ink-soft">Escreva o horário de cada dia como diria: &ldquo;9-15&rdquo; ou &ldquo;12-15, 19-23&rdquo;. Vazio é folga. Com a escala, o painel mostra quem chegou atrasado ou não veio.</p>
      {active.length === 0 ? (
        <p className="text-sm text-ink-soft">Acrescente primeiro os funcionários.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-soft">
                <th className="py-1 pr-2 font-semibold">Funcionário</th>
                {days.map((d, i) => (
                  <th key={d} className={`py-1 pr-1 font-semibold ${d === today ? "text-brand" : ""}`}>
                    {DAY[i]} {label(d).split(" ")[0]}
                  </th>
                ))}
                <th className="py-1 font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {active.map((e) => {
                const total = days.reduce((t, d) => t + minutes(parseSlots(cells[key(e.id, d)] ?? "") ?? []), 0);
                return (
                  <tr key={e.id}>
                    <td className="py-1 pr-2 font-semibold whitespace-nowrap">{e.name}</td>
                    {days.map((d) => {
                      const v = cells[key(e.id, d)] ?? "";
                      const bad = v.trim() !== "" && parseSlots(v) === null;
                      return (
                        <td key={d} className="py-1 pr-1">
                          <input
                            value={v}
                            onChange={(ev) => setCells((c) => ({ ...c, [key(e.id, d)]: ev.target.value }))}
                            placeholder="folga"
                            aria-label={`${e.name}, ${d}`}
                            className={`min-h-10 w-full min-w-24 rounded-lg border px-2 text-xs ${bad ? "border-red-400 bg-red-50" : "border-line bg-card"}`}
                          />
                        </td>
                      );
                    })}
                    <td className={`py-1 font-semibold tabular-nums ${total > 48 * 60 ? "text-danger" : ""}`}>{total ? hm(total) : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || active.length === 0} onClick={() => void save()} className="min-h-11 rounded-xl bg-brand px-5 font-semibold text-white disabled:opacity-60">
          {busy ? "A guardar…" : "Guardar escala"}
        </button>
        <button type="button" disabled={busy} onClick={() => void copyPrevious()} className="min-h-10 rounded-xl border border-line bg-card px-3 text-sm font-semibold">
          Copiar da semana anterior
        </button>
      </div>
    </section>
  );
}
