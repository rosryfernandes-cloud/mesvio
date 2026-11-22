import "server-only";
import type { Db } from "@/server/db/client";
import type { StaffContext } from "@/server/staff/context";
import { findPlatformAdmin } from "@/server/platform/admin-auth";
import { hasExtra, type ExtraKey } from "@/lib/extras";
import { getExtras } from "./extras-service";

/** O restaurante tem este extra ligado (ou é a equipa MESVIO, que vê tudo para testar). */
export async function canUseExtra(db: Db, ctx: Pick<StaffContext, "userId" | "organizationId" | "establishmentId">, key: ExtraKey): Promise<boolean> {
  if (hasExtra(await getExtras(db, ctx.organizationId, ctx.establishmentId), key)) return true;
  return (await findPlatformAdmin(db, ctx.userId)) !== null;
}
