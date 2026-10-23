import { z } from "zod";
import { getDb } from "@/server/db/client";
import { guardStaff, json } from "@/server/staff/http";
import { getBranding, setBranding } from "@/server/staff/staff-service";
import { brandPalette } from "@/lib/brand-color";

export const dynamic = "force-dynamic";

const schema = z.object({
  /** #rrggbb, ou null para voltar às cores MESVIO. */
  brandColor: z.string().max(16).nullable(),
  /** URL https de uma imagem, ou null para mostrar só o nome. */
  brandLogoUrl: z
    .url({ protocol: /^https$/, message: "O logótipo tem de ser um endereço https://." })
    .max(500)
    .nullable(),
});

export async function GET(request: Request) {
  const ctx = await guardStaff(request, { mutating: false, permission: "settings.edit" });
  if (ctx instanceof Response) return ctx;
  return json(await getBranding(await getDb(), ctx));
}

export async function POST(request: Request) {
  const ctx = await guardStaff(request, { mutating: true, permission: "settings.edit" });
  if (ctx instanceof Response) return ctx;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const logoIssue = parsed.error.issues.find((i) => i.path[0] === "brandLogoUrl");
    return json({ message: logoIssue ? "O logótipo tem de ser um endereço https:// (até 500 caracteres)." : "Pedido inválido." }, 400);
  }
  let brandColor: string | null = null;
  if (parsed.data.brandColor) {
    const checked = brandPalette(parsed.data.brandColor);
    if (!checked.ok) return json({ message: checked.reason }, 400);
    brandColor = checked.palette.brand;
  }
  await setBranding(await getDb(), ctx, { brandColor, brandLogoUrl: parsed.data.brandLogoUrl });
  return json({ ok: true, brandColor, brandLogoUrl: parsed.data.brandLogoUrl });
}
