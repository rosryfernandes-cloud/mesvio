"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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

/** Demonstração rápida: link, PDF ou fotos da ementa → ementa digital em 5 línguas, sem gravar nada. */
export function QuickDemo() {
  const router = useRouter();
  const [photos, setPhotos] = useState<File[]>([]);
  const [link, setLink] = useState("");
  const [draft, setDraft] = useState<MenuDraft | null>(null);
  const [translations, setTranslations] = useState<Partial<Record<Lang, Translated>>>({});
  const [lang, setLang] = useState<Lang>("pt");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restaurantName, setRestaurantName] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const refOf = (ci: number, pi?: number) => (pi === undefined ? `c${ci}` : `p${ci}-${pi}`);

  async function run() {
    setBusy(true);
    setError(null);
    setTranslations({});
    setSavedUrl(null);
    try {
      let res: Response | null;
      if (photos.length === 0) {
        // Link: é o servidor que o descarrega (página do site → texto, PDF → como um PDF enviado).
        res = await fetch("/api/central/demonstracao/link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: link.trim() }),
        }).catch(() => null);
      } else {
        const form = new FormData();
        for (const p of photos) {
          if (p.type === "application/pdf") {
            if (p.size > MAX_TOTAL_BYTES) return setError("Este PDF tem mais de 4 MB. Se estiver no site do restaurante, cole antes o link do PDF.");
            form.append("photos", p, "ementa.pdf");
          } else form.append("photos", await preparePhoto(p, MAX_TOTAL_BYTES / photos.length), "pagina.jpg");
        }
        res = await fetch("/api/central/demonstracao", { method: "POST", body: form }).catch(() => null);
      }
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

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    const res = await fetch("/api/central/previsualizacoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restaurantName: restaurantName.trim(),
        notes: notes.trim() || undefined,
        menu: {
          categories: draft.categories.map((c) => ({
            name: c.name,
            products: c.products.map((p) => ({ name: p.name, description: p.description, priceCents: p.priceCents, imageUrl: p.imageUrl ?? null })),
          })),
        },
        translations,
      }),
    }).catch(() => null);
    setSaving(false);
    const d = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) return setError(d.message ?? "Não foi possível guardar.");
    setSavedUrl(d.url);
    router.refresh();
  }

  async function copy() {
    if (!savedUrl) return;
    try {
      await navigator.clipboard.writeText(savedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Não foi possível copiar: selecione o link e copie à mão.");
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
        <h2 className="text-lg">1. A ementa do restaurante</h2>
        <form
          className="mt-3 grid gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy && link.trim().length >= 4) void run();
          }}
        >
          <label htmlFor="demo-link" className="text-sm font-semibold">
            Link da ementa (site ou PDF)
          </label>
          <input
            id="demo-link"
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            value={link}
            onChange={(e) => {
              setLink(e.target.value);
              if (e.target.value) setPhotos([]);
            }}
            maxLength={2000}
            placeholder="https://restaurante.pt/menu"
            className="min-h-11 rounded-xl border border-line bg-paper px-3 text-sm"
          />
        </form>
        <p className="mt-3 text-center text-sm text-ink-soft">ou</p>
        <p className="mt-1 text-sm text-ink-soft">Fotos ou PDF: uma foto por página, de frente e com boa luz. Até {MAX_PHOTOS} fotos.</p>
        <label className="mt-3 flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-brand px-4 font-semibold text-brand">
          {photos.length ? "Juntar mais" : "Tirar fotos ou escolher PDF"}
          <input
            type="file"
            accept="image/*,application/pdf"
            multiple
            className="sr-only"
            onChange={(e) => {
              setPhotos((p) => [...p, ...Array.from(e.target.files ?? [])].slice(0, MAX_PHOTOS));
              setLink("");
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
        <button type="button" onClick={run} disabled={busy || (photos.length === 0 && link.trim().length < 4)} className="mt-4 min-h-12 w-full rounded-xl bg-brand px-5 font-semibold text-white disabled:opacity-50">
          {busy ? (draft ? "A traduzir…" : "A ler a ementa…") : "2. Criar a ementa digital"}
        </button>
        {error && (
          <p role="alert" className="mt-3 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
            {error}
          </p>
        )}
        <p className="mt-3 text-xs text-ink-soft">Os preços vêm da ementa e podem ter erros de leitura. Nada fica guardado até criar o link.</p>

        {draft && (
          <div className="mt-5 border-t border-line pt-4">
            <h2 className="text-lg">3. Link para enviar ao dono</h2>
            <p className="mt-1 text-sm text-ink-soft">Uma página privada com a ementa dele, durante 30 dias. Recebe um aviso quando ele a abrir ou pedir para ativar.</p>
            {savedUrl ? (
              <div className="mt-3 grid gap-2">
                <input readOnly value={savedUrl} onFocus={(e) => e.target.select()} aria-label="Link da pré-visualização" className="min-h-11 rounded-xl border border-line bg-paper px-3 text-sm" />
                <div className="flex gap-2">
                  <button type="button" onClick={copy} className="min-h-11 flex-1 rounded-xl bg-brand px-4 font-semibold text-white">
                    {copied ? "Copiado ✓" : "Copiar link"}
                  </button>
                  <a href={savedUrl} target="_blank" rel="noopener" className="flex min-h-11 items-center rounded-xl border border-line px-4 font-semibold">
                    Abrir
                  </a>
                </div>
              </div>
            ) : (
              <div className="mt-3 grid gap-2">
                <input value={restaurantName} onChange={(e) => setRestaurantName(e.target.value)} maxLength={120} placeholder="Nome do restaurante" aria-label="Nome do restaurante" className="min-h-11 rounded-xl border border-line bg-paper px-3" />
                <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} placeholder="Notas (opcional): contacto, quando ligar…" aria-label="Notas" className="min-h-11 rounded-xl border border-line bg-paper px-3 text-sm" />
                <button type="button" onClick={save} disabled={saving || busy || restaurantName.trim().length < 2} className="min-h-11 rounded-xl bg-brand px-4 font-semibold text-white disabled:opacity-50">
                  {saving ? "A guardar…" : busy ? "À espera das traduções…" : "Guardar e criar link"}
                </button>
              </div>
            )}
          </div>
        )}
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
                          {p.imageUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.imageUrl} alt="" referrerPolicy="no-referrer" className="size-16 shrink-0 rounded-xl object-cover" />
                          )}
                          <span className="min-w-0 flex-1">
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
