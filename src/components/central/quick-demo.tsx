"use client";

import { useState } from "react";
import { formatEur } from "@/lib/money";
import type { MenuDraft } from "@/server/menu/menu-import";
import { MAX_TOTAL_BYTES, preparePhoto } from "@/components/staff/menu-import";

type Lang = "pt" | "en" | "es" | "fr" | "de";
const LANGS: { id: Lang; label: string; flag: string }[] = [
  { id: "pt", label: "Português", flag: "🇵🇹" },
  { id: "en", label: "English", flag: "🇬🇧" },
  { id: "es", label: "Español", flag: "🇪🇸" },
  { id: "fr", label: "Français", flag: "🇫🇷" },
  { id: "de", label: "Deutsch", flag: "🇩🇪" },
];
const MAX_PHOTOS = 8;

type Translated = Record<string, { name: string; description?: string }>;

/** Demonstração rápida: fotos da ementa → ementa digital em 5 línguas, sem gravar nada. */
export function QuickDemo() {
  const [photos, setPhotos] = useState<File[]>([]);
  const [draft, setDraft] = useState<MenuDraft | null>(null);
  const [translations, setTranslations] = useState<Partial<Record<Lang, Translated>>>({});
  const [lang, setLang] = useState<Lang>("pt");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refOf = (ci: number, pi?: number) => (pi === undefined ? `c${ci}` : `p${ci}-${pi}`);

  async function run() {
    setBusy(true);
    setError(null);
    setTranslations({});
    try {
      const form = new FormData();
      for (const p of photos) form.append("photos", await preparePhoto(p, MAX_TOTAL_BYTES / photos.length), "pagina.jpg");
      const res = await fetch("/api/central/demonstracao", { method: "POST", body: form }).catch(() => null);
      const data = res ? await res.json().catch(() => ({})) : {};
      if (!res?.ok) return setError(data.message ?? "Sem ligação. Tente de novo.");
      const read: MenuDraft = data.draft;
      setDraft(read);
      setLang("pt");
      // As traduções chegam em paralelo: cada língua aparece quando fica pronta.
      const items = read.categories.flatMap((c, ci) => [
        { kind: "category" as const, ref: refOf(ci), name: c.name },
        ...c.products.map((p, pi) => ({ kind: "product" as const, ref: refOf(ci, pi), name: p.name, ...(p.description && { description: p.description }) })),
      ]);
      await Promise.all(
        (["en", "es", "fr", "de"] as const).map(async (locale) => {
          const r = await fetch("/api/central/demonstracao/traduzir", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ locale, items: items.slice(0, 500) }),
          }).catch(() => null);
          if (!r?.ok) return;
          const { suggestions } = (await r.json()) as { suggestions: { ref: string; name: string; description?: string }[] };
          setTranslations((t) => ({ ...t, [locale]: Object.fromEntries(suggestions.map((s) => [s.ref, { name: s.name, description: s.description }])) }));
        }),
      );
    } catch {
      setError("Não foi possível abrir uma destas fotos.");
    } finally {
      setBusy(false);
    }
  }

  const tr = translations[lang as Exclude<Lang, "pt">];
  const text = (ref: string, name: string, description?: string | null) => {
    const t = lang === "pt" ? undefined : tr?.[ref];
    return { name: t?.name ?? name, description: t ? (t.description ?? description ?? undefined) : (description ?? undefined) };
  };

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <section className="h-fit rounded-3xl border border-line bg-card p-5">
        <h2 className="text-lg">1. Fotos da ementa</h2>
        <p className="mt-1 text-sm text-ink-soft">Uma foto por página, de frente e com boa luz. Até {MAX_PHOTOS} fotos.</p>
        <label className="mt-3 flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-brand px-4 font-semibold text-brand">
          {photos.length ? "Juntar mais fotos" : "Tirar ou escolher fotos"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="sr-only"
            onChange={(e) => {
              setPhotos((p) => [...p, ...Array.from(e.target.files ?? [])].slice(0, MAX_PHOTOS));
              e.target.value = "";
            }}
          />
        </label>
        {photos.length > 0 && (
          <p className="mt-2 flex items-center justify-between text-sm">
            <span>
              {photos.length} {photos.length === 1 ? "foto" : "fotos"}
            </span>
            <button type="button" onClick={() => setPhotos([])} className="text-ink-soft underline">
              Limpar
            </button>
          </p>
        )}
        <button type="button" onClick={run} disabled={busy || photos.length === 0} className="mt-4 min-h-12 w-full rounded-xl bg-brand px-5 font-semibold text-white disabled:opacity-50">
          {busy ? (draft ? "A traduzir…" : "A ler a ementa…") : "2. Criar a ementa digital"}
        </button>
        {error && (
          <p role="alert" className="mt-3 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
            {error}
          </p>
        )}
        <p className="mt-3 text-xs text-ink-soft">Os preços vêm da foto e podem ter erros de leitura: é uma demonstração, não fica guardada.</p>
      </section>

      <section aria-label="Ementa digital" className="min-w-0">
        {!draft ? (
          <div className="grid h-full min-h-64 place-items-center rounded-3xl border border-dashed border-line p-8 text-center text-ink-soft">
            A ementa digital aparece aqui, como o cliente a vê no telemóvel.
          </div>
        ) : (
          <div className="mx-auto max-w-md overflow-hidden rounded-[2rem] border-8 border-ink bg-paper shadow-xl">
            <div className="flex gap-1 overflow-x-auto border-b border-line bg-card p-2 [scrollbar-width:none]" role="group" aria-label="Língua">
              {LANGS.map((l) => {
                const ready = l.id === "pt" || !!translations[l.id as Exclude<Lang, "pt">];
                return (
                  <button
                    key={l.id}
                    type="button"
                    disabled={!ready}
                    aria-pressed={lang === l.id}
                    onClick={() => setLang(l.id)}
                    className={`min-h-9 shrink-0 rounded-full px-3 text-sm ${lang === l.id ? "bg-brand text-white" : "bg-paper"} disabled:opacity-40`}
                  >
                    {l.flag} {ready ? l.label : "…"}
                  </button>
                );
              })}
            </div>
            <div className="max-h-[70dvh] overflow-y-auto px-4 pb-6">
              {draft.categories.map((c, ci) => (
                <div key={ci}>
                  <h3 className="sticky top-0 bg-paper pt-4 pb-2 font-[family-name:var(--font-display)] text-xl">{text(refOf(ci), c.name).name}</h3>
                  <ul className="grid gap-2">
                    {c.products.map((p, pi) => {
                      const t = text(refOf(ci, pi), p.name, p.description);
                      return (
                        <li key={pi} className="flex items-start justify-between gap-3 rounded-2xl border border-line bg-card p-3">
                          <span className="min-w-0">
                            <span className="block font-semibold">{t.name}</span>
                            {t.description && <span className="mt-0.5 block text-sm text-ink-soft">{t.description}</span>}
                          </span>
                          <span className="shrink-0 font-semibold tabular-nums">{p.priceCents === null ? "—" : formatEur(p.priceCents)}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
