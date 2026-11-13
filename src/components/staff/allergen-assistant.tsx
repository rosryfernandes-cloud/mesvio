"use client";

import { useState } from "react";
import type { OwnMenu } from "@/server/menu/own-menu";

// Cópia do servidor (own-menu.ts): o componente corre no navegador.
const ALLERGENS = ["glúten", "crustáceos", "ovos", "peixe", "amendoins", "soja", "leite", "frutos de casca rija", "aipo", "mostarda", "sésamo", "sulfitos", "tremoço", "moluscos"];

const primary = "min-h-11 rounded-xl bg-brand px-5 font-semibold text-white disabled:opacity-50";
const secondary = "min-h-10 rounded-xl border border-line bg-card px-3 text-sm";

type Row = { productId: string; name: string; category: string; allergens: string[]; unsure: boolean };

/**
 * Alergénios com IA: sugere os alergénios de cada prato pela receita habitual e o dono confirma
 * com a cozinha antes de guardar. A informação é da responsabilidade do restaurante.
 */
export function AllergenAssistant({ menu, onSaved }: { menu: OwnMenu; onSaved: (message: string) => Promise<void> | void }) {
  const [includeDone, setIncludeDone] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<"suggesting" | "saving" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const all = menu.categories.flatMap((c) => c.products.map((p) => ({ ...p, category: c.name })));
  const withoutAllergens = all.filter((p) => p.allergens.length === 0).length;
  if (all.length === 0) return null;

  async function suggest() {
    setBusy("suggesting");
    setError(null);
    const res = await fetch("/api/painel/carta/alergenios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onlyMissing: !includeDone }),
    }).catch(() => null);
    setBusy(null);
    const data = await res?.json().catch(() => null);
    if (!res?.ok) return setError(data?.message ?? "Não foi possível sugerir agora. Tente de novo.");
    const suggestions: { productId: string; allergens: string[]; unsure: boolean }[] = data.suggestions;
    if (suggestions.length === 0) return setError("Todos os pratos já têm alergénios. Marque a opção abaixo para os rever.");
    const byId = new Map(all.map((p) => [p.id, p]));
    setRows(
      suggestions.flatMap((s) => {
        const p = byId.get(s.productId);
        return p ? [{ productId: p.id, name: p.name, category: p.category, allergens: s.allergens, unsure: s.unsure }] : [];
      }),
    );
    setConfirmed(false);
    if (data.missing) setError(`Ficaram ${data.missing} pratos sem sugestão. Pode repetir depois de guardar estes.`);
  }

  function toggle(productId: string, allergen: string) {
    setRows((r) =>
      r!.map((row) =>
        row.productId === productId
          ? { ...row, allergens: row.allergens.includes(allergen) ? row.allergens.filter((a) => a !== allergen) : [...row.allergens, allergen] }
          : row,
      ),
    );
  }

  async function save() {
    if (!rows) return;
    setBusy("saving");
    setError(null);
    const res = await fetch("/api/painel/carta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save_allergens", products: rows.map((r) => ({ id: r.productId, allergens: r.allergens })) }),
    }).catch(() => null);
    setBusy(null);
    const data = await res?.json().catch(() => null);
    if (!res?.ok) return setError(data?.message ?? "Não foi possível guardar. Tente de novo.");
    setRows(null);
    await onSaved(`Alergénios guardados em ${data.saved} ${data.saved === 1 ? "prato" : "pratos"}. Os clientes já os veem na ementa.`);
  }

  return (
    <section aria-labelledby="alergenios-ia" className="rounded-2xl border border-line bg-card p-4">
      <h3 id="alergenios-ia" className="text-lg font-semibold">
        Alergénios com IA
      </h3>
      <p className="mt-1 text-sm text-ink-soft">
        A MESVIO sugere os alergénios de cada prato pela receita habitual. Confirme sempre com a cozinha antes de guardar: a
        informação dada aos clientes é da responsabilidade do restaurante.
      </p>

      {!rows && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" className={primary} onClick={suggest} disabled={busy !== null || (!includeDone && withoutAllergens === 0)}>
            {busy === "suggesting" ? "A analisar os pratos…" : includeDone ? `Sugerir para os ${all.length} pratos` : `Sugerir para ${withoutAllergens} ${withoutAllergens === 1 ? "prato" : "pratos"} sem alergénios`}
          </button>
          <label className="flex min-h-10 items-center gap-2 text-sm">
            <input type="checkbox" checked={includeDone} onChange={(e) => setIncludeDone(e.target.checked)} className="size-4 accent-[var(--color-brand)]" />
            Rever também os que já têm alergénios
          </label>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      {rows && (
        <div className="mt-4 grid gap-3">
          <p className="text-sm">
            Toque num alergénio para o tirar ou acrescentar. Os pratos marcados com <span className="font-semibold text-danger">Confirmar</span> têm
            receitas que variam muito.
          </p>
          <ul className="grid gap-2">
            {rows.map((r) => (
              <li key={r.productId} className="rounded-xl border border-line bg-paper p-3">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{r.name}</span>
                  <span className="text-xs text-ink-soft">{r.category}</span>
                  {r.unsure && <span className="rounded-full bg-danger-soft px-2 py-0.5 text-xs font-semibold text-danger">Confirmar</span>}
                  {r.allergens.length === 0 && <span className="text-xs text-ink-soft">Sem alergénios</span>}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {ALLERGENS.map((a) => {
                    const on = r.allergens.includes(a);
                    return (
                      <button
                        key={a}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggle(r.productId, a)}
                        className={`min-h-8 rounded-full border px-2.5 text-xs ${on ? "border-brand bg-brand text-white" : "border-line bg-card text-ink-soft"}`}
                      >
                        {a}
                      </button>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 size-4 accent-[var(--color-brand)]" />
            Confirmei estes alergénios com a cozinha.
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={primary} onClick={save} disabled={!confirmed || busy !== null}>
              {busy === "saving" ? "A guardar…" : `Guardar alergénios (${rows.length})`}
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
