import { removeEstablishmentLogo, saveEstablishmentLogo } from "@/server/branding/logo";
import { getDb } from "@/server/db/client";
import { MAX_IMAGE_BYTES } from "@/server/menu/menu-images";
import { guardStaff, json } from "@/server/staff/http";

export const dynamic = "force-dynamic";

/** Enviar (ou trocar) o logótipo: multipart com `file`. Só dono/gerente. */
export async function POST(request: Request) {
  // Sessão e permissão primeiro: sem isto, ninguém faz o servidor ler um envio.
  const ctx = await guardStaff(request, { mutating: true, permission: "settings.edit" });
  if (ctx instanceof Response) return ctx;
  const length = Number(request.headers.get("content-length") ?? 0);
  if (!length || length > MAX_IMAGE_BYTES + 64 * 1024) return json({ message: "O logótipo tem mais de 1 MB." }, 413);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  if (!baseUrl.startsWith("https://")) return json({ message: "O envio de logótipos só funciona num endereço https." }, 400);
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof Blob)) return json({ message: "Pedido inválido." }, 400);

  const r = await saveEstablishmentLogo(await getDb(), ctx, Buffer.from(await file.arrayBuffer()), baseUrl);
  return r.ok ? json({ ok: true, brandLogoUrl: r.url }, 201) : json(r, r.code === "TOO_LARGE" ? 413 : 400);
}

export async function DELETE(request: Request) {
  const ctx = await guardStaff(request, { mutating: true, permission: "settings.edit" });
  if (ctx instanceof Response) return ctx;
  await removeEstablishmentLogo(await getDb(), ctx);
  return json({ ok: true });
}
