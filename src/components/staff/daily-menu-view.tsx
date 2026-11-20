"use client";

import { useEffect, useState } from "react";
import { preparePhoto } from "./menu-import";

/**
 * Menu do dia no painel: o dono muda-o todos os dias em 1 minuto (fotografar a folha, repetir o
 * anterior ou escrever à mão) e define uma vez o que o menu inclui, a hora do almoço e os dias.
 */

type Item = { name: string; half: string; full: string };
type Section = { title: string; items: Item[] };
type Settings = { enabled: boolean; includes: string; extras: string; note: string; from: string; to: string; days: number[] };
type ApiSection = { title: string; items: { name: string; halfPriceCents: number | null; priceCents: number | null }[] };

const DEFAULTS: Settings = {
  enabled: true,
  includes: "Sopa, prato do dia, pão, azeitonas, água da casa e café",
  extras: "Com sobremesa caseira + 2,50 €",
  note: "Outras bebidas não incluídas no menu",
  from: "12:00",
  to: "15:30",
  days: [1, 2, 3, 4, 5],
};
const EMPTY: Section[] = [
  { title: "Sopa do dia", items: [{ name: "", half: "", full: "" }] },
  { title: "Pratos do dia", items: [{ name: "", half: "", full: "" }] },
];
const DAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

const input = "min-h-11 rounded-xl border border-line bg-card px-3";
const primary = "min-h-11 rounded-xl bg-brand px-5 font-semibold text-white disabled:opacity-60";
const secondary = "min-h-11 rounded-xl border border-brand px-4 font-semibold text-brand disabled:opacity-60";
const ghost = "min-h-10 rounded-xl border border-line bg-card px-3 text-sm disabled:opacity-60";

const euros = (c: number | null) => (c === null ? "" : (c / 100).toFixed(2).replace(".", ","));
const cents = (v: string): number | null | "erro" => {
  const s = v.trim().replace("€", "").replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n <= 1000 ? Math.round(n * 100) : "erro";
};
const fromApi = (s: ApiSection[]): Section[] =>
  s.map((x) => ({ title: x.title, items: x.items.map((i) => ({ name: i.name, half: euros(i.halfPriceCents), full: euros(i.priceCents) })) }));
const dateLabel = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" });

export function DailyMenuView() {
  const [loaded, setLoaded] = useState(false);
  const [today, setToday] = useState("");
  const [sections, setSections] = useState<Section[]>(EMPTY);
  const [hasToday, setHasToday] = useState(false);
  const [previous, setPrevious] = useState<{ date: string; sections: ApiSection[] } | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [configured, setConfigured] = useState(false);
  const [busy, setBusy] = useState<"reading" | "saving" | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  async function load() {
    const res = await fetch("/api/painel/menu-do-dia", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return setMessage({ text: "Não foi possível abrir o menu do dia. Tente de novo.", error: true });
    const d = await res.json();
    setToday(d.today);
    setHasToday(Boolean(d.sections?.length));
    setSections(d.sections?.length ? fromApi(d.sections) : EMPTY);
    setPrevious(d.previous);
    setSettings(d.settings ?? DEFAULTS);
    setConfigured(Boolean(d.settings));
    setLoaded(true);
  }
  useEffect(() => {
    void load();
  }, []);

  function toApi(): ApiSection[] | null {
    const out: ApiSection[] = [];
    for (const s of sections) {
      const items: ApiSection["items"] = [];
      for (const i of s.items) {
        if (!i.name.trim()) continue;
        const half = cents(i.half), full = cents(i.full);
        if (half === "erro" || full === "erro") {
          setMessage({ text: `Preço inválido em "${i.name}". Use por exemplo 12,50.`, error: true });
          return null;
        }
        items.push({ name: i.name.trim(), halfPriceCents: half, priceCents: full });
      }
      if (items.length) out.push({ title: s.title.trim(), items });
    }
    return out;
  }

  async function save(withSettings = false) {
    const api = toApi();
    if (!api) return;
    setBusy("saving");
    setMessage(null);
    const res = await fetch("/api/painel/menu-do-dia", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sections: api, ...(withSettings || !configured ? { settings } : {}) }),
    }).catch(() => null);
    setBusy(null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) return setMessage({ text: data.message ?? "Não foi possível guardar.", error: true });
    setConfigured(true);
    setHasToday(api.length > 0);
    setMessage({ text: api.length ? "Menu do dia guardado. Os clientes já o veem na ementa." : "Menu de hoje apagado.", error: false });
  }

  async function saveSettings() {
    setBusy("saving");
    setMessage(null);
    const res = await fetch("/api/painel/menu-do-dia", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings }),
    }).catch(() => null);
    setBusy(null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) return setMessage({ text: data.message ?? "Não foi possível guardar.", error: true });
    setConfigured(true);
    setMessage({ text: "Definições guardadas.", error: false });
  }

  async function readPhoto(file: File) {
    setBusy("reading");
    setMessage(null);
    try {
      const form = new FormData();
      form.append("photo", await preparePhoto(file, 3.5 * 1024 * 1024), "menu-do-dia.jpg");
      const res = await fetch("/api/painel/menu-do-dia/foto", { method: "POST", body: form }).catch(() => null);
      if (!res) return setMessage({ text: "Sem ligação. Tente de novo.", error: true });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setMessage({ text: data.message ?? "Não foi possível ler a foto.", error: true });
      setSections(fromApi(data.reading.sections));
      // Na primeira vez, o que a folha diz que o menu inclui passa para as definições.
      if (!configured) {
        setSettings((s) => ({
          ...s,
          includes: data.reading.includes ?? s.includes,
          extras: data.reading.extras ?? s.extras,
          note: data.reading.note ?? s.note,
        }));
      }
      setMessage({ text: "Li a folha. Confirme os pratos e os preços e carregue em Guardar.", error: false });
    } catch {
      setMessage({ text: "Não foi possível abrir esta foto. Tire-a de novo.", error: true });
    } finally {
      setBusy(null);
    }
  }

  const setItem = (si: number, ii: number, patch: Partial<Item>) =>
    setSections((all) => all.map((s, a) => (a !== si ? s : { ...s, items: s.items.map((it, b) => (b !== ii ? it : { ...it, ...patch })) })));
  const removeItem = (si: number, ii: number) => setSections((all) => all.map((s, a) => (a !== si ? s : { ...s, items: s.items.filter((_, b) => b !== ii) })));
  const addItem = (si: number) => setSections((all) => all.map((s, a) => (a !== si ? s : { ...s, items: [...s.items, { name: "", half: "", full: "" }] })));

  if (!loaded) return <p className="text-ink-soft">{message?.text ?? "A carregar o menu do dia…"}</p>;

  return (
    <div className="grid gap-5">
      <section className="grid gap-4 rounded-3xl border border-line bg-card p-5">
        <div>
          <h2 className="text-xl">Menu do dia · {dateLabel(today)}</h2>
          <p className="mt-1 text-sm text-ink-soft">
            {hasToday ? "Os clientes veem este menu no topo da ementa, num pop-up." : "Ainda não há menu para hoje. Fotografe a folha do dia ou escreva-o."}
            {!settings.enabled && " O menu do dia está desligado nas definições abaixo."}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <label className={`${primary} inline-flex cursor-pointer items-center ${busy ? "pointer-events-none opacity-60" : ""}`}>
            {busy === "reading" ? "A ler a folha…" : "📷 Fotografar a folha de hoje"}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              disabled={busy !== null}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void readPhoto(f);
              }}
            />
          </label>
          {previous && (
            <button type="button" disabled={busy !== null} onClick={() => setSections(fromApi(previous.sections))} className={secondary}>
              Repetir o de {dateLabel(previous.date).split(",")[0]}
            </button>
          )}
        </div>

        {message && (
          <p role={message.error ? "alert" : "status"} className={`rounded-xl px-4 py-3 text-sm ${message.error ? "bg-red-50 text-red-800" : "bg-[#ecfdf3] text-ok"}`}>
            {message.text}
          </p>
        )}

        {sections.map((s, si) => (
          <fieldset key={si} className="grid gap-2 rounded-2xl border border-line p-3">
            <div className="flex items-center gap-2">
              <input
                value={s.title}
                onChange={(e) => setSections((all) => all.map((x, a) => (a === si ? { ...x, title: e.target.value } : x)))}
                placeholder="Nome da secção (ex.: Pratos do dia)"
                aria-label="Nome da secção"
                className={`${input} flex-1 font-semibold`}
              />
              <button type="button" onClick={() => setSections((all) => all.filter((_, a) => a !== si))} className={ghost} aria-label={`Tirar a secção ${s.title}`}>
                Tirar
              </button>
            </div>
            <div className="hidden grid-cols-[1fr_5.5rem_5.5rem_2.5rem] gap-2 px-1 text-xs font-semibold text-ink-soft sm:grid">
              <span>Prato</span>
              <span>½ Menu €</span>
              <span>Menu €</span>
              <span />
            </div>
            {s.items.map((it, ii) => (
              <div key={ii} className="grid grid-cols-[1fr_4.5rem_4.5rem_2.5rem] gap-2 sm:grid-cols-[1fr_5.5rem_5.5rem_2.5rem]">
                <input value={it.name} onChange={(e) => setItem(si, ii, { name: e.target.value })} placeholder="Prato" aria-label="Prato" className={`${input} min-w-0`} />
                <input value={it.half} onChange={(e) => setItem(si, ii, { half: e.target.value })} placeholder="½" inputMode="decimal" aria-label="Preço ½ menu" className={`${input} min-w-0`} />
                <input value={it.full} onChange={(e) => setItem(si, ii, { full: e.target.value })} placeholder="Menu" inputMode="decimal" aria-label="Preço menu" className={`${input} min-w-0`} />
                <button type="button" onClick={() => removeItem(si, ii)} className="min-h-11 rounded-xl text-lg text-ink-soft" aria-label={`Tirar ${it.name || "prato"}`}>
                  ✕
                </button>
              </div>
            ))}
            <button type="button" onClick={() => addItem(si)} className="justify-self-start text-sm font-semibold text-brand underline">
              + Acrescentar prato
            </button>
          </fieldset>
        ))}
        <button type="button" onClick={() => setSections((all) => [...all, { title: "", items: [{ name: "", half: "", full: "" }] }])} className={`${ghost} justify-self-start`}>
          + Acrescentar secção
        </button>
        <p className="text-xs text-ink-soft">Pratos com um só preço: deixe o ½ menu em branco.</p>

        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy !== null} onClick={() => void save()} className={primary}>
            {busy === "saving" ? "A guardar…" : "Guardar o menu de hoje"}
          </button>
          {hasToday && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => {
                setSections([]);
                void (async () => {
                  setBusy("saving");
                  const res = await fetch("/api/painel/menu-do-dia", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sections: [] }) }).catch(() => null);
                  setBusy(null);
                  if (res?.ok) {
                    setHasToday(false);
                    setSections(EMPTY);
                    setMessage({ text: "Menu de hoje apagado.", error: false });
                  } else setMessage({ text: "Não foi possível apagar.", error: true });
                })();
              }}
              className={ghost}
            >
              Apagar o de hoje
            </button>
          )}
        </div>
      </section>

      <details className="rounded-3xl border border-line bg-card p-5" open={!configured}>
        <summary className="cursor-pointer text-lg font-semibold">O que o menu inclui, horas e dias</summary>
        <div className="mt-4 grid gap-4">
          <label className="flex items-start gap-3">
            <input type="checkbox" checked={settings.enabled} onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })} className="mt-1 size-5 accent-[var(--color-brand)]" />
            <span>
              <span className="font-semibold">Mostrar o menu do dia na ementa</span>
              <span className="block text-sm text-ink-soft">Aparece no topo da ementa, nos dias escolhidos, e abre um pop-up com tudo.</span>
            </span>
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            O menu inclui
            <input value={settings.includes} onChange={(e) => setSettings({ ...settings, includes: e.target.value })} className={`${input} font-normal`} />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Extra (opcional)
            <input value={settings.extras} onChange={(e) => setSettings({ ...settings, extras: e.target.value })} placeholder="Ex.: Com sobremesa caseira + 2,50 €" className={`${input} font-normal`} />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Nota (opcional)
            <input value={settings.note} onChange={(e) => setSettings({ ...settings, note: e.target.value })} placeholder="Ex.: Outras bebidas não incluídas no menu" className={`${input} font-normal`} />
          </label>
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-sm font-semibold">
              Almoço das
              <input type="time" value={settings.from} onChange={(e) => setSettings({ ...settings, from: e.target.value })} className={`${input} font-normal`} />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              às
              <input type="time" value={settings.to} onChange={(e) => setSettings({ ...settings, to: e.target.value })} className={`${input} font-normal`} />
            </label>
          </div>
          <div role="group" aria-label="Dias com menu do dia" className="flex flex-wrap gap-2">
            {DAYS.map((d, i) => {
              const day = i + 1;
              const on = settings.days.includes(day);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setSettings({ ...settings, days: on ? settings.days.filter((x) => x !== day) : [...settings.days, day].sort() })}
                  className={`min-h-10 min-w-12 rounded-xl border px-3 text-sm font-semibold ${on ? "border-brand bg-brand text-white" : "border-line bg-card text-ink-soft"}`}
                >
                  {d}
                </button>
              );
            })}
          </div>
          <div>
            <button type="button" disabled={busy !== null} onClick={() => void saveSettings()} className={secondary}>
              Guardar definições
            </button>
          </div>
        </div>
      </details>
    </div>
  );
}
