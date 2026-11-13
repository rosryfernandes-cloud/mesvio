"use client";

import { useState } from "react";
import { toCents, toEuros, VAT_OPTIONS } from "@/lib/menu-form";
import type { MenuDraft } from "@/server/menu/menu-import";

// Cópias do servidor (menu-import.ts): o componente corre no navegador.
const MAX_PHOTOS = 8;
const MAX_TOTAL_BYTES = 3.8 * 1024 * 1024;
const MAX_SIDE = 1568;

type ItemDraft = { name: string; description: string; price: string; vatRateBps: number; unsure: boolean };
type CategoryDraft = { name: string; section: string | null; items: ItemDraft[] };

const input = "min-h-11 rounded-xl border border-line bg-card px-3";
const primary = "min-h-11 rounded-xl bg-brand px-5 font-semibold text-white disabled:opacity-60";
const secondary = "min-h-10 rounded-xl border border-line bg-card px-3 text-sm";

/** Reduz a foto no telemóvel; redesenhar num canvas também apaga os metadados, incluindo o GPS. */
async function preparePhoto(file: File, maxBytes: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.85, 0.7, 0.55, 0.4]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= maxBytes) return blob;
  }
  throw new Error("foto demasiado grande");
}

const toEditable = (draft: MenuDraft): CategoryDraft[] =>
  draft.categories.map((c) => ({
    name: c.name,
    section: c.section,
    items: c.products.map((p) => ({
      name: p.name,
      description: p.description ?? "",
      price: p.priceCents === null ? "" : toEuros(p.priceCents),
      vatRateBps: p.vatRateBps,
      unsure: p.unsure,
    })),
  }));

/** Passa uma ementa em papel para a ementa digital: fotos, leitura com IA, revisão e confirmação. */
export function MenuImport({ onImported }: { onImported: (message: string) => Promise<void> | void }) {
  const [photos, setPhotos] = useState<File[]>([]);
  const [draft, setDraft] = useState<CategoryDraft[] | null>(null);
  const [busy, setBusy] = useState<"reading" | "saving" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function addPhotos(files: FileList | null) {
    setError(null);
    const next = [...photos, ...Array.from(files ?? [])];
    if (next.length > MAX_PHOTOS) setError(`Pode enviar até ${MAX_PHOTOS} fotos de cada vez. Repita para as restantes páginas.`);
    setPhotos(next.slice(0, MAX_PHOTOS));
  }

  async function read() {
    setBusy("reading");
    setError(null);
    try {
      const form = new FormData();
      for (const photo of photos) form.append("photos", await preparePhoto(photo, MAX_TOTAL_BYTES / photos.length), "pagina.jpg");
      const res = await fetch("/api/painel/carta/importar", { method: "POST", body: form }).catch(() => null);
      if (!res) return setError("Sem ligação. Tente de novo.");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setError(data.message ?? "Não foi possível ler a ementa.");
      setDraft(toEditable(data.draft));
    } catch {
      setError("Não foi possível abrir uma destas fotos. Tire-a de novo ou use outro formato.");
    } finally {
      setBusy(null);
    }
  }

  const setCategory = (ci: number, patch: Partial<CategoryDraft>) => setDraft((d) => d && d.map((c, k) => (k === ci ? { ...c, ...patch } : c)));
  const setItem = (ci: number, ii: number, patch: Partial<ItemDraft>) =>
    setDraft((d) => d && d.map((c, k) => (k === ci ? { ...c, items: c.items.map((it, j) => (j === ii ? { ...it, ...patch } : it)) } : c)));
  const removeItem = (ci: number, ii: number) =>
    setDraft((d) => d && d.map((c, k) => (k === ci ? { ...c, items: c.items.filter((_, j) => j !== ii) } : c)).filter((c) => c.items.length > 0));

  async function confirm() {
    if (!draft) return;
    setError(null);
    const categories = [];
    for (const c of draft) {
      if (!c.name.trim()) return setError("Dê um nome a todas as categorias.");
      const products = [];
      for (const it of c.items) {
        const priceCents = toCents(it.price);
        if (!it.name.trim()) return setError(`Falta o nome de um prato em "${c.name}".`);
        if (priceCents === null) return setError(`Falta o preço de "${it.name}". Preencha-o ou retire o prato.`);
        products.push({ name: it.name, description: it.description, priceCents, vatRateBps: it.vatRateBps });
      }
      categories.push({ name: c.name, section: c.section ?? "", products });
    }
    setBusy("saving");
    const res = await fetch("/api/painel/carta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "import_menu", menu: { categories } }),
    }).catch(() => null);
    setBusy(null);
    if (!res) return setError("Sem ligação. Os pratos não foram guardados: tente de novo.");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(data.message ?? "Não foi possível guardar.");
    setDraft(null);
    setPhotos([]);
    const repeated = data.skipped > 0 ? ` ${data.skipped} já existiam e ficaram como estavam.` : "";
    await onImported(`Ementa importada: ${data.products} pratos novos.${repeated} Faltam os alergénios: preencha-os em cada prato.`);
  }

  const alert = error && (
    <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
      {error}
    </p>
  );

  if (draft) {
    const total = draft.reduce((n, c) => n + c.items.length, 0);
    const toCheck = draft.reduce((n, c) => n + c.items.filter((it) => it.unsure || !it.price.trim()).length, 0);
    return (
      <section className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 rounded-2xl border border-brand bg-card p-4">
        <div>
          <h3 className="text-lg font-semibold">Confirme a ementa</h3>
          <p className="mt-1 text-sm text-ink-soft">
            Ainda não foi guardado nada. Encontrámos {total} pratos{toCheck > 0 ? `, e ${toCheck} ${toCheck === 1 ? "precisa" : "precisam"} da sua atenção` : ""}. Compare os nomes e os preços com a
            ementa em papel. Depois de confirmar, os clientes passam a vê-los.
          </p>
          <p className="mt-2 text-sm font-semibold">Os alergénios não são importados: tem de os preencher em cada prato. Confirme também o IVA sugerido.</p>
        </div>
        {draft.map((c, ci) => (
          <div key={ci} className="grid grid-cols-[minmax(0,1fr)] gap-2 border-t border-line pt-3">
            <label className="grid gap-1 text-sm font-semibold">
              Categoria
              <input className={`${input} w-full`} value={c.name} maxLength={60} onChange={(e) => setCategory(ci, { name: e.target.value })} />
            </label>
            {c.items.map((it, ii) => (
              <div key={ii} className={`grid grid-cols-[minmax(0,1fr)] gap-2 rounded-xl border p-3 ${it.unsure || !it.price.trim() ? "border-[#d9a441] bg-[#fdf6e3]" : "border-line"}`}>
                {(it.unsure || !it.price.trim()) && <p className="text-xs font-semibold">Confirme este prato: pode não ter sido bem lido.</p>}
                <input aria-label="Nome do prato" className={`${input} w-full`} value={it.name} maxLength={80} onChange={(e) => setItem(ci, ii, { name: e.target.value })} />
                <input aria-label="Descrição" placeholder="Descrição (opcional)" className={`${input} w-full text-sm`} value={it.description} maxLength={300} onChange={(e) => setItem(ci, ii, { description: e.target.value })} />
                <div className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-[8rem_minmax(0,1fr)_auto]">
                  <input aria-label={`Preço de ${it.name}`} className={`${input} w-full`} value={it.price} inputMode="decimal" placeholder="12,50 €" onChange={(e) => setItem(ci, ii, { price: e.target.value })} />
                  <select aria-label={`IVA de ${it.name}`} className={`${input} w-full`} value={it.vatRateBps} onChange={(e) => setItem(ci, ii, { vatRateBps: Number(e.target.value) })}>
                    {VAT_OPTIONS.map((v) => (
                      <option key={v.bps} value={v.bps}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                  <button type="button" className={secondary} onClick={() => removeItem(ci, ii)}>
                    Retirar
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}
        {alert}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={primary} disabled={busy !== null || total === 0} onClick={confirm}>
            {busy === "saving" ? "A guardar…" : `Confirmar ${total} pratos`}
          </button>
          <button type="button" className={secondary} disabled={busy !== null} onClick={() => setDraft(null)}>
            Cancelar
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 rounded-2xl border border-line bg-card p-4">
      <div>
        <h3 className="text-lg font-semibold">Importar a ementa em papel</h3>
        <p className="mt-1 text-sm text-ink-soft">
          Tire uma foto a cada página, de frente e com boa luz. A MESVIO lê os pratos e os preços, e confirma consigo antes de guardar. Pode demorar até um minuto.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className={`${secondary} flex cursor-pointer items-center font-semibold`}>
          {photos.length ? "Juntar mais fotos" : "Escolher fotos"}
          <input
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={(e) => {
              addPhotos(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        {photos.length > 0 && (
          <>
            <span className="text-sm text-ink-soft">{photos.length === 1 ? "1 foto" : `${photos.length} fotos`}</span>
            <button type="button" className={secondary} disabled={busy !== null} onClick={() => setPhotos([])}>
              Limpar
            </button>
            <button type="button" className={primary} disabled={busy !== null} onClick={read}>
              {busy === "reading" ? "A ler a ementa…" : "Ler ementa"}
            </button>
          </>
        )}
      </div>
      {alert}
    </section>
  );
}
