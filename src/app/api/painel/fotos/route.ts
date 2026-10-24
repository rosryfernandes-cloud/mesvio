import { z } from "zod";
import { getDb } from "@/server/db/client";
import { guardStaff, json } from "@/server/staff/http";
import { getStaffCatalog } from "@/server/staff/staff-service";
import { deleteProductImage, MAX_IMAGE_BYTES, productImageUrls, saveProductImage } from "@/server/menu/menu-images";

export const dynamic = "force-dynamic";

/** Artigos da ementa com a foto atual (dono/gerente). */
export async function GET(request: Request) {
  const ctx = await guardStaff(request, { mutating: false, permission: "settings.edit" });
  if (ctx instanceof Response) return ctx;
  const db = await getDb();
  const [sections, urls] = await Promise.all([getStaffCatalog(db, ctx), productImageUrls(db, ctx.organizationId, ctx.establishmentId)]);
  return json({
    sections: sections.map((s) => ({
      section: s.section,
      categories: s.categories.map((c) => ({
        name: c.name,
        products: c.products.map((p) => ({ ref: p.ref, name: p.name, imageUrl: urls.get(p.ref) ?? null })),
      })),
    })),
  });
}

/** Enviar (ou trocar) a foto de um artigo: multipart com `productRef` e `file`. */
export async function POST(request: Request) {
  // Sessão e permissão primeiro: sem isto, ninguém faz o servidor ler um envio.
  const ctx = await guardStaff(request, { mutating: true, permission: "settings.edit" });
  if (ctx instanceof Response) return ctx;
  const length = Number(request.headers.get("content-length") ?? 0);
  if (!length || length > MAX_IMAGE_BYTES + 64 * 1024) return json({ message: "A foto tem mais de 1 MB." }, 413);
  const form = await request.formData().catch(() => null);
  const ref = z.string().min(1).max(200).safeParse(form?.get("productRef"));
  const file = form?.get("file");
  if (!ref.success || !(file instanceof Blob)) return json({ message: "Pedido inválido." }, 400);

  const db = await getDb();
  const sections = await getStaffCatalog(db, ctx);
  if (!sections.some((s) => s.categories.some((c) => c.products.some((p) => p.ref === ref.data)))) {
    return json({ message: "Artigo não encontrado na ementa." }, 404);
  }
  const r = await saveProductImage(db, ctx, ref.data, Buffer.from(await file.arrayBuffer()));
  return r.ok ? json(r, 201) : json(r, r.code === "TOO_LARGE" ? 413 : 400);
}

/** Remover a foto de um artigo: ?ref=… */
export async function DELETE(request: Request) {
  const ref = new URL(request.url).searchParams.get("ref") ?? "";
  const ctx = await guardStaff(request, { mutating: true, permission: "settings.edit" });
  if (ctx instanceof Response) return ctx;
  if (!ref) return json({ message: "Pedido inválido." }, 400);
  return json({ ok: await deleteProductImage(await getDb(), ctx, ref) });
}
