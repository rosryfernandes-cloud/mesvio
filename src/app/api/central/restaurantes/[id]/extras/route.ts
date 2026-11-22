import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { establishments } from "@/server/db/schema";
import { json } from "@/server/staff/http";
import { guardPlatform } from "@/server/platform/admin-auth";
import { getExtras, regenerateLink, setExtra } from "@/server/extras/extras-service";
import { EXTRA_KEYS } from "@/lib/extras";

export const dynamic = "force-dynamic";

const schema = z.union([
  z.object({ key: z.enum(EXTRA_KEYS as [string, ...string[]]), on: z.boolean() }),
  z.object({ regenerate: z.enum(["tv", "site"]) }),
]);

async function orgOf(id: string) {
  const db = await getDb();
  const [e] = await db.select({ organizationId: establishments.organizationId }).from(establishments).where(eq(establishments.id, id));
  return { db, org: e?.organizationId ?? null };
}

/** Central: extras ligados neste restaurante. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await guardPlatform(request, { mutating: false });
  if (admin instanceof Response) return admin;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return json({ message: "Restaurante não encontrado." }, 404);
  const { db, org } = await orgOf(id);
  if (!org) return json({ message: "Restaurante não encontrado." }, 404);
  return json(await getExtras(db, org, id));
}

/** Central: ligar/desligar um extra, ou trocar o link da TV ou do site. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await guardPlatform(request, { mutating: true });
  if (admin instanceof Response) return admin;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return json({ message: "Restaurante não encontrado." }, 404);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ message: "Pedido inválido." }, 400);
  const { db, org } = await orgOf(id);
  if (!org) return json({ message: "Restaurante não encontrado." }, 404);
  const d = parsed.data;
  const extras = "regenerate" in d ? await regenerateLink(db, org, id, d.regenerate) : await setExtra(db, org, id, d.key as (typeof EXTRA_KEYS)[number], d.on);
  return json(extras);
}
