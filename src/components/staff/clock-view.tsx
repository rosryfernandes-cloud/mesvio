"use client";

import { useCallback, useEffect, useState } from "react";
import { FaceEnroll } from "./face-enroll";
import { ScheduleEditor } from "./schedule-editor";

/** Picar ponto no painel: link do tablet, funcionários (nome e PIN) e registos com as horas. */

type Employee = { id: string; name: string; active: boolean; hasFace: boolean; hourlyCents: number | null };
type Kind = "in" | "out" | "pause" | "resume";
type Entry = { id: string; employeeId: string; employeeName: string; kind: Kind; at: string; hasPhoto: boolean; source: "tablet" | "manual"; originalAt: string | null };
type Shift = {
  employeeId: string;
  employeeName: string;
  inAt: string | null;
  outAt: string | null;
  minutes: number | null;
  pauseMinutes: number;
  status: "closed" | "open" | "forgot" | "noIn";
  corrected: boolean;
  entries: Entry[];
  inEntryId: string | null;
  outEntryId: string | null;
};
type Correction = { at: string; action: "add" | "edit" | "delete"; text: string };
type Data = { timezone: string; today: string; from: string; to: string; employees: Employee[]; kioskToken: string; faceEnabled: boolean; faceAllowed?: boolean; shifts: Shift[]; corrections: Correction[]; alerts: { level: "warn" | "info"; employeeName: string; text: string }[];
  notify: boolean;
  cost: {
    totalCents: number;
    withTsuCents: number;
    byDay: { date: string; cents: number; minutes: number; people: number }[];
    byEmployee: { employeeId: string; name: string; minutes: number; cents: number; hourlyCents: number | null }[];
    missingRate: string[];
  };
  attendance: { employeeId: string; employeeName: string; date: string; start: string; end: string; status: "upcoming" | "ontime" | "late" | "absent" | "waiting"; lateMinutes: number; inAt: string | null }[];
};

const KIND_LABEL: Record<Kind, string> = { in: "Entrada", out: "Saída", pause: "Pausa", resume: "Regresso da pausa" };
const eur = (c: number) => (c / 100).toLocaleString("pt-PT", { style: "currency", currency: "EUR" });

/** Diferença (ms) entre a hora local no fuso e UTC, num dado instante. */
function offsetMs(instant: number, tz: string): number {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(instant));
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value);
  return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - instant;
}
/** ISO → valor de <input type="datetime-local"> na hora do restaurante, e o contrário. */
const toLocalInput = (iso: string, tz: string) => new Date(new Date(iso).getTime() + offsetMs(new Date(iso).getTime(), tz)).toISOString().slice(0, 16);
function fromLocalInput(value: string, tz: string): string {
  const guess = new Date(`${value}:00Z`).getTime();
  return new Date(guess - offsetMs(guess - offsetMs(guess, tz), tz)).toISOString();
}

const input = "min-h-11 rounded-xl border border-line bg-card px-3";
const primary = "min-h-11 rounded-xl bg-brand px-5 font-semibold text-white disabled:opacity-60";
const ghost = "min-h-10 rounded-xl border border-line bg-card px-3 text-sm font-semibold disabled:opacity-60";

const hm = (min: number) => `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`;
const addDays = (d: string, n: number) => {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day + n)).toISOString().slice(0, 10);
};

export function ClockView() {
  const [data, setData] = useState<Data | null>(null);
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPin, setNewPin] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [enrolling, setEnrolling] = useState<Employee | null>(null);
  const [editing, setEditing] = useState<Shift | null>(null);
  const [adding, setAdding] = useState<{ employeeId: string; kind: Kind; at: string } | null>(null);

  const load = useCallback(async (r?: { from: string; to: string }) => {
    const q = r ? `?de=${r.from}&ate=${r.to}` : "";
    const res = await fetch(`/api/painel/ponto${q}`, { cache: "no-store" }).catch(() => null);
    const d = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) return setMessage({ text: d.message ?? "Não foi possível abrir o picar ponto.", error: true });
    setData(d);
    setRange({ from: d.from, to: d.to });
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function post(body: object, okText: string) {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/painel/ponto", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    setBusy(false);
    const d = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) {
      setMessage({ text: d.message ?? "Não foi possível guardar.", error: true });
      return false;
    }
    setMessage({ text: okText, error: false });
    await load(range ?? undefined);
    return true;
  }

  if (!data) return <p className="text-ink-soft">{message?.text ?? "A carregar o picar ponto…"}</p>;

  const link = `${window.location.origin}/ponto/${data.kioskToken}`;
  const working = data.shifts.filter((s) => s.status === "open");
  const forgotten = data.shifts.filter((s) => s.status === "forgot" || s.status === "noIn");
  const totals = new Map<string, { name: string; minutes: number; shifts: number }>();
  for (const s of data.shifts) {
    if (s.minutes === null) continue;
    const t = totals.get(s.employeeId) ?? { name: s.employeeName, minutes: 0, shifts: 0 };
    t.minutes += s.minutes;
    t.shifts += 1;
    totals.set(s.employeeId, t);
  }
  const time = (iso: string) => new Date(iso).toLocaleTimeString("pt-PT", { timeZone: data.timezone, hour: "2-digit", minute: "2-digit" });
  const dayOf = (iso: string) => new Date(iso).toLocaleDateString("pt-PT", { timeZone: data.timezone, weekday: "short", day: "numeric", month: "short" });
  const preset = (from: string, to: string) => {
    setRange({ from, to });
    void load({ from, to });
  };
  const monthStart = `${data.today.slice(0, 8)}01`;

  return (
    <div className="grid gap-5">
      {message && (
        <p role={message.error ? "alert" : "status"} className={`rounded-xl px-4 py-3 text-sm ${message.error ? "bg-red-50 text-red-800" : "bg-[#ecfdf3] text-ok"}`}>
          {message.text}
        </p>
      )}

      <section className="grid gap-3 rounded-3xl border border-line bg-card p-5">
        <h2 className="text-xl">Tablet de picar ponto</h2>
        <p className="text-sm text-ink-soft">
          Abra este link num tablet à entrada (guarde-o no ecrã principal). Cada funcionário toca no nome, mete o PIN e o tablet tira uma selfie como prova.
          Quem tiver o link consegue picar o ponto: não o partilhe fora do restaurante.
        </p>
        <code className="block rounded-xl bg-paper px-3 py-2 text-sm break-all">{link}</code>
        <div className="flex flex-wrap gap-2">
          <a href={link} target="_blank" rel="noreferrer" className={`${primary} inline-flex items-center`}>
            Abrir o tablet
          </a>
          <button
            type="button"
            className={ghost}
            onClick={() => {
              void navigator.clipboard.writeText(link).then(
                () => setMessage({ text: "Link copiado.", error: false }),
                () => window.prompt("Copie o link:", link),
              );
            }}
          >
            Copiar link
          </button>
          <button
            type="button"
            className={ghost}
            disabled={busy}
            onClick={() => {
              if (window.confirm("Gerar um link novo? O link antigo deixa de funcionar e tem de abrir o novo no tablet.")) void post({ action: "newLink" }, "Link novo criado. Abra-o no tablet.");
            }}
          >
            Gerar link novo
          </button>
        </div>
      </section>

      {/* Só a equipa MESVIO vê esta secção até haver a revisão jurídica; se já estiver ligado, o dono vê-a para poder desligar. */}
      {(data.faceAllowed || data.faceEnabled) && (
      <section className="grid gap-3 rounded-3xl border border-line bg-card p-5">
        <h2 className="text-xl">Reconhecimento facial</h2>
        <p className="text-sm text-ink-soft">
          Com o reconhecimento ligado, o funcionário só mostra a cara ao tablet e vira-a um pouco para o lado, e o registo fica feito. O nome e o PIN continuam a funcionar
          para quem não quiser ou não for reconhecido.
        </p>
        {!data.faceEnabled && (
          <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-ink">
            <strong>Antes de ligar:</strong> a cara usada para reconhecer alguém é um dado biométrico. Informe os funcionários por escrito de como funciona
            e de que podem usar sempre o PIN. Guardamos só uma assinatura numérica da cara, cifrada, e nunca a foto.
          </p>
        )}
        <div>
          <button
            type="button"
            disabled={busy}
            className={data.faceEnabled ? ghost : primary}
            onClick={() => {
              if (data.faceEnabled) {
                if (window.confirm("Desligar o reconhecimento facial? As caras registadas de todos os funcionários são apagadas.")) void post({ action: "faceEnabled", enabled: false }, "Reconhecimento facial desligado e caras apagadas.");
              } else if (window.confirm("Confirma que informou os funcionários por escrito e que eles podem usar sempre o PIN em alternativa?")) {
                void post({ action: "faceEnabled", enabled: true }, "Reconhecimento facial ligado. Registe a cara de cada funcionário na lista abaixo.");
              }
            }}
          >
            {data.faceEnabled ? "Desligar o reconhecimento facial" : "Ligar o reconhecimento facial"}
          </button>
        </div>
      </section>
      )}

      <section className="grid gap-3 rounded-3xl border border-line bg-card p-5">
        <h2 className="text-xl">Funcionários</h2>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void post({ action: "add", name: newName, pin: newPin }, `${newName.trim()} acrescentado. O PIN é ${newPin}: diga-lho.`).then((ok) => {
              if (ok) {
                setNewName("");
                setNewPin("");
              }
            });
          }}
        >
          <label className="grid flex-1 gap-1 text-sm font-semibold">
            Nome
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ex.: Maria" className={`${input} min-w-40 font-normal`} required maxLength={60} />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            PIN (4 algarismos)
            <input
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              inputMode="numeric"
              placeholder="1234"
              className={`${input} w-28 font-normal tabular-nums`}
              required
              pattern="\d{4}"
            />
          </label>
          <button type="submit" disabled={busy} className={primary}>
            Acrescentar
          </button>
        </form>
        {data.employees.length === 0 && <p className="text-sm text-ink-soft">Ainda não há funcionários.</p>}
        <ul className="grid gap-2">
          {data.employees.map((e) => (
            <li key={e.id} className={`flex flex-wrap items-center gap-2 rounded-2xl border border-line px-3 py-2 ${e.active ? "" : "opacity-60"}`}>
              <span className="flex-1 font-semibold">
                {e.name}
                {!e.active && <span className="ml-2 text-xs font-normal text-ink-soft">(desativado)</span>}
                {data.faceEnabled && e.hasFace && <span className="ml-2 text-xs font-normal text-ok">· cara registada</span>}
                {e.hourlyCents !== null && <span className="ml-2 text-xs font-normal text-ink-soft">· {eur(e.hourlyCents)}/h</span>}
              </span>
              <button
                type="button"
                className={ghost}
                disabled={busy}
                onClick={() => {
                  const v = window.prompt(`Valor bruto por hora de ${e.name} (ex.: 5,80). Deixe vazio para tirar.`, e.hourlyCents !== null ? (e.hourlyCents / 100).toFixed(2).replace(".", ",") : "");
                  if (v === null) return;
                  const t = v.trim().replace("€", "").replace(",", ".");
                  const cents = t === "" ? null : Math.round(Number(t) * 100);
                  if (cents !== null && (!Number.isFinite(cents) || cents < 0 || cents > 100_000)) return setMessage({ text: "Valor inválido. Use por exemplo 5,80.", error: true });
                  void post({ action: "update", id: e.id, hourlyCents: cents }, cents === null ? `Valor/hora de ${e.name} tirado.` : `Valor/hora de ${e.name}: ${eur(cents)}.`);
                }}
              >
                Valor/hora
              </button>
              {data.faceEnabled && e.active && (
                <button type="button" className={ghost} disabled={busy} onClick={() => setEnrolling(e)}>
                  {e.hasFace ? "Registar a cara de novo" : "Registar a cara"}
                </button>
              )}
              {data.faceEnabled && e.hasFace && (
                <button
                  type="button"
                  className={`${ghost} border-red-300 text-red-700`}
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(`Eliminar a cara de ${e.name}? Deixa de poder picar com a cara até a registar outra vez (o PIN continua a funcionar).`))
                      void post({ action: "faceRemove", id: e.id }, `Cara de ${e.name} eliminada.`);
                  }}
                >
                  Eliminar cara
                </button>
              )}
              <button
                type="button"
                className={ghost}
                disabled={busy}
                onClick={() => {
                  const pin = window.prompt(`Novo PIN de ${e.name} (4 algarismos):`);
                  if (pin === null) return;
                  if (!/^\d{4}$/.test(pin)) return setMessage({ text: "O PIN tem 4 algarismos.", error: true });
                  void post({ action: "update", id: e.id, pin }, `PIN de ${e.name} mudado.`);
                }}
              >
                Mudar PIN
              </button>
              <button type="button" className={ghost} disabled={busy} onClick={() => void post({ action: "update", id: e.id, active: !e.active }, e.active ? `${e.name} desativado: já não aparece no tablet.` : `${e.name} ativado.`)}>
                {e.active ? "Desativar" : "Ativar"}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <ScheduleEditor today={data.today} employees={data.employees} onSaved={(text) => {
        setMessage({ text, error: false });
        void load(range ?? undefined);
      }} />

      <section className="grid gap-3 rounded-3xl border border-line bg-card p-5">
        <h2 className="text-xl">Avisos no telemóvel</h2>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={data.notify}
            disabled={busy}
            onChange={(e) => void post({ action: "notify", on: e.target.checked }, e.target.checked ? "Avisos ligados." : "Avisos desligados.")}
            className="mt-1 size-5 accent-[var(--color-brand)]"
          />
          <span>
            <span className="font-semibold">Avisar quando alguém da escala não picar</span>
            <span className="block text-sm text-ink-soft">
              Se alguém não picar a entrada 15 minutos depois da hora da escala, ou continuar sem picar a saída 45 minutos depois do fim, o dono e os gerentes
              recebem um aviso no telemóvel. Para receber, ligue as notificações neste aparelho (no topo do painel).
            </span>
          </span>
        </label>
      </section>

      <section className="grid gap-4 rounded-3xl border border-line bg-card p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-xl">Registos e horas</h2>
          <a href={`/api/painel/ponto/exportar?de=${data.from}&ate=${data.to}`} className={ghost}>
            Exportar para o contabilista (Excel)
          </a>
        </div>

        {working.length > 0 && (
          <p className="rounded-2xl bg-brand-soft/60 px-4 py-3 text-sm">
            <strong>A trabalhar agora:</strong>{" "}
            {working.map((s) => `${s.employeeName} (desde as ${time(s.inAt!)}${s.entries[s.entries.length - 1].kind === "pause" ? ", em pausa" : ""})`).join(", ")}
          </p>
        )}
        {forgotten.length > 0 && (
          <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800">
            <strong>{forgotten.length === 1 ? "1 turno incompleto" : `${forgotten.length} turnos incompletos`}</strong> (saída esquecida ou entrada em falta). Toque em
            &ldquo;Corrigir&rdquo; na linha para acrescentar a hora que falta.
          </p>
        )}
        {data.attendance.some((a) => a.status !== "upcoming") && (
          <div className="grid gap-1.5 rounded-2xl border border-line bg-paper px-4 py-3 text-sm">
            <p className="font-semibold">Escala e entradas</p>
            <ul className="grid gap-1">
              {data.attendance
                .filter((a) => a.status !== "upcoming")
                .slice(-40)
                .reverse()
                .map((a, i) => (
                  <li key={i} className="flex flex-wrap gap-x-2">
                    <span className="w-28 shrink-0 text-ink-soft">
                      {new Date(`${a.date}T12:00:00Z`).toLocaleDateString("pt-PT", { weekday: "short", day: "numeric", timeZone: "UTC" })} · {a.start}
                    </span>
                    <span className="font-semibold">{a.employeeName}</span>
                    {a.status === "ontime" && <span className="text-ok">a horas ({time(a.inAt!)})</span>}
                    {a.status === "late" && <span className="text-amber-700">chegou {a.lateMinutes} min atrasado ({time(a.inAt!)})</span>}
                    {a.status === "absent" && <span className="font-semibold text-danger">não picou a entrada</span>}
                    {a.status === "waiting" && <span className="text-ink-soft">ainda não picou</span>}
                  </li>
                ))}
            </ul>
          </div>
        )}
        {data.alerts.length > 0 && (
          <div className="grid gap-1.5 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm">
            <p className="font-semibold">Atenção aos limites da lei</p>
            <ul className="grid gap-1">
              {data.alerts.map((a, i) => (
                <li key={i} className={a.level === "warn" ? "text-red-800" : "text-ink"}>
                  {a.level === "warn" ? "⚠️ " : "ℹ️ "}
                  {a.text}
                </li>
              ))}
            </ul>
            <p className="text-xs text-ink-soft">
              Avisos para ajudar a cumprir o Código do Trabalho (máximo de 10 horas por dia, 11 horas de descanso entre turnos, 40 horas por semana mais horas
              extra até 48). Confirme os casos concretos com o contabilista.
            </p>
          </div>
        )}
        <div>
          <button
            type="button"
            className={ghost}
            onClick={() => setAdding({ employeeId: data.employees.find((e) => e.active)?.id ?? "", kind: "in", at: toLocalInput(new Date().toISOString(), data.timezone) })}
            disabled={data.employees.length === 0}
          >
            + Acrescentar registo esquecido
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <button type="button" className={ghost} onClick={() => preset(data.today, data.today)}>
            Hoje
          </button>
          <button type="button" className={ghost} onClick={() => preset(addDays(data.today, -6), data.today)}>
            7 dias
          </button>
          <button type="button" className={ghost} onClick={() => preset(monthStart, data.today)}>
            Este mês
          </button>
          <label className="grid gap-1 text-xs font-semibold">
            De
            <input type="date" value={range?.from ?? ""} onChange={(e) => setRange((r) => ({ from: e.target.value, to: r?.to ?? e.target.value }))} className={`${input} font-normal`} />
          </label>
          <label className="grid gap-1 text-xs font-semibold">
            Até
            <input type="date" value={range?.to ?? ""} onChange={(e) => setRange((r) => ({ from: r?.from ?? e.target.value, to: e.target.value }))} className={`${input} font-normal`} />
          </label>
          <button type="button" className={ghost} onClick={() => range && void load(range)}>
            Ver
          </button>
        </div>

        {data.cost.byEmployee.length > 0 && (
          <div className="grid gap-2 rounded-2xl border border-line bg-paper px-4 py-3 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-semibold">Custo de pessoal no período</p>
              <p>
                <strong className="text-lg tabular-nums">{eur(data.cost.totalCents)}</strong>
                <span className="ml-2 text-ink-soft">· com a TSU da empresa (23,75%): {eur(data.cost.withTsuCents)}</span>
              </p>
            </div>
            {data.cost.missingRate.length > 0 && (
              <p className="text-amber-700">Sem valor/hora: {data.cost.missingRate.join(", ")}. Carregue em &ldquo;Valor/hora&rdquo; na lista de funcionários.</p>
            )}
            <ul className="flex flex-wrap gap-2">
              {data.cost.byEmployee.map((e) => (
                <li key={e.employeeId} className="rounded-full bg-card px-3 py-1">
                  {e.name}: <strong className="tabular-nums">{e.hourlyCents === null ? "—" : eur(e.cents)}</strong>
                </li>
              ))}
            </ul>
            {data.cost.byDay.length > 1 && (
              <ul className="grid gap-0.5">
                {data.cost.byDay.map((d) => (
                  <li key={d.date} className="flex gap-3 tabular-nums">
                    <span className="w-28 text-ink-soft">{new Date(`${d.date}T12:00:00Z`).toLocaleDateString("pt-PT", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}</span>
                    <span className="w-24">{eur(d.cents)}</span>
                    <span className="text-ink-soft">
                      {d.people} {d.people === 1 ? "pessoa" : "pessoas"} · {hm(d.minutes)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-ink-soft">Valor bruto das horas trabalhadas (sem pausas). Não inclui subsídios, seguros nem outros encargos.</p>
          </div>
        )}
        {totals.size > 0 && (
          <div className="grid gap-1">
            <p className="text-sm font-semibold">Total no período</p>
            <ul className="flex flex-wrap gap-2">
              {[...totals.values()].map((t) => (
                <li key={t.name} className="rounded-full bg-paper px-3 py-1 text-sm">
                  {t.name}: <strong className="tabular-nums">{hm(t.minutes)}</strong> <span className="text-ink-soft">({t.shifts} {t.shifts === 1 ? "turno" : "turnos"})</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {data.shifts.length === 0 ? (
          <p className="text-sm text-ink-soft">Sem registos neste período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-soft">
                  <th className="py-2 pr-3 font-semibold">Funcionário</th>
                  <th className="py-2 pr-3 font-semibold">Dia</th>
                  <th className="py-2 pr-3 font-semibold">Entrada</th>
                  <th className="py-2 pr-3 font-semibold">Saída</th>
                  <th className="py-2 pr-3 font-semibold">Pausas</th>
                  <th className="py-2 pr-3 font-semibold">Horas</th>
                  <th className="py-2 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {data.shifts.map((s, i) => (
                  <tr key={`${s.inEntryId ?? s.outEntryId}-${i}`} className="border-b border-line/60">
                    <td className="py-2 pr-3 font-semibold">{s.employeeName}</td>
                    <td className="py-2 pr-3">{dayOf(s.inAt ?? s.outAt ?? s.entries[0].at)}</td>
                    <td className="py-2 pr-3 tabular-nums">
                      {s.inAt ? (
                        <button type="button" className="underline decoration-dotted" onClick={() => s.inEntryId && setPhoto(s.inEntryId)} title="Ver a foto">
                          {time(s.inAt)}
                        </button>
                      ) : (
                        <span className="text-danger">sem entrada</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 tabular-nums">
                      {s.outAt ? (
                        <button type="button" className="underline decoration-dotted" onClick={() => s.outEntryId && setPhoto(s.outEntryId)} title="Ver a foto">
                          {time(s.outAt)}
                        </button>
                      ) : s.status === "open" ? (
                        <span className="text-ok">a trabalhar</span>
                      ) : (
                        <span className="font-semibold text-danger">esquecida</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 tabular-nums">{s.pauseMinutes ? hm(s.pauseMinutes) : ""}</td>
                    <td className="py-2 pr-3 font-semibold tabular-nums">
                      {s.minutes !== null ? hm(s.minutes) : ""}
                      {s.corrected && <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800" title="Hora acrescentada ou corrigida pelo responsável">corrigido</span>}
                    </td>
                    <td className="py-2 text-right">
                      <button type="button" className="text-xs font-semibold text-brand underline" onClick={() => setEditing(s)}>
                        Corrigir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-ink-soft">Toque na hora para ver a foto do registo. As correções ficam guardadas no histórico.</p>
          </div>
        )}
      </section>

      <details className="rounded-3xl border border-line bg-card p-5">
        <summary className="cursor-pointer text-lg font-semibold">Histórico de correções</summary>
        <p className="mt-2 text-sm text-ink-soft">Cada hora acrescentada, mudada ou apagada fica aqui, com a data. A lei pede que o registo de tempos não seja alterado sem deixar rasto.</p>
        {data.corrections.length === 0 ? (
          <p className="mt-3 text-sm text-ink-soft">Ainda não houve correções.</p>
        ) : (
          <ul className="mt-3 grid gap-1 text-sm">
            {data.corrections.map((c, i) => (
              <li key={i} className="flex gap-3 border-b border-line/60 py-1.5">
                <span className="w-32 shrink-0 text-ink-soft tabular-nums">{new Date(c.at).toLocaleString("pt-PT", { timeZone: data.timezone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                <span>{c.text}</span>
              </li>
            ))}
          </ul>
        )}
      </details>

      {editing && (
        <div role="dialog" aria-label="Corrigir turno" className="fixed inset-0 z-50 grid place-items-center bg-ink/60 p-4" onClick={() => setEditing(null)}>
          <div className="grid max-h-[90dvh] w-full max-w-md gap-3 overflow-y-auto rounded-3xl bg-card p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold">Corrigir · {editing.employeeName}</h3>
            <p className="text-sm text-ink-soft">Mude a hora e carregue em Guardar, ou apague um registo feito por engano. Fica tudo no histórico.</p>
            {editing.entries.map((en) => (
              <EntryRow
                key={en.id}
                entry={en}
                tz={data.timezone}
                busy={busy}
                onSave={async (at) => {
                  if (await post({ action: "editEntry", id: en.id, at }, `${KIND_LABEL[en.kind]} de ${editing.employeeName} corrigida.`)) setEditing(null);
                }}
                onDelete={async () => {
                  if (!window.confirm(`Apagar a ${KIND_LABEL[en.kind].toLowerCase()} das ${time(en.at)}? Deixa de contar nas horas (fica no histórico).`)) return;
                  if (await post({ action: "deleteEntry", id: en.id }, `${KIND_LABEL[en.kind]} apagada.`)) setEditing(null);
                }}
              />
            ))}
            {(editing.status === "forgot" || editing.status === "open" || editing.status === "noIn") && (
              <button
                type="button"
                className={primary}
                onClick={() => {
                  const ref = editing.entries[editing.entries.length - 1].at;
                  setAdding({ employeeId: editing.employeeId, kind: editing.status === "noIn" ? "in" : "out", at: toLocalInput(ref, data.timezone) });
                  setEditing(null);
                }}
              >
                {editing.status === "noIn" ? "Acrescentar a entrada que falta" : "Acrescentar a saída"}
              </button>
            )}
            <button type="button" className={ghost} onClick={() => setEditing(null)}>
              Fechar
            </button>
          </div>
        </div>
      )}

      {adding && (
        <div role="dialog" aria-label="Acrescentar registo" className="fixed inset-0 z-50 grid place-items-center bg-ink/60 p-4" onClick={() => setAdding(null)}>
          <form
            className="grid w-full max-w-md gap-3 rounded-3xl bg-card p-5"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              const name = data.employees.find((x) => x.id === adding.employeeId)?.name ?? "";
              void post({ action: "addEntry", employeeId: adding.employeeId, kind: adding.kind, at: fromLocalInput(adding.at, data.timezone) }, `${KIND_LABEL[adding.kind]} de ${name} acrescentada.`).then((ok) => ok && setAdding(null));
            }}
          >
            <h3 className="text-lg font-bold">Acrescentar registo esquecido</h3>
            <label className="grid gap-1 text-sm font-semibold">
              Funcionário
              <select value={adding.employeeId} onChange={(e) => setAdding({ ...adding, employeeId: e.target.value })} className={`${input} font-normal`} required>
                {data.employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Registo
              <select value={adding.kind} onChange={(e) => setAdding({ ...adding, kind: e.target.value as Kind })} className={`${input} font-normal`}>
                {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Dia e hora
              <input type="datetime-local" value={adding.at} onChange={(e) => setAdding({ ...adding, at: e.target.value })} className={`${input} font-normal`} required />
            </label>
            <p className="text-xs text-ink-soft">Fica marcado como acrescentado pelo responsável e entra no histórico.</p>
            <div className="flex gap-2">
              <button type="button" className={`${ghost} flex-1`} onClick={() => setAdding(null)}>
                Cancelar
              </button>
              <button type="submit" className={`${primary} flex-[2]`} disabled={busy || !adding.employeeId}>
                Acrescentar
              </button>
            </div>
          </form>
        </div>
      )}

      {enrolling && (
        <FaceEnroll
          name={enrolling.name}
          onClose={() => setEnrolling(null)}
          onSave={(samples) => post({ action: "face", id: enrolling.id, samples }, `Cara de ${enrolling.name} registada. Já pode picar o ponto só com a cara.`)}
        />
      )}

      {photo && (
        <div role="dialog" aria-label="Foto do registo" className="fixed inset-0 z-50 grid place-items-center bg-ink/60 p-4" onClick={() => setPhoto(null)}>
          <div className="rounded-3xl bg-card p-3" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/painel/ponto/foto/${photo}`} alt="Foto tirada no tablet ao picar o ponto" className="max-h-[70dvh] rounded-2xl" onError={(e) => ((e.currentTarget.alt = "Registo sem foto"), (e.currentTarget.style.display = "none"))} />
            <button type="button" onClick={() => setPhoto(null)} className={`${primary} mt-3 w-full`}>
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Uma linha do turno a corrigir: tipo, hora (editável), guardar e apagar. */
function EntryRow({ entry, tz, busy, onSave, onDelete }: { entry: Entry; tz: string; busy: boolean; onSave: (at: string) => void; onDelete: () => void }) {
  const [value, setValue] = useState(() => toLocalInput(entry.at, tz));
  const changed = value !== toLocalInput(entry.at, tz);
  return (
    <div className="grid gap-1 rounded-2xl border border-line p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">
          {KIND_LABEL[entry.kind]}
          {entry.source === "manual" && <span className="ml-2 text-xs font-normal text-ink-soft">(acrescentado)</span>}
        </span>
        {entry.originalAt && <span className="text-xs text-ink-soft">original: {new Date(entry.originalAt).toLocaleTimeString("pt-PT", { timeZone: tz, hour: "2-digit", minute: "2-digit" })}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} className="min-h-11 flex-1 rounded-xl border border-line bg-card px-3" aria-label={`Hora da ${KIND_LABEL[entry.kind].toLowerCase()}`} />
        <button type="button" disabled={busy || !changed} onClick={() => onSave(fromLocalInput(value, tz))} className="min-h-11 rounded-xl bg-brand px-4 text-sm font-semibold text-white disabled:opacity-50">
          Guardar
        </button>
        <button type="button" disabled={busy} onClick={onDelete} className="min-h-11 rounded-xl border border-red-300 px-3 text-sm font-semibold text-red-700">
          Apagar
        </button>
      </div>
    </div>
  );
}
