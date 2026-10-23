import { formatEur } from "@/lib/money";
import type { MenuProductView } from "@/server/menu/get-table-menu";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

export function ProductCard({
  product,
  onSelect,
  quantityInCart = 0,
}: {
  product: MenuProductView;
  /** Quando presente, o cartão inteiro abre o detalhe para adicionar ao pedido. */
  onSelect?: () => void;
  quantityInCart?: number;
}) {
  const hasOptions = product.modifierGroups.length > 0;
  const fromPrice = product.modifierGroups.some((g) => g.kind === "variant" && g.modifiers.some((m) => m.priceDeltaCents > 0));

  return (
    <article
      aria-labelledby={`p-${product.ref}`}
      className={`relative flex gap-4 rounded-2xl border bg-card p-4 shadow-[0_1px_2px_rgba(28,25,23,0.04)] ${
        quantityInCart > 0 ? "border-brand" : "border-line"
      } ${product.available ? "" : "opacity-60"} ${onSelect && product.available ? "transition hover:border-brand" : ""}`}
    >
      {onSelect && product.available && (
        <button
          type="button"
          onClick={onSelect}
          className="absolute inset-0 z-[1] rounded-2xl"
          aria-label={`Adicionar ${product.name}`}
        />
      )}
      {quantityInCart > 0 && (
        <span className="absolute -top-2 -right-2 z-[2] flex size-7 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white tabular-nums">
          {quantityInCart}
          <span className="sr-only"> no pedido</span>
        </span>
      )}
      <div className="min-w-0 flex-1">
        <h3 id={`p-${product.ref}`} className="text-base leading-snug font-semibold">
          {product.name}
        </h3>
        {product.description && <p className="mt-1 line-clamp-2 text-sm text-ink-soft">{product.description}</p>}

        <div className="mt-2 flex flex-wrap gap-1.5">
          {product.tags.map((t) => (
            <span key={t} className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand">
              {t}
            </span>
          ))}
          {hasOptions && (
            <span className="rounded-full border border-line px-2 py-0.5 text-xs text-ink-soft">com opções</span>
          )}
        </div>

        {product.allergens.length > 0 && (
          <p className="mt-2 text-xs text-ink-soft">
            <span className="font-medium">Alergénios:</span> {product.allergens.join(", ")}
          </p>
        )}

        <p className="mt-3 flex items-baseline gap-2">
          <span className="text-base font-semibold tabular-nums">
            {fromPrice && <span className="text-xs font-normal text-ink-soft">desde </span>}
            {formatEur(product.priceCents)}
          </span>
          {!product.available && (
            <span className="rounded-md bg-ink px-1.5 py-0.5 text-xs font-medium text-paper">Esgotado</span>
          )}
        </p>
      </div>

      <div
        aria-hidden="true"
        className="flex size-20 shrink-0 items-center justify-center self-start rounded-xl bg-gradient-to-br from-brand-soft to-[#f5e6d3] font-[family-name:var(--font-display)] text-2xl text-brand"
      >
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.imageUrl} alt="" className="size-full rounded-xl object-cover" loading="lazy" />
        ) : (
          initials(product.name)
        )}
      </div>
    </article>
  );
}
