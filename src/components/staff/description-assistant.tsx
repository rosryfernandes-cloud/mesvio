"use client";

import { useState } from "react";
import type { OwnMenu } from "@/server/menu/own-menu";

const primary = "min-h-11 rounded-xl bg-brand px-5 font-semibold text-white disabled:opacity-50";
const secondary = "min-h-10 rounded-xl border border-line bg-card px-3 text-sm";

type Row = { productId: string; name: string; category: string; description: string; use: boolean };

/** Descrições com IA: propõe uma frase para cada prato sem descrição; o dono edita, escolhe e guarda. */
export function DescriptionAssistant({ menu, onSaved }: { menu: OwnMenu; onSaved: (message: string) => Promise<void> | void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<"suggesting" | "saving" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const all = menu.categories.flatMap((c) => c.products.map((p) => ({ ...p, category: c.name })));
  const missing = all.filter((p) => !p.description).length;
  if (all.length === 0) return null;

  async function suggest() {
    setBusy("suggesting");
    setError(null);
    const res = await fetch("/api/painel/carta/descricoes", { method: "POST" }).catch(() => null);
    setBusy(null);
    const data = await res?.json().catch(() => null);
    if (!res?.ok) return setError(data?.message ?? "Não foi possível sugerir agora. Tente de novo.");
    const suggestions: { productId: string; description: string }[] = data.suggestions;
    if (suggestions.length === 0) return setError("Não há pratos que precisem de descrição (bebidas e marcas ficam sem).");
    const byId = new Map(all.map((p) => [p.id, p]));
    setRows(
      suggestions.flatMap((s) => {
        const p = byId.get(s.productId);
        return p ? [{ productId: p.id, name: p.name, category: p.category, description: s.description, use: true }] : [];
      }),
    );
  }

  const edit = (productId: string, patch: Partial<Row>) => setRows((r) => r!.map((row) => (row.productId === productId ? { ...row, ...patch } : row)));
  const chosen = rows?.filter((r) => r.use && r.description.trim()) ?? [];

  async function save() {
    if (chosen.length === 0) return;
    setBusy("saving");
    setError(null);
    const res = await fetch("/api/painel/carta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save_descriptions", products: chosen.map((r) => ({ id: r.productId, description: r.description.trim() })) }),
    }).catch(() => null);
    setBusy(null);
    const data = await res?.json().catch(() => null);
    if (!res?.ok) return setError(data?.message ?? "Não foi possível guardar. Tente de novo.");
    setRows(null);
    await onSaved(`Descrições guardadas em ${data.saved} ${data.saved === 1 ? "prato" : "pratos"}. Traduza-as no separador Línguas.`);
  }

  return (
    <section aria-labelledby="descricoes-ia" className="rounded-2xl border border-line bg-card p-4">
      <h3 id="descricoes-ia" className="text-lg font-semibold">
        Descrições com IA
      </h3>
      <p className="mt-1 text-sm text-ink-soft">Uma frase curta para cada prato, a dizer o que leva. Ementas com descrição vendem mais. Reveja antes de guardar.</p>

      {!rows && (
        <div className="mt-3">
          <button type="button" className={primary} onClick={suggest} disabled={busy !== null || missing === 0}>
            {busy === "suggesting" ? "A escrever…" : missing === 0 ? "Todos os pratos têm descrição" : `Escrever para ${missing} ${missing === 1 ? "prato" : "pratos"} sem descrição`}
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      {rows && (
        <div className="mt-4 grid gap-3">
          <ul className="grid gap-2">
            {rows.map((r) => (
              <li key={r.productId} className={`rounded-xl border bg-paper p-3 ${r.use ? "border-line" : "border-dashed opacity-60"}`}>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={r.use} onChange={(e) => edit(r.productId, { use: e.target.checked })} className="size-4 accent-[var(--color-brand)]" />
                  <span className="font-semibold">{r.name}</span>
                  <span className="text-xs text-ink-soft">{r.category}</span>
                </label>
                <textarea
                  value={r.description}
                  onChange={(e) => edit(r.productId, { description: e.target.value })}
                  maxLength={300}
                  rows={2}
                  aria-label={`Descrição de ${r.name}`}
                  className="mt-2 w-full rounded-xl border border-line bg-card px-3 py-2 text-sm"
                />
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={primary} onClick={save} disabled={chosen.length === 0 || busy !== null}>
              {busy === "saving" ? "A guardar…" : `Guardar ${chosen.length} ${chosen.length === 1 ? "descrição" : "descrições"}`}
            </button>
            <button type="button" className={secondary} onClick={() => setRows(null)} disabled={busy !== null}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
