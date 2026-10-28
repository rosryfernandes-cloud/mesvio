"use client";

import { useCallback, useEffect, useState } from "react";
import { formatEur } from "@/lib/money";
import type { OwnMenu } from "@/server/menu/own-menu";

type Category = OwnMenu["categories"][number];
type Product = Category["products"][number];
type GroupDraft = { id?: string; name: string; kind: "variant" | "extra"; maxSelect: number; modifiers: { id?: string; name: string; price: string }[] };
type ProductDraft = {
  id?: string;
  categoryId: string;
  name: string;
  description: string;
  price: string;
  vatRateBps: number;
  allergens: string[];
  tags: string;
  available: boolean;
  groups: GroupDraft[];
};

// Cópia do servidor (own-menu.ts) — o componente corre no browser.
const ALLERGENS = ["glúten", "crustáceos", "ovos", "peixe", "amendoins", "soja", "leite", "frutos de casca rija", "aipo", "mostarda", "sésamo", "sulfitos", "tremoço", "moluscos"];
const VAT = [
  { bps: 1300, label: "13% — comida e refeições" },
  { bps: 2300, label: "23% — bebidas alcoólicas, refrigerantes e outros" },
  { bps: 600, label: "6% — água, alguns bens essenciais" },
];

const input = "min-h-11 rounded-xl border border-line bg-card px-3";
const field = `${input} w-full`;
const primary = "min-h-11 rounded-xl bg-brand px-5 font-semibold text-white disabled:opacity-60";
const secondary = "min-h-10 rounded-xl border border-line bg-card px-3 text-sm";

/** Euros escritos à portuguesa ("12,50") → cêntimos; null se não for um preço. */
function toCents(v: string): number | null {
  const n = Number(v.trim().replace(/\s|€/g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}
const toEuros = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

async function post(body: unknown): Promise<{ ok: boolean; message?: string }> {
  const res = await fetch("/api/painel/carta", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  if (!res) return { ok: false, message: "Sem ligação. Tente de novo." };
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, message: data.message };
}

/** Editor da ementa própria (restaurantes sem POS): categorias, pratos, preços, IVA, alergénios e opções. */
export function MenuEditor() {
  const [menu, setMenu] = useState<OwnMenu | null | undefined>(undefined);
  const [editing, setEditing] = useState<ProductDraft | null>(null);
  const [catDraft, setCatDraft] = useState<{ id?: string; name: string; section: string } | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/painel/carta", { cache: "no-store" }).catch(() => null);
    if (res?.ok) setMenu((await res.json()).menu);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function run(body: unknown, ok: string) {
    setBusy(true);
    const r = await post(body);
    setBusy(false);
    setMessage({ text: r.ok ? ok : (r.message ?? "Não foi possível guardar."), error: !r.ok });
    if (r.ok) await load();
    return r.ok;
  }

  if (menu === undefined) return <p className="text-ink-soft">A carregar…</p>;
  if (menu === null) {
    return (
      <div className="rounded-2xl border border-line bg-card p-5">
        <h2 className="text-xl">Ementa</h2>
        <p className="mt-2 text-sm text-ink-soft">
          A ementa deste restaurante vem do POS: os pratos e preços mudam-se lá e aparecem aqui sozinhos. Se quiser gerir a ementa
          na MESVIO (sem POS, com os pedidos a sair em talão na cozinha), fale com a equipa MESVIO.
        </p>
      </div>
    );
  }

  const sections = [...new Set(menu.categories.map((c) => c.section).filter(Boolean))] as string[];

  function editProduct(p: Product, categoryId: string) {
    setEditing({
      id: p.id,
      categoryId,
      name: p.name,
      description: p.description ?? "",
      price: toEuros(p.priceCents),
      vatRateBps: p.vatRateBps,
      allergens: p.allergens,
      tags: p.tags.join(", "),
      available: p.available,
      groups: p.groups.map((g) => ({ ...g, modifiers: g.modifiers.map((m) => ({ id: m.id, name: m.name, price: toEuros(m.priceDeltaCents) })) })),
    });
  }

  async function saveProduct() {
    if (!editing) return;
    const priceCents = toCents(editing.price);
    if (priceCents === null) return setMessage({ text: "Indique o preço em euros, por exemplo 12,50.", error: true });
    const groups = [];
    for (const g of editing.groups) {
      const mods = [];
      for (const m of g.modifiers.filter((x) => x.name.trim())) {
        const c = toCents(m.price || "0");
        if (c === null) return setMessage({ text: `Preço inválido na opção "${m.name}".`, error: true });
        mods.push({ id: m.id, name: m.name, priceDeltaCents: c });
      }
      groups.push({ id: g.id, name: g.name, kind: g.kind, maxSelect: g.maxSelect, modifiers: mods });
    }
    const ok = await run(
      {
        action: "save_product",
        product: {
          id: editing.id,
          categoryId: editing.categoryId,
          name: editing.name,
          description: editing.description,
          priceCents,
          vatRateBps: editing.vatRateBps,
          allergens: editing.allergens,
          tags: editing.tags.split(",").map((t) => t.trim()).filter(Boolean),
          available: editing.available,
          groups,
        },
      },
      "Prato guardado. Os clientes já o veem na ementa.",
    );
    if (ok) setEditing(null);
  }

  const setDraft = (patch: Partial<ProductDraft>) => setEditing((d) => (d ? { ...d, ...patch } : d));
  const setGroup = (i: number, patch: Partial<GroupDraft>) => setDraft({ groups: editing!.groups.map((g, k) => (k === i ? { ...g, ...patch } : g)) });

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl">Ementa</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Pratos, preços e opções que os clientes veem ao ler o QR. As mudanças aparecem logo. Para fotos use o separador Fotos; para
            tirar um prato só por hoje use Esgotados.
          </p>
        </div>
        <button type="button" className={primary} onClick={() => setCatDraft({ name: "", section: sections[0] ?? "" })}>
          + Categoria
        </button>
      </div>

      {message && (
        <p role={message.error ? "alert" : "status"} className={`rounded-xl px-4 py-3 text-sm ${message.error ? "bg-danger-soft text-danger" : "bg-[#ecfdf3] text-ok"}`}>
          {message.text}
        </p>
      )}

      {menu.categories.length === 0 && (
        <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-ink-soft">
          A ementa está vazia. Comece por criar uma categoria (ex.: Entradas, Bebidas) e depois os pratos.
        </p>
      )}

      {menu.categories.map((c, ci) => (
        <section key={c.id} className="rounded-2xl border border-line bg-card">
          <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
            <div className="mr-auto">
              {c.section && <p className="text-xs font-semibold tracking-wide text-ink-soft uppercase">{c.section}</p>}
              <h3 className="text-lg font-semibold">{c.name}</h3>
            </div>
            <button type="button" className={secondary} disabled={busy || ci === 0} onClick={() => run({ action: "move", kind: "category", id: c.id, direction: "up" }, "Ordem atualizada.")} aria-label={`Subir ${c.name}`}>
              ↑
            </button>
            <button
              type="button"
              className={secondary}
              disabled={busy || ci === menu.categories.length - 1}
              onClick={() => run({ action: "move", kind: "category", id: c.id, direction: "down" }, "Ordem atualizada.")}
              aria-label={`Descer ${c.name}`}
            >
              ↓
            </button>
            <button type="button" className={secondary} onClick={() => setCatDraft({ id: c.id, name: c.name, section: c.section ?? "" })}>
              Renomear
            </button>
            {c.products.length === 0 && (
              <button type="button" className={`${secondary} text-danger`} disabled={busy} onClick={() => run({ action: "delete_category", id: c.id }, "Categoria apagada.")}>
                Apagar
              </button>
            )}
            <button
              type="button"
              className={secondary}
              onClick={() => setEditing({ categoryId: c.id, name: "", description: "", price: "", vatRateBps: 1300, allergens: [], tags: "", available: true, groups: [] })}
            >
              + Prato
            </button>
          </header>
          <ul className="divide-y divide-line">
            {c.products.map((p, pi) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
                <button type="button" onClick={() => editProduct(p, c.id)} className="mr-auto min-w-0 text-left">
                  <span className={`font-semibold ${p.available ? "" : "text-ink-soft line-through"}`}>{p.name}</span>
                  <span className="ml-2 tabular-nums">{formatEur(p.priceCents)}</span>
                  {p.groups.length > 0 && <span className="ml-2 text-xs text-ink-soft">com opções</span>}
                  {!p.available && <span className="ml-2 text-xs text-ink-soft">fora da ementa</span>}
                  {p.description && <span className="block truncate text-sm text-ink-soft">{p.description}</span>}
                </button>
                <button type="button" className={secondary} disabled={busy || pi === 0} onClick={() => run({ action: "move", kind: "product", id: p.id, direction: "up" }, "Ordem atualizada.")} aria-label={`Subir ${p.name}`}>
                  ↑
                </button>
                <button
                  type="button"
                  className={secondary}
                  disabled={busy || pi === c.products.length - 1}
                  onClick={() => run({ action: "move", kind: "product", id: p.id, direction: "down" }, "Ordem atualizada.")}
                  aria-label={`Descer ${p.name}`}
                >
                  ↓
                </button>
                <button type="button" className={secondary} onClick={() => editProduct(p, c.id)}>
                  Editar
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {catDraft && (
        <Modal title={catDraft.id ? "Renomear categoria" : "Nova categoria"} onClose={() => setCatDraft(null)}>
          <label className="grid gap-1 text-sm font-semibold">
            Nome
            <input className={field} value={catDraft.name} maxLength={60} onChange={(e) => setCatDraft({ ...catDraft, name: e.target.value })} placeholder="Ex.: Entradas" autoFocus />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Separador (opcional)
            <input className={field} value={catDraft.section} maxLength={40} list="menu-sections" onChange={(e) => setCatDraft({ ...catDraft, section: e.target.value })} placeholder="Ex.: Comida, Bebidas" />
            <datalist id="menu-sections">
              {sections.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <span className="font-normal text-ink-soft">Os separadores aparecem no topo da ementa (Comida / Bebidas / Bar).</span>
          </label>
          <button
            type="button"
            className={primary}
            disabled={busy || !catDraft.name.trim()}
            onClick={async () => {
              if (await run({ action: "save_category", category: catDraft }, "Categoria guardada.")) setCatDraft(null);
            }}
          >
            Guardar
          </button>
        </Modal>
      )}

      {editing && (
        <Modal title={editing.id ? "Editar prato" : "Novo prato"} onClose={() => setEditing(null)}>
          <label className="grid gap-1 text-sm font-semibold">
            Nome
            <input className={field} value={editing.name} maxLength={80} onChange={(e) => setDraft({ name: e.target.value })} autoFocus />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Descrição (opcional)
            <textarea className={`${field} min-h-20 py-2`} value={editing.description} maxLength={300} onChange={(e) => setDraft({ description: e.target.value })} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-semibold">
              Preço (€, com IVA)
              <input className={field} value={editing.price} inputMode="decimal" placeholder="12,50" onChange={(e) => setDraft({ price: e.target.value })} />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              IVA
              <select className={field} value={editing.vatRateBps} onChange={(e) => setDraft({ vatRateBps: Number(e.target.value) })}>
                {VAT.map((v) => (
                  <option key={v.bps} value={v.bps}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="grid gap-1 text-sm font-semibold">
            Categoria
            <select className={field} value={editing.categoryId} onChange={(e) => setDraft({ categoryId: e.target.value })}>
              {menu.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.section ? `${c.section} · ` : ""}
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="grid gap-2">
            <legend className="text-sm font-semibold">Alergénios</legend>
            <div className="flex flex-wrap gap-2">
              {ALLERGENS.map((a) => {
                const on = editing.allergens.includes(a);
                return (
                  <button
                    key={a}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setDraft({ allergens: on ? editing.allergens.filter((x) => x !== a) : [...editing.allergens, a] })}
                    className={`min-h-9 rounded-full border px-3 text-sm ${on ? "border-brand bg-brand text-white" : "border-line bg-card"}`}
                  >
                    {a}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <label className="grid gap-1 text-sm font-semibold">
            Etiquetas (opcional, separadas por vírgulas)
            <input className={field} value={editing.tags} onChange={(e) => setDraft({ tags: e.target.value })} placeholder="vegetariano, sem glúten, picante" />
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" className="size-5" checked={editing.available} onChange={(e) => setDraft({ available: e.target.checked })} />
            Mostrar na ementa
          </label>

          <fieldset className="grid gap-3">
            <legend className="text-sm font-semibold">Opções (ex.: ponto da carne, acompanhamento, extras)</legend>
            {editing.groups.map((g, gi) => (
              <div key={gi} className="grid gap-2 rounded-xl border border-line p-3">
                <div className="flex flex-wrap gap-2">
                  <input className={`${input} min-w-0 flex-1 basis-48`} value={g.name} placeholder="Nome (ex.: Acompanhamento)" onChange={(e) => setGroup(gi, { name: e.target.value })} />
                  <select className={input} value={g.kind} onChange={(e) => setGroup(gi, { kind: e.target.value as GroupDraft["kind"] })}>
                    <option value="variant">Escolher uma (obrigatório)</option>
                    <option value="extra">Extras (opcionais)</option>
                  </select>
                  {g.kind === "extra" && (
                    <label className="flex items-center gap-1 text-sm">
                      até
                      <input type="number" min={1} max={20} className={`${input} w-20`} value={g.maxSelect} onChange={(e) => setGroup(gi, { maxSelect: Math.max(1, Number(e.target.value) || 1) })} />
                    </label>
                  )}
                  <button type="button" className={`${secondary} text-danger`} onClick={() => setDraft({ groups: editing.groups.filter((_, k) => k !== gi) })}>
                    Tirar
                  </button>
                </div>
                {g.modifiers.map((m, mi) => (
                  <div key={mi} className="flex gap-2">
                    <input
                      className={`${input} min-w-0 flex-1`}
                      value={m.name}
                      placeholder="Escolha (ex.: Batata frita)"
                      onChange={(e) => setGroup(gi, { modifiers: g.modifiers.map((x, k) => (k === mi ? { ...x, name: e.target.value } : x)) })}
                    />
                    <input
                      className={`${input} w-28 shrink-0`}
                      value={m.price}
                      inputMode="decimal"
                      placeholder="+0,00 €"
                      aria-label="Preço extra"
                      onChange={(e) => setGroup(gi, { modifiers: g.modifiers.map((x, k) => (k === mi ? { ...x, price: e.target.value } : x)) })}
                    />
                    <button type="button" className={secondary} aria-label="Tirar escolha" onClick={() => setGroup(gi, { modifiers: g.modifiers.filter((_, k) => k !== mi) })}>
                      ×
                    </button>
                  </div>
                ))}
                <button type="button" className={`${secondary} justify-self-start`} onClick={() => setGroup(gi, { modifiers: [...g.modifiers, { name: "", price: "" }] })}>
                  + Escolha
                </button>
              </div>
            ))}
            <button
              type="button"
              className={`${secondary} justify-self-start`}
              onClick={() => setDraft({ groups: [...editing.groups, { name: "", kind: "variant", maxSelect: 1, modifiers: [{ name: "", price: "" }] }] })}
            >
              + Opção
            </button>
          </fieldset>

          <div className="flex flex-wrap gap-2">
            <button type="button" className={primary} disabled={busy || !editing.name.trim()} onClick={saveProduct}>
              Guardar prato
            </button>
            {editing.id && (
              <button
                type="button"
                className={`${secondary} min-h-11 text-danger`}
                disabled={busy}
                onClick={async () => {
                  if (!window.confirm(`Apagar "${editing.name}" da ementa? Os pedidos já feitos não mudam.`)) return;
                  if (await run({ action: "delete_product", id: editing.id }, "Prato apagado.")) setEditing(null);
                }}
              >
                Apagar prato
              </button>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="grid max-h-[90dvh] w-full max-w-2xl gap-4 overflow-y-auto rounded-t-3xl bg-paper p-5 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-xl">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Fechar" className="min-h-10 px-2 text-2xl text-ink-soft">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
