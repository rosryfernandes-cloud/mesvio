import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { establishments } from "@/server/db/schema";
import { json } from "@/server/staff/http";
import { guardPlatform } from "@/server/platform/admin-auth";
import { getBranding, setBranding } from "@/server/staff/staff-service";
import { brandPalette } from "@/lib/brand-color";

export const dynamic = "force-dynamic";

/** Central (placas): mudar a cor do restaurante ({ brandColor: "#rrggbb" | null }). Muda também na ementa. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await guardPlatform(request, { mutating: true });
  if (admin instanceof Response) return admin;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return json({ message: "Restaurante não encontrado." }, 404);
  const body = (await request.json().catch(() => null)) as { brandColor?: unknown } | null;
  const db = await getDb();
  const [e] = await db.select({ organizationId: establishments.organizationId }).from(establishments).where(eq(establishments.id, id));
  if (!e) return json({ message: "Restaurante não encontrado." }, 404);
  let brandColor: string | null = null;
  if (typeof body?.brandColor === "string" && body.brandColor) {
    const checked = brandPalette(body.brandColor);
    if (!checked.ok) return json({ message: checked.reason }, 400);
    brandColor = checked.palette.brand;
  }
  const scope = { userId: admin.userId, organizationId: e.organizationId, establishmentId: id };
  const { brandLogoUrl } = await getBranding(db, scope);
  await setBranding(db, scope, { brandColor, brandLogoUrl });
  return json({ ok: true, brandColor });
}
