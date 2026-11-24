"use client";

import { useEffect, useMemo, useState } from "react";
import { formatEur } from "@/lib/money";

/**
 * Sugestões da casa: o dono escolhe até 8 pratos da ementa para aparecerem em destaque no topo da
 * ementa do cliente ("⭐ Sugestões da casa", traduzido nas 5 línguas) e liga ou desliga quando quiser.
 */

type Product = { ref: string; name: string; priceCents: number; posAvailable: boolean; locallyUnavailable: boolean };
type Section = { name: string; products: Product[] };
type CatalogSection = { section: string; categories: { ref: string; name: string; products: Product[] }[] };
const MAX = 8;

export function SuggestionsView() {
  const [sections, setSections] = useState<Section[] | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [refs, setRefs] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    void (async () => {
      const [c, s] = await Promise.all([
        fetch("/api/painel/catalogo", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch("/api/painel/sugestoes", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      if (!c || !s) return setMessage({ text: "Não foi possível abrir as sugestões.", error: true });
      // O catálogo vem por secção e categoria; aqui mostra-se por categoria.
      setSections((c.sections as CatalogSection[]).flatMap((sec) => sec.categories.map((cat) => ({ name: cat.name, products: cat.products }))));
      setEnabled(s.enabled);
      setRefs(s.refs);
    })();
  }, []);

  const byRef = useMemo(() => new Map((sections ?? []).flatMap((sec) => sec.products).map((p) => [p.ref, p])), [sections]);
  const q = query.trim().toLowerCase();

  function toggle(ref: string) {
    setMessage(null);
    setDirty(true);
    setRefs((r) => (r.includes(ref) ? r.filter((x) => x !== ref) : r.length >= MAX ? r : [...r, ref]));
  }
  function move(ref: string, dir: -1 | 1) {
    setDirty(true);
    setRefs((r) => {
      const i = r.indexOf(ref), j = i + dir;
      if (i < 0 || j < 0 || j >= r.length) return r;
      const next = [...r];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  async function save(nextEnabled = enabled) {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/painel/sugestoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: nextEnabled, refs: refs.filter((r) => byRef.has(r)) }),
    }).catch(() => null);
    const d = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok) return setMessage({ text: d.message ?? "Não foi possível guardar.", error: true });
    setEnabled(d.enabled);
    setRefs(d.refs);
    setDirty(false);
    setMessage({ text: d.enabled ? (d.refs.length ? "Guardado. As sugestões já aparecem no topo da ementa." : "Guardado. Escolha pelo menos um prato para aparecer na ementa.") : "Guardado. As sugestões estão escondidas da ementa.", error: false });
  }

  if (!sections) return <p className={message?.error ? "text-danger" : "text-ink-soft"}>{message?.text ?? "A abrir…"}</p>;

  return (
    <div className="grid gap-4">
      <section className="grid gap-3 rounded-3xl border border-line bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl">⭐ Sugestões da casa</h2>
            <p className="text-sm text-ink-soft">Os pratos que quer recomendar aparecem em destaque no topo da ementa, com foto e preço, nas 5 línguas.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            disabled={busy}
            onClick={() => void save(!enabled)}
            className={`flex min-h-11 items-center gap-2 rounded-full border px-4 font-semibold disabled:opacity-60 ${enabled ? "border-brand bg-brand text-white" : "border-line bg-paper"}`}
          >
            {enabled ? "Visível na ementa" : "Escondido"}
          </button>
        </div>

        <div>
          <p className="text-sm font-semibold">
            Escolhidos ({refs.length} de {MAX})
          </p>
          {refs.length === 0 ? (
            <p className="mt-1 text-sm text-ink-soft">Toque nos pratos da lista abaixo para os escolher.</p>
          ) : (
            <ol className="mt-2 grid gap-2">
              {refs.map((ref, i) => {
                const p = byRef.get(ref);
                return (
                  <li key={ref} className="flex items-center gap-2 rounded-xl border border-line bg-paper px-3 py-2">
                    <span className="w-5 text-sm font-bold text-ink-soft tabular-nums">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate font-semibold">{p?.name ?? "Prato que já não está na ementa"}</span>
                    <button type="button" aria-label="Subir" disabled={i === 0} onClick={() => move(ref, -1)} className="size-9 rounded-lg border border-line disabled:opacity-30">↑</button>
                    <button type="button" aria-label="Descer" disabled={i === refs.length - 1} onClick={() => move(ref, 1)} className="size-9 rounded-lg border border-line disabled:opacity-30">↓</button>
                    <button type="button" aria-label="Tirar" onClick={() => toggle(ref)} className="size-9 rounded-lg border border-line text-danger">✕</button>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        {message && (
          <p role={message.error ? "alert" : "status"} className={`rounded-xl px-3 py-2 text-sm ${message.error ? "bg-danger-soft text-danger" : "bg-[#ecfdf3] text-ok"}`}>
            {message.text}
          </p>
        )}
        <div>
          <button type="button" disabled={busy || !dirty} onClick={() => void save()} className="min-h-11 rounded-xl bg-brand px-5 font-semibold text-white disabled:opacity-50">
            {busy ? "A guardar…" : "Guardar escolha"}
          </button>
        </div>
      </section>

      <section className="grid gap-3 rounded-3xl border border-line bg-card p-5">
        <h3 className="font-semibold">Pratos da ementa</h3>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Procurar um prato…" className="min-h-11 rounded-xl border border-line bg-paper px-3" />
        {sections.map((sec) => {
          const list = sec.products.filter((p) => !q || p.name.toLowerCase().includes(q));
          if (list.length === 0) return null;
          return (
            <div key={`${sec.name}-${sections.indexOf(sec)}`}>
              <p className="text-xs font-semibold tracking-wide text-ink-soft uppercase">{sec.name}</p>
              <ul className="mt-1 grid gap-1 sm:grid-cols-2">
                {list.map((p) => {
                  const chosen = refs.includes(p.ref);
                  const full = !chosen && refs.length >= MAX;
                  return (
                    <li key={p.ref}>
                      <button
                        type="button"
                        disabled={full}
                        onClick={() => toggle(p.ref)}
                        className={`flex min-h-12 w-full items-center justify-between gap-2 rounded-xl border px-3 text-left disabled:opacity-40 ${chosen ? "border-brand bg-brand-soft/50 font-semibold" : "border-line"}`}
                      >
                        <span className="min-w-0 truncate">
                          {chosen ? "⭐ " : ""}
                          {p.name}
                          {(!p.posAvailable || p.locallyUnavailable) && <span className="ml-1 text-xs text-ink-soft">(esgotado)</span>}
                        </span>
                        <span className="shrink-0 text-sm tabular-nums">{formatEur(p.priceCents)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </section>
    </div>
  );
}
