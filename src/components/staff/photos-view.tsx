"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Product = { ref: string; name: string; imageUrl: string | null };
type Section = { section: string; categories: { name: string; products: Product[] }[] };

const MAX_SIDE = 1200;

/**
 * Reduz a foto no telemóvel antes de enviar (≤ 1200 px, WebP ou JPEG ~150 KB). Redesenhar num
 * canvas também apaga os metadados da fotografia (incluindo a localização GPS).
 */
async function prepare(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const encode = (type: string, quality: number) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  const webp = await encode("image/webp", 0.82);
  if (webp && webp.type === "image/webp") return webp;
  const jpeg = await encode("image/jpeg", 0.85); // Safari antigo não gera WebP
  if (!jpeg) throw new Error("Não foi possível ler a foto");
  return jpeg;
}

/** Fotos dos pratos na ementa (dono/gerente). */
export function PhotosView() {
  const [sections, setSections] = useState<Section[] | null>(null);
  const [query, setQuery] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const target = useRef<Product | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/painel/fotos", { cache: "no-store" }).catch(() => null);
    setSections(res?.ok ? (await res.json()).sections : []);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const all = useMemo(() => (sections ?? []).flatMap((s) => s.categories.flatMap((c) => c.products)), [sections]);
  const withPhoto = all.filter((p) => p.imageUrl).length;

  function choose(p: Product) {
    target.current = p;
    setMessage(null);
    fileInput.current?.click();
  }

  async function upload(file: File) {
    const p = target.current;
    if (!p) return;
    setBusy(p.ref);
    try {
      const blob = await prepare(file);
      const form = new FormData();
      form.set("productRef", p.ref);
      form.set("file", blob, "foto");
      const res = await fetch("/api/painel/fotos", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message ?? "Não foi possível enviar.");
      setMessage({ text: `Foto de "${p.name}" guardada. Os clientes já a veem.`, error: false });
      await load();
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Não foi possível enviar.", error: true });
    } finally {
      setBusy(null);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function remove(p: Product) {
    setBusy(p.ref);
    setMessage(null);
    const res = await fetch(`/api/painel/fotos?ref=${encodeURIComponent(p.ref)}`, { method: "DELETE" }).catch(() => null);
    setBusy(null);
    if (!res?.ok) return setMessage({ text: "Não foi possível remover.", error: true });
    await load();
  }

  const q = query.trim().toLowerCase();
  const visible = (sections ?? [])
    .map((s) => ({
      ...s,
      categories: s.categories
        .map((c) => ({ ...c, products: c.products.filter((p) => (!onlyMissing || !p.imageUrl) && (!q || p.name.toLowerCase().includes(q))) }))
        .filter((c) => c.products.length > 0),
    }))
    .filter((s) => s.categories.length > 0);

  return (
    <div className="grid gap-5">
      <div>
        <h2 className="text-xl">Fotos dos pratos</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-soft">
          Pratos com foto vendem-se melhor. Tire a foto com o telemóvel ou escolha uma da galeria: é reduzida automaticamente e
          aparece logo na ementa. {sections && `${withPhoto} de ${all.length} artigos com foto.`}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Procurar…"
          aria-label="Procurar"
          className="min-h-10 w-full rounded-xl border border-line bg-card px-3 text-sm sm:w-64"
        />
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} className="size-4 accent-[var(--color-brand)]" />
          Só sem foto
        </label>
      </div>

      {message && (
        <p role={message.error ? "alert" : "status"} className={`rounded-xl px-4 py-3 text-sm ${message.error ? "bg-danger-soft text-danger" : "bg-[#ecfdf3] text-ok"}`}>
          {message.text}
        </p>
      )}

      {/* Um só seletor de ficheiro; no telemóvel oferece câmara ou galeria. */}
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
        }}
      />

      {!sections ? (
        <p className="text-ink-soft">A carregar…</p>
      ) : (
        visible.map((s) => (
          <section key={s.section} aria-label={s.section} className="grid gap-3">
            <h3 className="text-sm font-semibold tracking-wide text-ink-soft uppercase">{s.section}</h3>
            {s.categories.map((c) => (
              <div key={c.name}>
                <p className="mb-2 font-semibold">{c.name}</p>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {c.products.map((p) => (
                    <li key={p.ref} className="flex items-center gap-3 rounded-2xl border border-line bg-card p-3">
                      {p.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.imageUrl} alt="" className="size-16 shrink-0 rounded-xl object-cover" />
                      ) : (
                        <span className="grid size-16 shrink-0 place-items-center rounded-xl border border-dashed border-line text-xs text-ink-soft">
                          sem foto
                        </span>
                      )}
                      <span className="min-w-0 flex-1 font-medium">{p.name}</span>
                      <span className="flex shrink-0 flex-col gap-1">
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() => choose(p)}
                          className="min-h-9 rounded-lg bg-brand px-3 text-sm font-semibold text-white disabled:opacity-50"
                        >
                          {busy === p.ref ? "A enviar…" : p.imageUrl ? "Trocar" : "Pôr foto"}
                        </button>
                        {p.imageUrl && (
                          <button type="button" disabled={busy !== null} onClick={() => remove(p)} className="text-xs text-ink-soft underline">
                            Remover
                          </button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ))
      )}
    </div>
  );
}
