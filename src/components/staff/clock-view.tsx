"use client";

import { useCallback, useEffect, useState } from "react";
import { FaceEnroll } from "./face-enroll";

/** Picar ponto no painel: link do tablet, funcionários (nome e PIN) e registos com as horas. */

type Employee = { id: string; name: string; active: boolean; hasFace: boolean };
type Shift = { employeeId: string; employeeName: string; inAt: string | null; outAt: string | null; minutes: number | null; inEntryId: string | null; outEntryId: string | null };
type Data = { timezone: string; today: string; from: string; to: string; employees: Employee[]; kioskToken: string; faceEnabled: boolean; shifts: Shift[] };

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
  const working = data.shifts.filter((s) => s.inAt && !s.outAt && Date.now() - new Date(s.inAt).getTime() < 16 * 3600_000);
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
              </span>
              {data.faceEnabled && e.active && (
                <button type="button" className={ghost} disabled={busy} onClick={() => setEnrolling(e)}>
                  {e.hasFace ? "Registar a cara de novo" : "Registar a cara"}
                </button>
              )}
              {data.faceEnabled && e.hasFace && (
                <button type="button" className={ghost} disabled={busy} onClick={() => void post({ action: "faceRemove", id: e.id }, `Cara de ${e.name} apagada.`)}>
                  Apagar cara
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

      <section className="grid gap-4 rounded-3xl border border-line bg-card p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-xl">Registos e horas</h2>
          <a href={`/api/painel/ponto/exportar?de=${data.from}&ate=${data.to}`} className={ghost}>
            Exportar para o contabilista (Excel)
          </a>
        </div>

        {working.length > 0 && (
          <p className="rounded-2xl bg-brand-soft/60 px-4 py-3 text-sm">
            <strong>A trabalhar agora:</strong> {working.map((s) => `${s.employeeName} (desde as ${time(s.inAt!)})`).join(", ")}
          </p>
        )}

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
                  <th className="py-2 font-semibold">Horas</th>
                </tr>
              </thead>
              <tbody>
                {data.shifts.map((s, i) => (
                  <tr key={`${s.inEntryId ?? s.outEntryId}-${i}`} className="border-b border-line/60">
                    <td className="py-2 pr-3 font-semibold">{s.employeeName}</td>
                    <td className="py-2 pr-3">{dayOf((s.inAt ?? s.outAt)!)}</td>
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
                      ) : (
                        <span className="text-ink-soft">—</span>
                      )}
                    </td>
                    <td className="py-2 font-semibold tabular-nums">{s.minutes !== null ? hm(s.minutes) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-ink-soft">Toque na hora para ver a foto do registo.</p>
          </div>
        )}
      </section>

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
