"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { matchPhotos } from "@/lib/photo-matching";

type Product = { ref: string; name: string; imageUrl: string | null; category: string };
type Section = { section: string; categories: { name: string; products: Omit<Product, "category">[] }[] };

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

/** Reduz e envia a foto de um artigo. Lança erro com a mensagem a mostrar. */
async function uploadPhoto(ref: string, file: File): Promise<void> {
  let blob: Blob;
  try {
    blob = await prepare(file);
  } catch {
    throw new Error("Não foi possível ler esta foto (formato não suportado?).");
  }
  const form = new FormData();
  form.set("productRef", ref);
  form.set("file", blob, "foto");
  const res = await fetch("/api/painel/fotos", { method: "POST", body: form }).catch(() => null);
  if (!res) throw new Error("Sem ligação. Tente de novo.");
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? "Não foi possível enviar.");
}

/** Fotos dos pratos na ementa (dono/gerente): uma a uma, em massa, ou em sessão com a câmara. */
export function PhotosView() {
  const [sections, setSections] = useState<Section[] | null>(null);
  const [query, setQuery] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [bulk, setBulk] = useState<File[] | null>(null);
  const [session, setSession] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const bulkInput = useRef<HTMLInputElement>(null);
  const target = useRef<Product | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/painel/fotos", { cache: "no-store" }).catch(() => null);
    setSections(res?.ok ? (await res.json()).sections : []);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const all: Product[] = useMemo(
    () => (sections ?? []).flatMap((s) => s.categories.flatMap((c) => c.products.map((p) => ({ ...p, category: c.name })))),
    [sections],
  );
  const withPhoto = all.filter((p) => p.imageUrl).length;

  function choose(p: Product) {
    target.current = p;
    setMessage(null);
    fileInput.current?.click();
  }

  async function uploadOne(file: File) {
    const p = target.current;
    if (!p) return;
    setBusy(p.ref);
    try {
      await uploadPhoto(p.ref, file);
      setMessage({ text: `Foto de "${p.name}" guardada. Os clientes já a veem.`, error: false });
      await load();
    } catch (err) {
      setMessage({ text: (err as Error).message, error: true });
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

  function startBulk(files: FileList | File[] | null | undefined) {
    const images = [...(files ?? [])].filter((f) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|heic)$/i.test(f.name));
    if (images.length === 0) return;
    setMessage(null);
    setBulk(images.slice(0, 300));
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

  if (bulk) {
    return (
      <BulkReview
        files={bulk}
        products={all}
        onDone={async (text) => {
          setBulk(null);
          if (bulkInput.current) bulkInput.current.value = "";
          setMessage({ text, error: false });
          await load();
        }}
        onCancel={async () => {
          setBulk(null);
          if (bulkInput.current) bulkInput.current.value = "";
          await load(); // pode ter guardado algumas antes de fechar
        }}
      />
    );
  }

  return (
    <div
      className={`grid gap-5 rounded-3xl ${dragging ? "outline-3 outline-dashed outline-brand" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        startBulk(e.dataTransfer.files);
      }}
    >
      <div>
        <h2 className="text-xl">Fotos dos pratos</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-soft">
          Pratos com foto vendem-se melhor. As fotos são reduzidas automaticamente e aparecem logo na ementa.{" "}
          {sections && `${withPhoto} de ${all.length} artigos com foto.`}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => bulkInput.current?.click()}
          className="rounded-2xl border border-line bg-card p-4 text-left hover:border-brand"
        >
          <span className="block font-semibold">Enviar várias fotos</span>
          <span className="mt-1 block text-sm text-ink-soft">
            Escolha (ou arraste para aqui) as fotos de uma pasta. Associamos cada uma ao prato pelo nome do ficheiro e confirma antes
            de guardar.
          </span>
        </button>
        <button
          type="button"
          onClick={() => setSession(true)}
          disabled={!sections || all.every((p) => p.imageUrl)}
          className="rounded-2xl border border-line bg-card p-4 text-left hover:border-brand disabled:opacity-50"
        >
          <span className="block font-semibold">Sessão de fotos</span>
          <span className="mt-1 block text-sm text-ink-soft">
            No telemóvel: a câmara abre para cada prato sem foto, um a seguir ao outro. Ideal para fotografar durante o serviço.
          </span>
        </button>
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

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void uploadOne(f);
        }}
      />
      <input ref={bulkInput} type="file" accept="image/*" multiple className="hidden" onChange={(e) => startBulk(e.target.files)} />

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
                      <Thumb url={p.imageUrl} />
                      <span className="min-w-0 flex-1 font-medium">{p.name}</span>
                      <span className="flex shrink-0 flex-col gap-1">
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() => choose({ ...p, category: c.name })}
                          className="min-h-9 rounded-lg bg-brand px-3 text-sm font-semibold text-white disabled:opacity-50"
                        >
                          {busy === p.ref ? "A enviar…" : p.imageUrl ? "Trocar" : "Pôr foto"}
                        </button>
                        {p.imageUrl && (
                          <button type="button" disabled={busy !== null} onClick={() => remove({ ...p, category: c.name })} className="text-xs text-ink-soft underline">
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

      {session && (
        <PhotoSession
          queue={all.filter((p) => !p.imageUrl)}
          onClose={async (saved) => {
            setSession(false);
            if (saved > 0) setMessage({ text: `Sessão terminada: ${saved} ${saved === 1 ? "foto guardada" : "fotos guardadas"}.`, error: false });
            await load();
          }}
        />
      )}
    </div>
  );
}

function Thumb({ url, size = "size-16" }: { url: string | null; size?: string }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className={`${size} shrink-0 rounded-xl object-cover`} />
  ) : (
    <span className={`grid ${size} shrink-0 place-items-center rounded-xl border border-dashed border-line text-xs text-ink-soft`}>sem foto</span>
  );
}

/** Envio em massa: sugestões pelo nome do ficheiro, confirmação, e envio com progresso. */
function BulkReview({
  files,
  products,
  onDone,
  onCancel,
}: {
  files: File[];
  products: Product[];
  onDone: (summary: string) => void;
  onCancel: () => void;
}) {
  // Pré-visualizações criadas e libertadas no mesmo efeito (o modo estrito do React monta duas vezes).
  const [previews, setPreviews] = useState<string[]>([]);
  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);
  const suggested = useMemo(() => matchPhotos(files.map((f) => f.name), products), [files, products]);
  const [choice, setChoice] = useState<(string | null)[]>(() => suggested.map((m) => m.productRef));
  const [status, setStatus] = useState<("idle" | "sending" | "ok" | string)[]>(() => files.map(() => "idle"));
  const [running, setRunning] = useState(false);

  const byRef = useMemo(() => new Map(products.map((p) => [p.ref, p])), [products]);
  const categories = useMemo(() => [...new Set(products.map((p) => p.category))], [products]);
  const counts = new Map<string, number>();
  for (const r of choice) if (r) counts.set(r, (counts.get(r) ?? 0) + 1);
  const duplicates = [...counts.values()].some((n) => n > 1);
  const toSend = choice.filter(Boolean).length;
  const autoMatched = suggested.filter((m) => m.productRef).length;

  async function save() {
    setRunning(true);
    let ok = 0;
    let failed = 0;
    for (let i = 0; i < files.length; i++) {
      const ref = choice[i];
      if (!ref || status[i] === "ok") continue;
      setStatus((s) => s.map((v, j) => (j === i ? "sending" : v)));
      try {
        await uploadPhoto(ref, files[i]);
        ok++;
        setStatus((s) => s.map((v, j) => (j === i ? "ok" : v)));
      } catch (err) {
        failed++;
        setStatus((s) => s.map((v, j) => (j === i ? (err as Error).message : v)));
      }
    }
    setRunning(false);
    if (failed === 0) onDone(`${ok} ${ok === 1 ? "foto guardada" : "fotos guardadas"}. Os clientes já as veem.`);
  }

  const done = status.filter((s) => s === "ok").length;

  return (
    <div className="grid gap-4 pb-24">
      <div>
        <h2 className="text-xl">Confirmar fotos</h2>
        <p className="mt-1 text-sm text-ink-soft">
          {files.length} {files.length === 1 ? "foto" : "fotos"}; {autoMatched} associadas automaticamente pelo nome do ficheiro. Confirme
          ou escolha o prato de cada uma; as que ficarem em &ldquo;Não usar&rdquo; são ignoradas.
        </p>
      </div>
      <ul className="grid gap-2 lg:grid-cols-2">
        {files.map((f, i) => {
          const ref = choice[i];
          const p = ref ? byRef.get(ref) : null;
          const dup = ref ? (counts.get(ref) ?? 0) > 1 : false;
          const st = status[i];
          return (
            <li key={i} className={`flex gap-3 rounded-2xl border bg-card p-3 ${dup ? "border-danger" : st === "ok" ? "border-ok" : "border-line"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {previews[i] ? <img src={previews[i]} alt="" className="size-20 shrink-0 rounded-xl object-cover" /> : <span className="size-20 shrink-0 rounded-xl bg-line" />}
              <div className="grid min-w-0 flex-1 content-start gap-1.5">
                <p className="truncate text-xs text-ink-soft" title={f.name}>
                  {f.name}
                  {suggested[i].productRef && ref === suggested[i].productRef && <span className="ml-1 text-ok">· sugestão automática</span>}
                </p>
                <select
                  aria-label={`Prato para ${f.name}`}
                  value={ref ?? ""}
                  disabled={running || st === "ok"}
                  onChange={(e) => setChoice((c) => c.map((v, j) => (j === i ? e.target.value || null : v)))}
                  className="min-h-10 w-full rounded-xl border border-line bg-paper px-2 text-sm"
                >
                  <option value="">— Não usar —</option>
                  {categories.map((cat) => (
                    <optgroup key={cat} label={cat}>
                      {products
                        .filter((x) => x.category === cat)
                        .map((x) => (
                          <option key={x.ref} value={x.ref}>
                            {x.name}
                            {x.imageUrl ? " (tem foto)" : ""}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
                {dup && <p className="text-xs text-danger">Este prato está escolhido em mais do que uma foto.</p>}
                {!dup && p?.imageUrl && st === "idle" && <p className="text-xs text-amber-800">Substitui a foto atual.</p>}
                {st === "sending" && <p className="text-xs text-ink-soft">A enviar…</p>}
                {st === "ok" && <p className="text-xs text-ok">✓ Guardada</p>}
                {st !== "idle" && st !== "sending" && st !== "ok" && <p className="text-xs text-danger">{st}</p>}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <span className="text-sm">{running ? `A enviar… ${done} de ${toSend}` : duplicates ? "Corrija os pratos repetidos." : `${toSend} ${toSend === 1 ? "foto" : "fotos"} para guardar`}</span>
          <div className="flex gap-2">
            <button type="button" onClick={onCancel} disabled={running} className="min-h-11 rounded-xl px-4 text-sm text-ink-soft underline">
              {done > 0 ? "Fechar" : "Cancelar"}
            </button>
            <button
              type="button"
              onClick={save}
              disabled={running || duplicates || toSend === 0}
              className="min-h-11 rounded-xl bg-brand px-5 font-semibold text-white disabled:opacity-50"
            >
              {running ? "A enviar…" : done > 0 ? "Tentar as que falharam" : `Guardar ${toSend}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Sessão de fotos (telemóvel): para cada prato sem foto, a câmara abre; tirada a foto, guarda e
 * passa ao seguinte. "Saltar" deixa o prato para depois.
 */
function PhotoSession({ queue, onClose }: { queue: Product[]; onClose: (saved: number) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const [index, setIndex] = useState(0);
  const [saved, setSaved] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  useEffect(() => () => {
    if (last) URL.revokeObjectURL(last);
  }, [last]);

  const current = queue[index];

  async function take(file: File | undefined) {
    if (!file || !current) return;
    setSending(true);
    setError(null);
    try {
      await uploadPhoto(current.ref, file);
      setLast(URL.createObjectURL(file));
      setSaved((n) => n + 1);
      setIndex((i) => i + 1);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
      if (camera.current) camera.current.value = "";
      if (gallery.current) gallery.current.value = "";
    }
  }

  return (
    <dialog
      ref={ref}
      aria-label="Sessão de fotos"
      onClose={() => onClose(saved)}
      className="m-0 h-dvh max-h-none w-full max-w-none bg-paper p-0 text-ink backdrop:bg-ink/60 sm:m-auto sm:h-auto sm:max-w-md sm:rounded-3xl"
    >
      <div className="flex h-full flex-col gap-5 px-5 pt-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-ink-soft">
            Sessão de fotos · {saved} {saved === 1 ? "guardada" : "guardadas"}
          </p>
          <button type="button" onClick={() => ref.current?.close()} className="min-h-10 rounded-xl px-3 text-sm font-semibold underline">
            Terminar
          </button>
        </div>

        {current ? (
          <>
            <div>
              <p className="text-sm text-ink-soft">
                Prato {index + 1} de {queue.length} · {current.category}
              </p>
              <h2 className="mt-1 text-3xl tracking-tight">{current.name}</h2>
            </div>
            {last && (
              <div className="flex items-center gap-3 rounded-2xl bg-[#ecfdf3] p-2 text-sm text-ok">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={last} alt="" className="size-12 rounded-lg object-cover" />✓ Anterior guardada
              </div>
            )}
            {error && (
              <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
                {error}
              </p>
            )}
            <div className="mt-auto grid gap-3">
              {/* capture="environment": no telemóvel abre logo a câmara traseira. */}
              <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => take(e.target.files?.[0])} />
              <input ref={gallery} type="file" accept="image/*" className="hidden" onChange={(e) => take(e.target.files?.[0])} />
              <button
                type="button"
                disabled={sending}
                onClick={() => camera.current?.click()}
                className="min-h-16 rounded-2xl bg-brand text-lg font-semibold text-white disabled:opacity-50"
              >
                {sending ? "A guardar…" : "📷 Tirar foto"}
              </button>
              <div className="flex gap-3">
                <button type="button" disabled={sending} onClick={() => gallery.current?.click()} className="min-h-12 flex-1 rounded-2xl border border-line bg-card font-semibold">
                  Da galeria
                </button>
                <button
                  type="button"
                  disabled={sending}
                  onClick={() => {
                    setError(null);
                    setIndex((i) => i + 1);
                  }}
                  className="min-h-12 flex-1 rounded-2xl border border-line bg-card font-semibold"
                >
                  Saltar
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="my-auto text-center">
            <p className="text-5xl" aria-hidden="true">
              ✓
            </p>
            <h2 className="mt-3 text-2xl">Fim da lista</h2>
            <p className="mt-2 text-ink-soft">
              {saved} {saved === 1 ? "foto guardada" : "fotos guardadas"} nesta sessão.
            </p>
            <button type="button" onClick={() => ref.current?.close()} className="mt-6 min-h-12 rounded-2xl bg-brand px-6 font-semibold text-white">
              Terminar
            </button>
          </div>
        )}
      </div>
    </dialog>
  );
}
