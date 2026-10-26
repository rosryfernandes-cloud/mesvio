"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TranslatableItem, TranslationLocale } from "@/server/staff/translations-service";

/** Hoje só há inglês; o resto da ementa fica em português. */
const LOCALE: TranslationLocale = "en";

type Filter = "product" | "category" | "option";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "product", label: "Pratos e bebidas" },
  { id: "category", label: "Secções e categorias" },
  { id: "option", label: "Opções" },
];
const kindsOf: Record<Filter, TranslatableItem["kind"][]> = {
  product: ["product"],
  category: ["section", "category"],
  option: ["group", "modifier"],
};

type Draft = { name: string; description: string };
const keyOf = (i: Pick<TranslatableItem, "kind" | "ref">) => `${i.kind}|${i.ref}`;

/** Traduções da ementa feitas pelo restaurante (dono/gerente). */
export function TranslationsView() {
  const locale = LOCALE;
  const [filter, setFilter] = useState<Filter>("product");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<TranslatableItem[] | null>(null);
  const [drafts, setDrafts] = useState<Map<string, Draft>>(new Map());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const load = useCallback(async (l: TranslationLocale) => {
    setItems(null);
    const res = await fetch(`/api/painel/traducoes?lang=${l}`, { cache: "no-store" }).catch(() => null);
    setItems(res?.ok ? (await res.json()).items : []);
  }, []);

  useEffect(() => {
    void load(locale);
    setDrafts(new Map());
  }, [locale, load]);

  const visible = useMemo(() => {
    if (!items) return [];
    const q = query.trim().toLowerCase();
    return items.filter(
      (i) =>
        kindsOf[filter].includes(i.kind) &&
        (!onlyMissing || !i.translated) &&
        (!q || i.original.name.toLowerCase().includes(q) || i.translated?.name.toLowerCase().includes(q)),
    );
  }, [items, filter, onlyMissing, query]);

  const progress = useMemo(() => {
    const of = (f: Filter) => (items ?? []).filter((i) => kindsOf[f].includes(i.kind));
    return Object.fromEntries(FILTERS.map((f) => [f.id, { done: of(f.id).filter((i) => i.translated).length, total: of(f.id).length }])) as Record<
      Filter,
      { done: number; total: number }
    >;
  }, [items]);

  function value(i: TranslatableItem): Draft {
    return drafts.get(keyOf(i)) ?? { name: i.translated?.name ?? "", description: i.translated?.description ?? "" };
  }

  function edit(i: TranslatableItem, patch: Partial<Draft>) {
    setMessage(null);
    setDrafts((d) => {
      const next = new Map(d);
      const merged = { ...value(i), ...patch };
      const unchanged = merged.name === (i.translated?.name ?? "") && merged.description === (i.translated?.description ?? "");
      if (unchanged) next.delete(keyOf(i));
      else next.set(keyOf(i), merged);
      return next;
    });
  }

  async function save() {
    if (!items || drafts.size === 0) return;
    setBusy(true);
    setMessage(null);
    const changes = items
      .filter((i) => drafts.has(keyOf(i)))
      .map((i) => {
        const d = drafts.get(keyOf(i))!;
        return { kind: i.kind, ref: i.ref, name: d.name.trim(), description: i.kind === "product" ? d.description.trim() || undefined : undefined };
      });
    const res = await fetch("/api/painel/traducoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale, changes }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setMessage({ text: "Não foi possível guardar. Tente de novo.", error: true });
    const { saved, removed } = await res.json();
    setMessage({ text: `Guardado: ${saved} ${saved === 1 ? "tradução" : "traduções"}${removed ? `, ${removed} ${removed === 1 ? "apagada" : "apagadas"}` : ""}. Os clientes já as veem.`, error: false });
    setDrafts(new Map());
    await load(locale);
  }

  const langLabel = "inglês";

  return (
    <div className="grid gap-5 pb-24">
      <div>
        <h2 className="text-xl">Ementa em inglês</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-soft">
          Clientes com o telemóvel noutra língua veem a ementa em inglês (e podem mudar para português). Botões, alergénios e avisos
          já estão traduzidos; aqui traduz os nomes e descrições do seu POS. O que ficar por traduzir aparece em português.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className={`min-h-10 rounded-xl border px-3 text-sm ${filter === f.id ? "border-brand font-semibold text-brand" : "border-line bg-card"}`}
          >
            {f.label}{" "}
            {items && (
              <span className="text-ink-soft tabular-nums">
                {progress[f.id].done}/{progress[f.id].total}
              </span>
            )}
          </button>
        ))}
        <label className="ml-auto flex min-h-10 items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} className="size-4 accent-[var(--color-brand)]" />
          Só por traduzir
        </label>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Procurar…"
          aria-label="Procurar"
          className="min-h-10 w-full rounded-xl border border-line bg-card px-3 text-sm sm:w-56"
        />
      </div>

      {message && (
        <p
          role={message.error ? "alert" : "status"}
          className={`rounded-xl px-4 py-3 text-sm ${message.error ? "bg-danger-soft text-danger" : "bg-[#ecfdf3] text-ok"}`}
        >
          {message.text}
        </p>
      )}

      {!items ? (
        <p className="text-ink-soft">A carregar…</p>
      ) : visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-6 py-10 text-center text-ink-soft">
          {onlyMissing ? `Está tudo traduzido em ${langLabel}.` : "Nada encontrado."}
        </p>
      ) : (
        <ul className="grid gap-2">
          {visible.map((i) => {
            const v = value(i);
            const dirty = drafts.has(keyOf(i));
            return (
              <li key={keyOf(i)} className={`rounded-2xl border bg-card p-4 ${dirty ? "border-brand" : "border-line"}`}>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="min-w-0">
                    <p className="text-xs text-ink-soft">{i.context}</p>
                    <p className="font-semibold">{i.original.name}</p>
                    {i.original.description && <p className="mt-1 text-sm text-ink-soft">{i.original.description}</p>}
                  </div>
                  <div className="grid gap-2">
                    <input
                      value={v.name}
                      onChange={(e) => edit(i, { name: e.target.value })}
                      maxLength={200}
                      aria-label={`Nome em ${langLabel}: ${i.original.name}`}
                      placeholder={`Nome em ${langLabel}`}
                      className="min-h-11 rounded-xl border border-line bg-paper px-3"
                    />
                    {i.kind === "product" && (
                      <textarea
                        value={v.description}
                        onChange={(e) => edit(i, { description: e.target.value })}
                        maxLength={1000}
                        rows={2}
                        aria-label={`Descrição em ${langLabel}: ${i.original.name}`}
                        placeholder={i.original.description ? `Descrição em ${langLabel}` : "Sem descrição no original (opcional)"}
                        className="rounded-xl border border-line bg-paper px-3 py-2 text-sm"
                      />
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {drafts.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <span className="text-sm">
              {drafts.size} {drafts.size === 1 ? "alteração" : "alterações"} por guardar · apagar o nome remove a tradução
            </span>
            <div className="flex gap-2">
              <button type="button" onClick={() => setDrafts(new Map())} className="min-h-11 rounded-xl px-4 text-sm text-ink-soft underline">
                Descartar
              </button>
              <button
                type="button"
                onClick={save}
                disabled={busy}
                className="min-h-11 rounded-xl bg-brand px-5 font-semibold text-white disabled:opacity-50"
              >
                {busy ? "A guardar…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
