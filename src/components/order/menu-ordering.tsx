"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatEur } from "@/lib/money";
import { ORDER_LIMITS, priceSelection, type SelectionResult } from "@/lib/order-pricing";
import type { MenuProductView, TableMenuView } from "@/server/menu/get-table-menu";
import { ProductCard } from "@/components/menu/product-card";
import { useCart } from "./use-cart";
import { useI18n } from "../i18n/i18n-provider";
import { apiErrorText, issueText } from "@/lib/i18n/messages";

type Props = { menu: TableMenuView; tableToken: string };

export function MenuOrdering({ menu, tableToken }: Props) {
  const router = useRouter();
  const { locale, t } = useI18n();
  const cart = useCart(tableToken);
  const [selected, setSelected] = useState<MenuProductView | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const canOrder = menu.ordering.enabled;

  const products = useMemo(() => new Map(menu.categories.flatMap((c) => c.products).map((p) => [p.ref, p])), [menu]);

  // Cada linha é revalidada contra a ementa atual (pode ter esgotado desde que foi adicionada).
  const pricedLines = cart.lines.map((line) => {
    const product = products.get(line.productRef);
    const priced: SelectionResult = product
      ? priceSelection(product, line.modifierRefs)
      : { ok: false, reason: "Já não está na ementa.", issue: { kind: "notOnMenu" } };
    return { line, product, priced };
  });
  const totalCents = pricedLines.reduce((s, { line, priced }) => s + (priced.ok ? priced.unitPriceCents * line.quantity : 0), 0);
  const itemCount = cart.lines.reduce((s, l) => s + l.quantity, 0);
  const qtyByProduct = new Map<string, number>();
  for (const l of cart.lines) qtyByProduct.set(l.productRef, (qtyByProduct.get(l.productRef) ?? 0) + l.quantity);

  // Secções da ementa (ex.: Comida / Bebidas / Bar & Cocktails) mostradas uma de cada vez, em separadores.
  // Chave estável (nome original da secção), para o separador escolhido sobreviver à mudança de língua.
  const sections = useMemo(() => [...new Set(menu.categories.flatMap((c) => (c.sectionKey ? [c.sectionKey] : [])))], [menu]);
  const sectionLabel = useMemo(
    () => new Map(menu.categories.flatMap((c) => (c.sectionKey ? [[c.sectionKey, c.section ?? c.sectionKey] as const] : []))),
    [menu],
  );
  const [activeSection, setActiveSection] = useState(sections[0]);
  const navRef = useRef<HTMLElement>(null);

  // Lembrar o separador ao voltar do ecrã do pedido (por mesa, só neste separador do browser).
  const sectionKey = `mesa-digital:secao:${tableToken}`;
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(sectionKey);
      if (saved && sections.includes(saved)) setActiveSection(saved);
    } catch {}
  }, [sectionKey, sections]);

  function chooseSection(section: string) {
    setActiveSection(section);
    try {
      sessionStorage.setItem(sectionKey, section);
    } catch {}
    // Mostrar o início da secção, com a navegação no topo do ecrã.
    const nav = navRef.current;
    if (nav && window.scrollY > nav.offsetTop) window.scrollTo({ top: nav.offsetTop });
  }

  const visible = sections.length > 0 ? menu.categories.filter((c) => c.sectionKey === activeSection) : menu.categories;
  const cartCountBySection = new Map<string, number>();
  for (const c of menu.categories) {
    if (!c.sectionKey) continue;
    const n = c.products.reduce((s, p) => s + (qtyByProduct.get(p.ref) ?? 0), 0);
    cartCountBySection.set(c.sectionKey, (cartCountBySection.get(c.sectionKey) ?? 0) + n);
  }

  return (
    <>
      <nav
        ref={navRef}
        aria-label={t.menu.nav}
        className="sticky top-0 z-10 border-y border-line bg-paper/95 backdrop-blur supports-[backdrop-filter]:bg-paper/80"
      >
        {sections.length > 0 && (
          <div role="tablist" aria-label={t.menu.sections} className="flex gap-1 px-4 pt-3">
            {sections.map((sec) => {
              const active = sec === activeSection;
              const inCart = cartCountBySection.get(sec) ?? 0;
              return (
                <button
                  key={sec}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => chooseSection(sec)}
                  className={`relative flex min-h-11 flex-1 items-center justify-center rounded-xl px-1.5 text-[13px] font-semibold whitespace-nowrap transition sm:text-sm ${
                    active ? "bg-brand text-white" : "bg-card text-ink hover:text-brand"
                  }`}
                >
                  {sectionLabel.get(sec) ?? sec}
                  {inCart > 0 && (
                    <span
                      className={`ml-1.5 rounded-full px-1.5 text-xs tabular-nums ${active ? "bg-white/25" : "bg-brand-soft text-brand"}`}
                      aria-label={t.menu.inOrder(inCart)}
                    >
                      {inCart}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
        <ul aria-label={t.menu.categories} className="flex gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none]">
          {visible.map((c) => (
            <li key={c.ref} className="shrink-0">
              <a
                href={`#cat-${c.ref}`}
                className="inline-flex min-h-9 items-center rounded-full border border-line bg-card px-3.5 text-sm font-medium hover:border-brand hover:text-brand"
              >
                {c.name}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <main className="px-4" role={sections.length > 0 ? "tabpanel" : undefined} aria-label={activeSection && sectionLabel.get(activeSection)}>
        {visible.map((c) => (
          <section key={c.ref} id={`cat-${c.ref}`} aria-labelledby={`h-${c.ref}`} className="scroll-mt-12 pt-8">
            <h2 id={`h-${c.ref}`} className="mb-3 font-[family-name:var(--font-display)] text-2xl">
              {c.name}
            </h2>
            <div className="grid gap-3">
              {c.products.map((p) => (
                <ProductCard
                  key={p.ref}
                  product={p}
                  onSelect={canOrder ? () => setSelected(p) : undefined}
                  quantityInCart={qtyByProduct.get(p.ref)}
                />
              ))}
            </div>
          </section>
        ))}
      </main>

      {canOrder && itemCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="mx-auto flex min-h-14 w-full max-w-2xl items-center justify-between rounded-2xl bg-brand px-5 font-semibold text-white shadow-lg"
          >
            <span className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-full bg-white/20 text-sm tabular-nums">
                {itemCount}
              </span>
              {t.cart.viewOrder}
            </span>
            <span className="tabular-nums">{formatEur(totalCents)}</span>
          </button>
        </div>
      )}

      {selected && (
        <ProductSheet
          product={selected}
          onClose={() => setSelected(null)}
          onAdd={(qty, mods, notes) => {
            cart.add(selected.ref, qty, mods, notes);
            setSelected(null);
          }}
        />
      )}

      {cartOpen && (
        <CartSheet
          tableLabel={menu.table.label}
          payFirst={menu.table.orderingMode === "pay_first"}
          lines={pricedLines}
          totalCents={totalCents}
          onQuantity={cart.setQuantity}
          onClose={() => setCartOpen(false)}
          onSubmit={async (notes) => {
            const res = await fetch("/api/orders", {
              method: "POST",
              headers: { "Content-Type": "application/json", "Idempotency-Key": cart.idempotencyKey },
              body: JSON.stringify({
                tableToken,
                notes: notes || undefined,
                expectedTotalCents: totalCents,
                lines: cart.lines.map(({ productRef, quantity, modifierRefs, notes }) => ({
                  productRef,
                  quantity,
                  modifierRefs,
                  notes,
                })),
              }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
              cart.clear();
              // Pagar ao pedir: o ecrã do pedido abre logo o pagamento.
              router.push(`/m/${tableToken}/pedido/${data.order.id}${data.order.status === "AWAITING_PAYMENT" ? "?pagar=1" : ""}`);
              return null;
            }
            if (data.code === "PRICE_CHANGED" || data.code === "INVALID_ITEMS") router.refresh();
            return apiErrorText(t, locale, data, t.cart.sendFailed);
          }}
        />
      )}
    </>
  );
}

/** <dialog> nativo em modo modal: foco preso, Esc fecha, acessível sem bibliotecas. */
function Sheet({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  // Sem close() na limpeza: dispararia onClose (e no StrictMode fecharia logo ao abrir).
  // Ao desmontar, o <dialog> sai do DOM e da camada de topo por si.
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={label}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-hidden rounded-t-3xl bg-paper p-0 text-ink backdrop:bg-ink/50 sm:m-auto sm:max-w-lg sm:rounded-3xl"
    >
      <div className="flex max-h-[92dvh] flex-col">{children}</div>
    </dialog>
  );
}

function Stepper({ value, onChange, min, label }: { value: number; onChange: (v: number) => void; min: number; label: string }) {
  const { t } = useI18n();
  const btn = "flex size-10 items-center justify-center rounded-full border border-line bg-card text-lg font-semibold disabled:opacity-40";
  return (
    <div className="flex items-center gap-3" role="group" aria-label={label}>
      <button type="button" className={btn} onClick={() => onChange(value - 1)} disabled={value <= min} aria-label={t.product.less}>
        −
      </button>
      <span className="w-6 text-center font-semibold tabular-nums" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        className={btn}
        onClick={() => onChange(value + 1)}
        disabled={value >= ORDER_LIMITS.maxQuantityPerLine}
        aria-label={t.product.more}
      >
        +
      </button>
    </div>
  );
}

function ProductSheet({
  product,
  onClose,
  onAdd,
}: {
  product: MenuProductView;
  onClose: () => void;
  onAdd: (quantity: number, modifierRefs: string[], notes?: string) => void;
}) {
  // Variantes de escolha única começam na primeira opção disponível.
  const [mods, setMods] = useState<string[]>(() =>
    product.modifierGroups
      .filter((g) => g.kind === "variant" && g.minSelect === 1 && g.maxSelect === 1)
      .flatMap((g) => g.modifiers.find((m) => m.available)?.posModifierRef ?? []),
  );
  const { t } = useI18n();
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState("");
  const priced = priceSelection(product, mods);

  function toggle(groupRef: string, modRef: string) {
    const group = product.modifierGroups.find((g) => g.posGroupRef === groupRef)!;
    const inGroup = new Set(group.modifiers.map((m) => m.posModifierRef));
    setMods((cur) => {
      if (group.maxSelect === 1) return [...cur.filter((r) => !inGroup.has(r)), modRef];
      if (cur.includes(modRef)) return cur.filter((r) => r !== modRef);
      if (cur.filter((r) => inGroup.has(r)).length >= group.maxSelect) return cur;
      return [...cur, modRef];
    });
  }

  return (
    <Sheet label={product.name} onClose={onClose}>
      <div className="overflow-y-auto px-5 pt-6 pb-4">
        {product.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.imageUrl} alt="" className="-mx-5 -mt-6 mb-5 aspect-[4/3] w-[calc(100%+2.5rem)] max-w-none object-cover" />
        )}
        <div className="flex items-start justify-between gap-4">
          <h2 className="font-[family-name:var(--font-display)] text-2xl leading-tight">{product.name}</h2>
          <button type="button" onClick={onClose} className="-mt-1 -mr-2 p-2 text-2xl leading-none text-ink-soft" aria-label={t.product.close}>
            ×
          </button>
        </div>
        {product.description && <p className="mt-2 text-sm text-ink-soft">{product.description}</p>}
        {product.allergens.length > 0 && (
          <p className="mt-2 text-xs text-ink-soft">
            <span className="font-medium">{t.product.allergens}</span> {product.allergens.join(", ")}
          </p>
        )}

        {product.modifierGroups.map((g) => {
          const single = g.maxSelect === 1;
          return (
            <fieldset key={g.posGroupRef} className="mt-6">
              <legend className="flex w-full items-baseline justify-between text-sm font-semibold">
                {g.name}
                <span className="text-xs font-normal text-ink-soft">
                  {g.minSelect > 0 ? t.product.required : t.product.optionalUpTo(g.maxSelect)}
                </span>
              </legend>
              <div className="mt-2 grid gap-2">
                {g.modifiers.map((m) => (
                  <label
                    key={m.posModifierRef}
                    className={`flex min-h-12 items-center gap-3 rounded-xl border bg-card px-4 ${
                      mods.includes(m.posModifierRef) ? "border-brand" : "border-line"
                    } ${m.available ? "" : "opacity-50"}`}
                  >
                    <input
                      type={single ? "radio" : "checkbox"}
                      name={g.posGroupRef}
                      checked={mods.includes(m.posModifierRef)}
                      disabled={!m.available}
                      onChange={() => toggle(g.posGroupRef, m.posModifierRef)}
                      className="size-5 accent-[var(--color-brand)]"
                    />
                    <span className="flex-1">{m.name}</span>
                    <span className="text-sm text-ink-soft tabular-nums">
                      {!m.available ? t.product.soldOut : m.priceDeltaCents > 0 ? `+${formatEur(m.priceDeltaCents)}` : ""}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          );
        })}

        <label className="mt-6 block text-sm font-semibold" htmlFor="obs-produto">
          {t.product.notes} <span className="font-normal text-ink-soft">{t.product.optional}</span>
        </label>
        <textarea
          id="obs-produto"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={ORDER_LIMITS.maxNotesLength}
          rows={2}
          placeholder={t.product.notesPlaceholder}
          className="mt-2 w-full rounded-xl border border-line bg-card px-4 py-3 text-base"
        />
      </div>

      <div className="flex items-center gap-4 border-t border-line bg-paper px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Stepper value={qty} onChange={setQty} min={1} label={t.product.quantity} />
        <button
          type="button"
          disabled={!priced.ok}
          onClick={() => onAdd(qty, mods, notes.trim() || undefined)}
          className="flex min-h-12 flex-1 items-center justify-between rounded-2xl bg-brand px-5 font-semibold text-white disabled:opacity-50"
        >
          <span>{t.product.addButton}</span>
          <span className="tabular-nums">{priced.ok ? formatEur(priced.unitPriceCents * qty) : ""}</span>
        </button>
      </div>
      {!priced.ok && <p className="px-5 pb-4 text-sm text-brand">{issueText(t, priced.issue)}</p>}
    </Sheet>
  );
}

function CartSheet({
  tableLabel,
  payFirst,
  lines,
  totalCents,
  onQuantity,
  onClose,
  onSubmit,
}: {
  payFirst: boolean;
  tableLabel: string;
  lines: {
    line: ReturnType<typeof useCart>["lines"][number];
    product?: MenuProductView;
    priced: ReturnType<typeof priceSelection>;
  }[];
  totalCents: number;
  onQuantity: (key: string, q: number) => void;
  onClose: () => void;
  onSubmit: (notes: string) => Promise<string | null>;
}) {
  const { t } = useI18n();
  const [notes, setNotes] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasInvalid = lines.some((l) => !l.priced.ok);

  useEffect(() => {
    if (lines.length === 0) onClose();
  }, [lines.length, onClose]);

  async function send() {
    setSending(true);
    setError(null);
    try {
      setError(await onSubmit(notes.trim()));
    } catch {
      setError(t.cart.offline);
    } finally {
      setSending(false);
    }
  }

  return (
    <Sheet label={t.cart.yourOrder} onClose={onClose}>
      <div className="overflow-y-auto px-5 pt-6 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-brand">{tableLabel}</p>
            <h2 className="font-[family-name:var(--font-display)] text-2xl">{t.cart.yourOrder}</h2>
          </div>
          <button type="button" onClick={onClose} className="-mt-1 -mr-2 p-2 text-2xl leading-none text-ink-soft" aria-label={t.product.close}>
            ×
          </button>
        </div>

        <ul className="mt-4 divide-y divide-line">
          {lines.map(({ line, product, priced }) => (
            <li key={line.key} className="py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{product?.name ?? t.cart.unavailableItem}</p>
                  {priced.ok && priced.modifierNames.length > 0 && (
                    <p className="text-sm text-ink-soft">{priced.modifierNames.join(" · ")}</p>
                  )}
                  {line.notes && <p className="text-sm text-ink-soft italic">“{line.notes}”</p>}
                  {!priced.ok && <p className="mt-1 text-sm font-medium text-brand">{issueText(t, priced.issue)}</p>}
                </div>
                <p className="shrink-0 font-semibold tabular-nums">
                  {priced.ok ? formatEur(priced.unitPriceCents * line.quantity) : "—"}
                </p>
              </div>
              <div className="mt-3">
                <Stepper
                  value={line.quantity}
                  onChange={(q) => onQuantity(line.key, q)}
                  min={0}
                  label={t.cart.quantityOf(product?.name ?? t.cart.unavailableItem)}
                />
              </div>
            </li>
          ))}
        </ul>

        <label className="mt-2 block text-sm font-semibold" htmlFor="obs-pedido">
          {t.cart.noteForRestaurant} <span className="font-normal text-ink-soft">{t.product.optional}</span>
        </label>
        <textarea
          id="obs-pedido"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={ORDER_LIMITS.maxNotesLength}
          rows={2}
          placeholder={t.cart.notePlaceholder}
          className="mt-2 w-full rounded-xl border border-line bg-card px-4 py-3 text-base"
        />
      </div>

      <div className="border-t border-line bg-paper px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {error && (
          <p role="alert" className="mb-3 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
            {error}
          </p>
        )}
        {hasInvalid && !error && (
          <p className="mb-3 text-sm text-brand">{t.cart.removeUnavailable}</p>
        )}
        <button
          type="button"
          onClick={send}
          disabled={sending || hasInvalid}
          className="flex min-h-14 w-full items-center justify-between rounded-2xl bg-brand px-5 font-semibold text-white disabled:opacity-50"
        >
          <span>{sending ? t.cart.sending : payFirst ? t.cart.payAndOrder : t.cart.sendToKitchen}</span>
          <span className="tabular-nums">{formatEur(totalCents)}</span>
        </button>
        <p className="mt-2 text-center text-xs text-ink-soft">
          {payFirst ? t.cart.payFirstNote : t.cart.payLaterNote}
        </p>
      </div>
    </Sheet>
  );
}
