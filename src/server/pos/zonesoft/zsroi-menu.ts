import { z } from "zod";
import type { PosCatalog, PosModifierGroup } from "../types";

/**
 * Ementa enviada pela ZoneSoft (ZSROI) para o nosso `endpoint_menu` quando o restaurante carrega em
 * "Sync Menus" no ZSBMS. Formato: manual "ZSROI Generic Integration", secção Menus, e o ficheiro
 * `example_menu.txt` do portal developer.zonesoft.org.
 *
 * - `families[].subfamilies[].products` são ids de produtos (as subfamílias são as nossas categorias);
 * - `products[].price` em cêntimos com IVA; `tax_rate` em percentagem ("13");
 * - `attributes[].price_impact` em euros decimais ("2.5"); `selected_by_default` pode vir como texto.
 * O parser é tolerante (números ou texto) porque os exemplos oficiais misturam os dois.
 */

const id = z.union([z.string(), z.number()]).transform(String);
const num = z.union([z.number(), z.string()]).transform((v) => Number(v));
const bool = z.union([z.boolean(), z.string(), z.number()]).transform((v) => v === true || v === 1 || v === "1" || v === "true");

const productSchema = z.object({
  id,
  name: z.string(),
  price: num,
  tax_rate: num.optional(),
  image_url: z.string().nullish(),
  description: z.string().nullish(),
  attributes_groups: z.array(id).nullish(),
  availability: z
    .array(z.object({ enabled: bool.optional(), day_of_week: z.string().optional() }).passthrough())
    .nullish(),
});

const menuSchema = z.object({
  families: z
    .array(
      z.object({
        name: z.string(),
        subfamilies: z.array(z.object({ name: z.string(), products: z.array(id).nullish() })).nullish(),
        products: z.array(id).nullish(),
      }),
    )
    .min(1),
  products: z.array(productSchema),
  attribute_groups: z
    .array(z.object({ id, name: z.string(), min: num.optional(), max: num.optional(), attributes: z.array(id).nullish() }))
    .nullish(),
  attributes: z
    .array(
      z.object({
        id,
        name: z.string(),
        selected_by_default: bool.optional(),
        price_impact: num.optional(),
        tax_rate: num.optional(),
      }),
    )
    .nullish(),
});

export type ZsroiMenu = z.input<typeof menuSchema>;

export type ParseMenuResult = { ok: true; catalog: PosCatalog } | { ok: false; error: string };

const cents = (euros: number) => (Number.isFinite(euros) ? Math.round(euros * 100) : 0);
const vatBps = (pct: number | undefined) => (pct !== undefined && Number.isFinite(pct) ? Math.round(pct * 100) : 2300);

/** Converte a ementa ZSROI no catálogo comum dos POS. */
export function parseZsroiMenu(raw: unknown, now = new Date()): ParseMenuResult {
  const parsed = menuSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `Field validation for '${issue?.path.join(".") || "menu"}' failed: ${issue?.message ?? "invalid"}` };
  }
  const menu = parsed.data;

  // Categoria = subfamília (ou a família, quando não tem subfamílias). Separador = família.
  const categories: PosCatalog["categories"] = [];
  const categoryOfProduct = new Map<string, string>();
  for (const family of menu.families) {
    const subs = family.subfamilies?.length ? family.subfamilies : [{ name: family.name, products: family.products ?? [] }];
    for (const sub of subs) {
      // Referência estável pelo nome (a ordem das famílias pode mudar entre sincronizações).
      const ref = `zs:${family.name.trim().toLowerCase()}/${sub.name.trim().toLowerCase()}`.slice(0, 200);
      const name = subs.length === 1 && sub.name.trim().toLowerCase() === family.name.trim().toLowerCase() ? family.name : sub.name;
      categories.push({ posCategoryRef: ref, name, sortOrder: categories.length, section: family.name });
      for (const p of sub.products ?? []) if (!categoryOfProduct.has(p)) categoryOfProduct.set(p, ref);
    }
  }

  const attributes = new Map((menu.attributes ?? []).map((a) => [a.id, a]));
  const groups = new Map((menu.attribute_groups ?? []).map((g) => [g.id, g]));

  const products: PosCatalog["products"] = [];
  for (const p of menu.products) {
    const posCategoryRef = categoryOfProduct.get(p.id);
    if (!posCategoryRef) continue; // produto fora de qualquer família: a ZoneSoft não o mostra no menu
    const modifierGroups: PosModifierGroup[] = [];
    for (const gid of p.attributes_groups ?? []) {
      const g = groups.get(gid);
      if (!g) continue;
      const mods = (g.attributes ?? []).flatMap((aid) => {
        const a = attributes.get(aid);
        return a ? [{ posModifierRef: a.id, name: a.name, priceDeltaCents: cents(a.price_impact ?? 0), available: true }] : [];
      });
      if (!mods.length) continue;
      const min = Math.max(0, Math.trunc(g.min ?? 0));
      const max = Math.max(1, Math.trunc(g.max ?? mods.length));
      modifierGroups.push({
        posGroupRef: g.id,
        name: g.name,
        kind: min >= 1 && max === 1 ? "variant" : "extra",
        minSelect: min,
        maxSelect: Math.min(max, mods.length),
        modifiers: mods,
      });
    }
    // Disponível se não houver horário ou se algum dia estiver ativo (o horário fino fica para depois).
    const available = !p.availability?.length || p.availability.some((d) => d.enabled !== false);
    products.push({
      posProductRef: p.id,
      posCategoryRef,
      name: p.name,
      description: p.description ?? undefined,
      imageUrl: p.image_url ?? undefined,
      priceCents: Math.round(p.price),
      vatRateBps: vatBps(p.tax_rate),
      available,
      allergens: [],
      tags: [],
      modifierGroups,
    });
  }

  return { ok: true, catalog: { categories, products, fetchedAt: now } };
}
