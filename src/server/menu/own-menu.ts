import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, eq, inArray, notInArray } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/server/db/client";
import { auditLogs, categories, modifierGroups, modifiers, posIntegrations, productModifierGroups, products } from "@/server/db/schema";
import { withTenant } from "@/server/db/tenant";
import type { PosCatalog } from "@/server/pos/types";
import type { StaffContext } from "@/server/staff/context";

/**
 * Ementa própria (restaurantes "sem POS"): categorias, pratos, preços, IVA, alergénios e opções,
 * editados no painel. As referências (C-…, P-…, G-…, M-…) são estáveis: fotos, traduções e
 * esgotados ficam presos a elas, e os pedidos guardam uma cópia do nome e do preço.
 */
type Scope = Pick<StaffContext, "userId" | "organizationId" | "establishmentId">;
const tenantOf = (s: Scope) => ({ organizationId: s.organizationId, userId: s.userId });

export const newRef = (prefix: "C" | "P" | "G" | "M") => `${prefix}-${randomBytes(5).toString("base64url").toUpperCase()}`;

/** Os 14 alergénios de declaração obrigatória (Regulamento (UE) 1169/2011). */
export const ALLERGENS = [
  "glúten",
  "crustáceos",
  "ovos",
  "peixe",
  "amendoins",
  "soja",
  "leite",
  "frutos de casca rija",
  "aipo",
  "mostarda",
  "sésamo",
  "sulfitos",
  "tremoço",
  "moluscos",
] as const;
/** Taxas de IVA em Portugal continental (pontos base). */
export const VAT_RATES = [600, 1300, 2300] as const;

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null);

export const categoryInputSchema = z.object({
  id: z.uuid().optional(),
  name: text(60),
  section: optionalText(40),
});

const modifierInput = z.object({ id: z.uuid().optional(), name: text(60), priceDeltaCents: z.int().min(0).max(100_00) });
const groupInput = z
  .object({
    id: z.uuid().optional(),
    name: text(60),
    /** "variant": escolher exatamente uma (ex.: ponto da carne); "extra": opcionais (ex.: extras). */
    kind: z.enum(["variant", "extra"]),
    maxSelect: z.int().min(1).max(20).default(1),
    modifiers: z.array(modifierInput).min(1).max(30),
  })
  .transform((g) => ({ ...g, minSelect: g.kind === "variant" ? 1 : 0, maxSelect: g.kind === "variant" ? 1 : Math.min(g.maxSelect, g.modifiers.length) }));

export const productInputSchema = z.object({
  id: z.uuid().optional(),
  categoryId: z.uuid(),
  name: text(80),
  description: optionalText(300),
  priceCents: z.int().min(0).max(1000_00),
  vatRateBps: z.union(VAT_RATES.map((v) => z.literal(v)) as unknown as [z.ZodLiteral<600>, z.ZodLiteral<1300>, z.ZodLiteral<2300>]),
  allergens: z.array(z.enum(ALLERGENS)).max(14).default([]),
  tags: z.array(text(20)).max(5).default([]),
  available: z.boolean().default(true),
  groups: z.array(groupInput).max(8).default([]),
});

export type OwnMenu = {
  categories: {
    id: string;
    name: string;
    section: string | null;
    products: {
      id: string;
      ref: string;
      name: string;
      description: string | null;
      priceCents: number;
      vatRateBps: number;
      allergens: string[];
      tags: string[];
      available: boolean;
      groups: { id: string; name: string; kind: "variant" | "extra"; maxSelect: number; modifiers: { id: string; name: string; priceDeltaCents: number }[] }[];
    }[];
  }[];
};

export type OwnMenuResult<T = undefined> = { ok: true; value?: T } | { ok: false; code: "NOT_OWN_MENU" | "INVALID" | "NOT_FOUND" | "NOT_EMPTY"; message: string };

const notOwnMenu = { ok: false, code: "NOT_OWN_MENU", message: "Este restaurante usa a ementa do POS. A ementa edita-se no POS." } as const;

async function usesOwnMenu(tx: Db, establishmentId: string): Promise<boolean> {
  const [p] = await tx.select({ provider: posIntegrations.provider }).from(posIntegrations).where(eq(posIntegrations.establishmentId, establishmentId));
  return p?.provider === "mesvio";
}

async function audit(tx: Db, s: Scope, action: string, entityId: string, after?: unknown) {
  await tx.insert(auditLogs).values({ organizationId: s.organizationId, actorType: "user", actorId: s.userId, action, entityType: "menu", entityId, after });
}

/** A ementa toda, para o editor do painel. `null` se o restaurante usa a ementa do POS. */
export async function getOwnMenu(db: Db, s: Scope): Promise<OwnMenu | null> {
  return withTenant(db, tenantOf(s), async (tx) => {
    if (!(await usesOwnMenu(tx, s.establishmentId))) return null;
    const cats = await tx.select().from(categories).where(eq(categories.establishmentId, s.establishmentId)).orderBy(asc(categories.sortOrder), asc(categories.name));
    const prods = await tx.select().from(products).where(eq(products.establishmentId, s.establishmentId)).orderBy(asc(products.sortOrder), asc(products.name));
    const links = prods.length ? await tx.select().from(productModifierGroups).where(inArray(productModifierGroups.productId, prods.map((p) => p.id))).orderBy(asc(productModifierGroups.sortOrder)) : [];
    const groups = links.length ? await tx.select().from(modifierGroups).where(inArray(modifierGroups.id, links.map((l) => l.groupId))) : [];
    const mods = groups.length ? await tx.select().from(modifiers).where(inArray(modifiers.groupId, groups.map((g) => g.id))).orderBy(asc(modifiers.sortOrder)) : [];
    const groupById = new Map(groups.map((g) => [g.id, g]));
    return {
      categories: cats.map((c) => ({
        id: c.id,
        name: c.name,
        section: c.section,
        products: prods
          .filter((p) => p.categoryId === c.id)
          .map((p) => ({
            id: p.id,
            ref: p.posProductRef,
            name: p.name,
            description: p.description,
            priceCents: p.priceCents,
            vatRateBps: p.vatRateBps,
            allergens: p.allergens,
            tags: p.tags,
            available: p.posAvailable,
            groups: links
              .filter((l) => l.productId === p.id)
              .map((l) => groupById.get(l.groupId)!)
              .map((g) => ({
                id: g.id,
                name: g.name,
                kind: g.kind,
                maxSelect: g.maxSelect,
                modifiers: mods.filter((m) => m.groupId === g.id).map((m) => ({ id: m.id, name: m.name, priceDeltaCents: m.priceDeltaCents })),
              })),
          })),
      })),
    };
  });
}

/** Cria ou altera uma categoria. */
export async function saveCategory(db: Db, s: Scope, raw: unknown): Promise<OwnMenuResult<{ id: string }>> {
  const parsed = categoryInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, code: "INVALID", message: "Dê um nome à categoria." };
  const c = parsed.data;
  return withTenant(db, tenantOf(s), async (tx) => {
    if (!(await usesOwnMenu(tx, s.establishmentId))) return notOwnMenu;
    if (c.id) {
      const updated = await tx
        .update(categories)
        .set({ name: c.name, section: c.section })
        .where(and(eq(categories.id, c.id), eq(categories.establishmentId, s.establishmentId)))
        .returning({ id: categories.id });
      if (!updated.length) return { ok: false, code: "NOT_FOUND", message: "Categoria não encontrada." };
      return { ok: true, value: { id: c.id } };
    }
    const count = await tx.$count(categories, eq(categories.establishmentId, s.establishmentId));
    const [created] = await tx
      .insert(categories)
      .values({ organizationId: s.organizationId, establishmentId: s.establishmentId, posCategoryRef: newRef("C"), name: c.name, section: c.section, sortOrder: count })
      .returning({ id: categories.id });
    await audit(tx, s, "menu.category_created", created.id, { name: c.name });
    return { ok: true, value: { id: created.id } };
  });
}

/** Apaga uma categoria vazia (os pratos têm de ser mudados ou apagados antes). */
export async function deleteCategory(db: Db, s: Scope, id: string): Promise<OwnMenuResult> {
  return withTenant(db, tenantOf(s), async (tx) => {
    if (!(await usesOwnMenu(tx, s.establishmentId))) return notOwnMenu;
    if ((await tx.$count(products, eq(products.categoryId, id))) > 0) {
      return { ok: false, code: "NOT_EMPTY", message: "Esta categoria ainda tem pratos. Apague-os ou mude-os de categoria primeiro." };
    }
    const deleted = await tx.delete(categories).where(and(eq(categories.id, id), eq(categories.establishmentId, s.establishmentId))).returning({ id: categories.id });
    if (!deleted.length) return { ok: false, code: "NOT_FOUND", message: "Categoria não encontrada." };
    await audit(tx, s, "menu.category_deleted", id);
    return { ok: true };
  });
}

/** Sobe ou desce uma categoria, ou um prato dentro da categoria. */
export async function move(db: Db, s: Scope, kind: "category" | "product", id: string, direction: "up" | "down"): Promise<OwnMenuResult> {
  return withTenant(db, tenantOf(s), async (tx) => {
    if (!(await usesOwnMenu(tx, s.establishmentId))) return notOwnMenu;
    const table = kind === "category" ? categories : products;
    let siblings: { id: string }[];
    if (kind === "category") {
      siblings = await tx.select({ id: categories.id }).from(categories).where(eq(categories.establishmentId, s.establishmentId)).orderBy(asc(categories.sortOrder), asc(categories.name));
    } else {
      const [p] = await tx.select({ categoryId: products.categoryId }).from(products).where(and(eq(products.id, id), eq(products.establishmentId, s.establishmentId)));
      if (!p) return { ok: false, code: "NOT_FOUND", message: "Prato não encontrado." };
      siblings = await tx.select({ id: products.id }).from(products).where(eq(products.categoryId, p.categoryId)).orderBy(asc(products.sortOrder), asc(products.name));
    }
    const i = siblings.findIndex((x) => x.id === id);
    const j = direction === "up" ? i - 1 : i + 1;
    if (i < 0) return { ok: false, code: "NOT_FOUND", message: "Não encontrado." };
    if (j < 0 || j >= siblings.length) return { ok: true };
    [siblings[i], siblings[j]] = [siblings[j], siblings[i]];
    // Renumera a lista toda: corrige também ordens repetidas de importações antigas.
    for (const [n, x] of siblings.entries()) await tx.update(table).set({ sortOrder: n }).where(eq(table.id, x.id));
    return { ok: true };
  });
}

/** Cria ou altera um prato, com as suas opções (grupos e escolhas). */
export async function saveProduct(db: Db, s: Scope, raw: unknown): Promise<OwnMenuResult<{ id: string }>> {
  const parsed = productInputSchema.safeParse(raw);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    const message =
      field === "name" ? "Dê um nome ao prato." : field === "priceCents" ? "Indique um preço válido." : field === "groups" ? "Cada opção precisa de um nome e de pelo menos uma escolha." : "Verifique os dados do prato.";
    return { ok: false, code: "INVALID", message };
  }
  const p = parsed.data;
  return withTenant(db, tenantOf(s), async (tx) => {
    if (!(await usesOwnMenu(tx, s.establishmentId))) return notOwnMenu;
    const [cat] = await tx.select({ id: categories.id }).from(categories).where(and(eq(categories.id, p.categoryId), eq(categories.establishmentId, s.establishmentId)));
    if (!cat) return { ok: false, code: "NOT_FOUND", message: "Categoria não encontrada." };

    const values = {
      categoryId: p.categoryId,
      name: p.name,
      description: p.description,
      priceCents: p.priceCents,
      vatRateBps: p.vatRateBps,
      allergens: p.allergens,
      tags: p.tags,
      posAvailable: p.available,
    };
    let productId: string;
    if (p.id) {
      const updated = await tx
        .update(products)
        .set(values)
        .where(and(eq(products.id, p.id), eq(products.establishmentId, s.establishmentId)))
        .returning({ id: products.id });
      if (!updated.length) return { ok: false, code: "NOT_FOUND", message: "Prato não encontrado." };
      productId = p.id;
    } else {
      const count = await tx.$count(products, eq(products.categoryId, p.categoryId));
      const [created] = await tx
        .insert(products)
        .values({ ...values, organizationId: s.organizationId, establishmentId: s.establishmentId, posProductRef: newRef("P"), sortOrder: count })
        .returning({ id: products.id });
      productId = created.id;
    }
    await syncGroups(tx, s, productId, p.groups);
    await audit(tx, s, p.id ? "menu.product_updated" : "menu.product_created", productId, { name: p.name, priceCents: p.priceCents });
    return { ok: true, value: { id: productId } };
  });
}

/** Grava as opções do prato: mantém as que vêm com id (e as suas referências), cria as novas, apaga as que saíram. */
async function syncGroups(tx: Db, s: Scope, productId: string, groups: z.output<typeof groupInput>[]) {
  const current = await tx.select({ groupId: productModifierGroups.groupId }).from(productModifierGroups).where(eq(productModifierGroups.productId, productId));
  const currentIds = new Set(current.map((c) => c.groupId));
  const keep = new Set(groups.map((g) => g.id).filter((id): id is string => !!id && currentIds.has(id)));
  const gone = [...currentIds].filter((id) => !keep.has(id));
  if (gone.length) {
    await tx.delete(productModifierGroups).where(and(eq(productModifierGroups.productId, productId), inArray(productModifierGroups.groupId, gone)));
    await tx.delete(modifiers).where(inArray(modifiers.groupId, gone));
    await tx.delete(modifierGroups).where(inArray(modifierGroups.id, gone));
  }
  for (const [order, g] of groups.entries()) {
    let groupId = g.id && keep.has(g.id) ? g.id : null;
    const groupValues = { name: g.name, kind: g.kind, minSelect: g.minSelect, maxSelect: g.maxSelect };
    if (groupId) {
      await tx.update(modifierGroups).set(groupValues).where(eq(modifierGroups.id, groupId));
      await tx.update(productModifierGroups).set({ sortOrder: order }).where(and(eq(productModifierGroups.productId, productId), eq(productModifierGroups.groupId, groupId)));
    } else {
      const [created] = await tx
        .insert(modifierGroups)
        .values({ ...groupValues, organizationId: s.organizationId, establishmentId: s.establishmentId, posGroupRef: newRef("G") })
        .returning({ id: modifierGroups.id });
      groupId = created.id;
      await tx.insert(productModifierGroups).values({ productId, groupId, sortOrder: order });
    }
    const existing = await tx.select({ id: modifiers.id }).from(modifiers).where(eq(modifiers.groupId, groupId));
    const existingIds = new Set(existing.map((m) => m.id));
    const keptMods = g.modifiers.map((m) => m.id).filter((id): id is string => !!id && existingIds.has(id));
    await tx.delete(modifiers).where(keptMods.length ? and(eq(modifiers.groupId, groupId), notInArray(modifiers.id, keptMods)) : eq(modifiers.groupId, groupId));
    for (const [n, m] of g.modifiers.entries()) {
      if (m.id && existingIds.has(m.id)) {
        await tx.update(modifiers).set({ name: m.name, priceDeltaCents: m.priceDeltaCents, sortOrder: n }).where(eq(modifiers.id, m.id));
      } else {
        await tx.insert(modifiers).values({ organizationId: s.organizationId, groupId, posModifierRef: newRef("M"), name: m.name, priceDeltaCents: m.priceDeltaCents, sortOrder: n });
      }
    }
  }
}

/** Apaga um prato (os pedidos já feitos guardam a sua cópia e não mudam). */
export async function deleteProduct(db: Db, s: Scope, id: string): Promise<OwnMenuResult> {
  return withTenant(db, tenantOf(s), async (tx) => {
    if (!(await usesOwnMenu(tx, s.establishmentId))) return notOwnMenu;
    const [p] = await tx.select({ id: products.id, name: products.name }).from(products).where(and(eq(products.id, id), eq(products.establishmentId, s.establishmentId)));
    if (!p) return { ok: false, code: "NOT_FOUND", message: "Prato não encontrado." };
    await syncGroups(tx, s, id, []);
    await tx.delete(products).where(eq(products.id, id));
    await audit(tx, s, "menu.product_deleted", id, { name: p.name });
    return { ok: true };
  });
}

/**
 * Copia uma ementa (ex.: a que o restaurante tinha no MockPOS ou num POS) para a ementa própria,
 * mantendo as referências: fotos, traduções e esgotados continuam ligados aos mesmos pratos.
 * Só corre com a ementa própria vazia. Dentro de uma transação com o tenant definido.
 */
export async function importCatalog(tx: Db, organizationId: string, establishmentId: string, catalog: PosCatalog): Promise<{ categories: number; products: number }> {
  if ((await tx.$count(categories, eq(categories.establishmentId, establishmentId))) > 0) return { categories: 0, products: 0 };
  const catId = new Map<string, string>();
  for (const [i, c] of [...catalog.categories].sort((a, b) => a.sortOrder - b.sortOrder).entries()) {
    const [row] = await tx
      .insert(categories)
      .values({ organizationId, establishmentId, posCategoryRef: c.posCategoryRef, name: c.name, section: c.section ?? null, sortOrder: i })
      .returning({ id: categories.id });
    catId.set(c.posCategoryRef, row.id);
  }
  let count = 0;
  for (const [i, p] of catalog.products.entries()) {
    const categoryId = catId.get(p.posCategoryRef);
    if (!categoryId) continue;
    const [row] = await tx
      .insert(products)
      .values({
        organizationId,
        establishmentId,
        categoryId,
        posProductRef: p.posProductRef,
        name: p.name,
        description: p.description ?? null,
        priceCents: p.priceCents,
        vatRateBps: p.vatRateBps,
        allergens: p.allergens,
        tags: p.tags,
        posAvailable: p.available,
        sortOrder: i,
      })
      .returning({ id: products.id });
    count++;
    for (const [n, g] of p.modifierGroups.entries()) {
      // Um grupo por prato (no POS pode ser partilhado): assim editar as opções de um prato no painel
      // nunca muda as de outro. As referências mantêm-se, para as traduções continuarem a servir.
      const [gr] = await tx
        .insert(modifierGroups)
        .values({ organizationId, establishmentId, posGroupRef: g.posGroupRef, name: g.name, kind: g.kind, minSelect: g.minSelect, maxSelect: g.maxSelect })
        .returning({ id: modifierGroups.id });
      const groupId = gr.id;
      for (const [k, m] of g.modifiers.entries()) {
        await tx.insert(modifiers).values({ organizationId, groupId, posModifierRef: m.posModifierRef, name: m.name, priceDeltaCents: m.priceDeltaCents, available: m.available, sortOrder: k });
      }
      await tx.insert(productModifierGroups).values({ productId: row.id, groupId, sortOrder: n });
    }
  }
  return { categories: catId.size, products: count };
}
