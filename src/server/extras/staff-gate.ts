import "server-only";
import type { Db } from "@/server/db/client";
import type { StaffContext } from "@/server/staff/context";
import { hasExtra, type ExtraKey } from "@/lib/extras";
import { getExtras } from "./extras-service";

/** O restaurante tem este extra ligado na Central (vale também para a equipa MESVIO: para testar, liga-se num restaurante de teste). */
export async function canUseExtra(db: Db, ctx: Pick<StaffContext, "userId" | "organizationId" | "establishmentId">, key: ExtraKey): Promise<boolean> {
  return hasExtra(await getExtras(db, ctx.organizationId, ctx.establishmentId), key);
}
