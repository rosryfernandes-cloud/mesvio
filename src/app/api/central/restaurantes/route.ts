import { getDb } from "@/server/db/client";
import { json } from "@/server/staff/http";
import { createUserDirectory } from "@/server/auth/user-directory";
import { guardPlatform } from "@/server/platform/admin-auth";
import { createRestaurant } from "@/server/platform/platform-service";

export const dynamic = "force-dynamic";

/** Novo cliente (restaurante, mesas, dono convidado). */
export async function POST(request: Request) {
  const admin = await guardPlatform(request, { mutating: true });
  if (admin instanceof Response) return admin;
  const db = await getDb();
  try {
    const result = await createRestaurant(db, admin, await request.json().catch(() => null), createUserDirectory(db));
    if (!result.ok) return json(result, result.code === "CONFLICT" ? 409 : 400);
    return json(result, 201);
  } catch (err) {
    console.error("[central] criar restaurante falhou", err);
    return json({ ok: false, message: "Não foi possível criar (o convite ao dono pode ter falhado). Tente de novo." }, 502);
  }
}
