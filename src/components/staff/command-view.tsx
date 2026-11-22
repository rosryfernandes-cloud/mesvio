"use client";

import { useEffect, useMemo, useState } from "react";
import { formatEur } from "@/lib/money";

/**
 * Comandeira digital: o empregado escolhe a mesa, toca nos pratos (com as opções obrigatórias) e
 * envia. O pedido entra como os do QR: talão na cozinha e no bar, e soma à conta da mesa.
 */

type Modifier = { posModifierRef: string; name: string; priceDeltaCents: number; available: boolean };
type Group = { posGroupRef: string; name: string; minSelect: number; maxSelect: number; modifiers: Modifier[] };
type Product = { ref: string; name: string; priceCents: number; available: boolean; modifierGroups: Group[] };
type Category = { ref: string; name: string; products: Product[] };
type Table = { id: string; label: string; zone: string | null };
type Line = { key: string; product: Product; quantity: number; modifierRefs: string[]; notes: string };

const unitPrice = (p: Product, mods: string[]) =>
  p.priceCents + p.modifierGroups.flatMap((g) => g.modifiers).filter((m) => mods.includes(m.posModifierRef)).reduce((t, m) => t + m.priceDeltaCents, 0);

export function CommandView() {
  const [tables, setTables] = useState<Table[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [canOrder, setCanOrder] = useState(true);
  const [reason, setReason] = useState<string | null>(null);
  const [table, setTable] = useState<Table | null>(null);
  const [cat, setCat] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [picking, setPicking] = useState<{ product: Product; mods: string[] } | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/painel/comandas", { cache: "no-store" }).catch(() => null);
      const d = res ? await res.json().catch(() => ({})) : {};
      if (!res?.ok) return setMessage({ text: d.message ?? "Não foi possível abrir a comandeira.", error: true });
      setTables(d.tables);
      setCategories(d.categories);
      setCanOrder(d.canOrder);
      setReason(d.reason);
      setCat(d.categories[0]?.ref ?? null);
      setLoaded(true);
    })();
  }, []);

  const total = useMemo(() => lines.reduce((t, l) => t + unitPrice(l.product, l.modifierRefs) * l.quantity, 0), [lines]);

  function add(product: Product, mods: string[]) {
    setLines((ls) => {
      const same = ls.find((l) => l.product.ref === product.ref && l.modifierRefs.join() === mods.join() && !l.notes);
      if (same) return ls.map((l) => (l === same ? { ...l, quantity: l.quantity + 1 } : l));
      return [...ls, { key: `${product.ref}-${Date.now()}`, product, quantity: 1, modifierRefs: mods, notes: "" }];
    });
  }

  function tap(p: Product) {
    if (!p.available) return;
    const required = p.modifierGroups.filter((g) => g.minSelect > 0);
    if (required.length === 0) return add(p, []);
    // Opções obrigatórias (ex.: ponto da carne, tamanho): começa na primeira disponível de cada grupo.
    setPicking({ product: p, mods: required.flatMap((g) => g.modifiers.find((m) => m.available)?.posModifierRef ?? []) });
  }

  async function send() {
    if (!table || lines.length === 0) return;
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/painel/comandas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tableId: table.id,
        idempotencyKey: crypto.randomUUID(),
        notes: notes.trim() || undefined,
        lines: lines.map((l) => ({ productRef: l.product.ref, quantity: l.quantity, modifierRefs: l.modifierRefs, notes: l.notes.trim() || undefined })),
      }),
    }).catch(() => null);
    setBusy(false);
    const d = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) return setMessage({ text: d.message ?? "Não foi possível enviar o pedido.", error: true });
    setMessage({ text: `Pedido #${d.order.shortCode} enviado para a cozinha (${table.label}, ${formatEur(total)}).`, error: false });
    setLines([]);
    setNotes("");
    setTable(null);
  }

  if (!loaded) return <p className={message?.error ? "text-danger" : "text-ink-soft"}>{message?.text ?? "A abrir a comandeira…"}</p>;
  if (!canOrder) return <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm">{reason ?? "Este restaurante não recebe pedidos."} A comandeira precisa do plano com pedidos.</p>;

  const current = categories.find((c) => c.ref === cat);

  return (
    <div className="grid gap-4">
      {message && (
        <p role={message.error ? "alert" : "status"} className={`rounded-xl px-4 py-3 text-sm ${message.error ? "bg-red-50 text-red-800" : "bg-[#ecfdf3] text-ok"}`}>
          {message.text}
        </p>
      )}

      {!table ? (
        <section className="grid gap-2">
          <h2 className="text-xl">Para que mesa é o pedido?</h2>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {tables.map((t) => (
              <li key={t.id}>
                <button type="button" onClick={() => setTable(t)} className="flex min-h-16 w-full flex-col items-center justify-center rounded-2xl border-2 border-line bg-card font-semibold active:border-brand">
                  {t.label}
                  {t.zone && <span className="text-xs font-normal text-ink-soft">{t.zone}</span>}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xl">Pedido · {table.label}</h2>
            <button type="button" className="text-sm underline" onClick={() => setTable(null)}>
              Trocar de mesa
            </button>
          </div>
          <nav className="flex gap-1 overflow-x-auto [scrollbar-width:none]" aria-label="Categorias">
            {categories.map((c) => (
              <button
                key={c.ref}
                type="button"
                onClick={() => setCat(c.ref)}
                className={`min-h-10 shrink-0 rounded-full border px-3 text-sm font-semibold ${c.ref === cat ? "border-brand bg-brand text-white" : "border-line bg-card"}`}
              >
                {c.name}
              </button>
            ))}
          </nav>
          <ul className="grid gap-2 sm:grid-cols-2">
            {current?.products.map((p) => {
              const inCart = lines.filter((l) => l.product.ref === p.ref).reduce((t, l) => t + l.quantity, 0);
              return (
                <li key={p.ref}>
                  <button
                    type="button"
                    disabled={!p.available}
                    onClick={() => tap(p)}
                    className="flex min-h-14 w-full items-center justify-between gap-2 rounded-2xl border border-line bg-card px-3 py-2 text-left disabled:opacity-40"
                  >
                    <span>
                      <span className="font-semibold">{p.name}</span>
                      {!p.available && <span className="ml-2 text-xs">esgotado</span>}
                    </span>
                    <span className="flex items-center gap-2 tabular-nums">
                      {inCart > 0 && <span className="grid size-6 place-items-center rounded-full bg-brand text-xs text-white">{inCart}</span>}
                      {formatEur(p.priceCents)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <section className="grid gap-2 rounded-2xl border border-line bg-paper p-3">
            <h3 className="font-semibold">Pedido</h3>
            {lines.length === 0 && <p className="text-sm text-ink-soft">Toque nos pratos para os acrescentar.</p>}
            {lines.map((l) => {
              const modNames = l.product.modifierGroups.flatMap((g) => g.modifiers).filter((m) => l.modifierRefs.includes(m.posModifierRef)).map((m) => m.name);
              return (
                <div key={l.key} className="grid gap-1 border-b border-line/60 pb-2">
                  <div className="flex items-center gap-2">
                    <button type="button" className="size-8 rounded-full border border-line" aria-label="Menos" onClick={() => setLines((ls) => ls.flatMap((x) => (x === l ? (x.quantity > 1 ? [{ ...x, quantity: x.quantity - 1 }] : []) : [x])))}>
                      −
                    </button>
                    <span className="w-6 text-center font-semibold tabular-nums">{l.quantity}</span>
                    <button type="button" className="size-8 rounded-full border border-line" aria-label="Mais" onClick={() => setLines((ls) => ls.map((x) => (x === l ? { ...x, quantity: x.quantity + 1 } : x)))}>
                      +
                    </button>
                    <span className="flex-1">
                      {l.product.name}
                      {modNames.length > 0 && <span className="text-sm text-ink-soft"> · {modNames.join(", ")}</span>}
                    </span>
                    <span className="tabular-nums">{formatEur(unitPrice(l.product, l.modifierRefs) * l.quantity)}</span>
                  </div>
                  <input
                    value={l.notes}
                    onChange={(e) => setLines((ls) => ls.map((x) => (x === l ? { ...x, notes: e.target.value } : x)))}
                    placeholder="Nota (ex.: sem cebola)"
                    maxLength={200}
                    className="min-h-9 rounded-lg border border-line bg-card px-2 text-sm"
                  />
                </div>
              );
            })}
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Nota para o pedido todo (opcional)" maxLength={200} className="min-h-10 rounded-lg border border-line bg-card px-2 text-sm" />
            <button type="button" disabled={busy || lines.length === 0} onClick={() => void send()} className="min-h-12 rounded-xl bg-brand font-semibold text-white disabled:opacity-50">
              {busy ? "A enviar…" : `Enviar para a cozinha · ${formatEur(total)}`}
            </button>
          </section>
        </>
      )}

      {picking && (
        <div role="dialog" aria-label={`Opções de ${picking.product.name}`} className="fixed inset-0 z-50 grid place-items-center bg-ink/60 p-4" onClick={() => setPicking(null)}>
          <div className="grid w-full max-w-sm gap-3 rounded-3xl bg-card p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold">{picking.product.name}</h3>
            {picking.product.modifierGroups
              .filter((g) => g.minSelect > 0)
              .map((g) => (
                <fieldset key={g.posGroupRef} className="grid gap-1">
                  <legend className="text-sm font-semibold">{g.name}</legend>
                  {g.modifiers.map((m) => {
                    const chosen = picking.mods.includes(m.posModifierRef);
                    return (
                      <button
                        key={m.posModifierRef}
                        type="button"
                        disabled={!m.available}
                        onClick={() =>
                          setPicking((pk) => pk && { ...pk, mods: [...pk.mods.filter((r) => !g.modifiers.some((x) => x.posModifierRef === r)), m.posModifierRef] })
                        }
                        className={`flex min-h-11 items-center justify-between rounded-xl border px-3 text-left disabled:opacity-40 ${chosen ? "border-brand bg-brand-soft/50 font-semibold" : "border-line"}`}
                      >
                        {m.name}
                        {m.priceDeltaCents > 0 && <span className="text-sm">+{formatEur(m.priceDeltaCents)}</span>}
                      </button>
                    );
                  })}
                </fieldset>
              ))}
            <button
              type="button"
              className="min-h-12 rounded-xl bg-brand font-semibold text-white"
              onClick={() => {
                add(picking.product, picking.mods);
                setPicking(null);
              }}
            >
              Acrescentar · {formatEur(unitPrice(picking.product, picking.mods))}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
