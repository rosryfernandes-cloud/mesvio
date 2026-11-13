import { z } from "zod";
import { getDb } from "@/server/db/client";
import { guardStaff, json } from "@/server/staff/http";
import { importProductPhotos } from "@/server/menu/import-photos";
import { deleteCategory, deleteProduct, getOwnMenu, importMenuDraft, move, saveAllergens, saveCategory, saveDescriptions, saveProduct } from "@/server/menu/own-menu";

export const dynamic = "force-dynamic";
/** Importar uma ementa com fotos do site pode levar algum tempo a trazer as fotos. */
export const maxDuration = 120;

/** Ementa própria (restaurantes sem POS), para o editor do painel. */
export async function GET(request: Request) {
  const ctx = await guardStaff(request, { mutating: false, permission: "settings.edit" });
  if (ctx instanceof Response) return ctx;
  const menu = await getOwnMenu(await getDb(), ctx);
  return json({ ownMenu: menu !== null, menu });
}

const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save_category"), category: z.unknown() }),
  z.object({ action: z.literal("delete_category"), id: z.uuid() }),
  z.object({ action: z.literal("save_product"), product: z.unknown() }),
  z.object({ action: z.literal("delete_product"), id: z.uuid() }),
  z.object({ action: z.literal("move"), kind: z.enum(["category", "product"]), id: z.uuid(), direction: z.enum(["up", "down"]) }),
  z.object({ action: z.literal("import_menu"), menu: z.unknown() }),
  z.object({ action: z.literal("save_allergens"), products: z.unknown() }),
  z.object({ action: z.literal("save_descriptions"), products: z.unknown() }),
]);

const STATUS = { NOT_OWN_MENU: 409, INVALID: 400, NOT_FOUND: 404, NOT_EMPTY: 409 } as const;

export async function POST(request: Request) {
  const ctx = await guardStaff(request, { mutating: true, permission: "settings.edit" });
  if (ctx instanceof Response) return ctx;
  const parsed = action.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ message: "Ação inválida." }, 400);
  const db = await getDb();
  const a = parsed.data;
  const result =
    a.action === "save_category"
      ? await saveCategory(db, ctx, a.category)
      : a.action === "delete_category"
        ? await deleteCategory(db, ctx, a.id)
        : a.action === "save_product"
          ? await saveProduct(db, ctx, a.product)
          : a.action === "delete_product"
            ? await deleteProduct(db, ctx, a.id)
            : a.action === "import_menu"
              ? await importMenuDraft(db, ctx, a.menu)
              : a.action === "save_allergens"
                ? await saveAllergens(db, ctx, a.products)
                : a.action === "save_descriptions"
                  ? await saveDescriptions(db, ctx, a.products)
                  : await move(db, ctx, a.kind, a.id, a.direction);
  if (!result.ok) return json({ code: result.code, message: result.message }, STATUS[result.code]);
  // Fotos dos pratos vindas do site do restaurante (leitura por link): trazidas depois de gravar os pratos.
  if (a.action === "import_menu" && result.value && "photos" in result.value) {
    const { photos, ...rest } = result.value;
    return json({ ok: true, ...rest, photos: photos.length ? await importProductPhotos(db, ctx, photos) : 0 });
  }
  return json({ ok: true, ...(result.value ?? {}) });
}
