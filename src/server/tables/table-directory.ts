import "server-only";
import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { resolveTableToken, withTenant } from "@/server/db/tenant";
import { diningTables, establishments, posIntegrations } from "@/server/db/schema";
import { resolvePosAdapter, type PosResolver } from "@/server/pos/registry";
import { listLocallyUnavailable } from "@/server/catalog/availability";
import type { PosAdapter } from "@/server/pos/types";

export interface ResolvedTable {
  organizationId: string;
  establishmentId: string;
  tableId: string;
  tableLabel: string;
  posTableRef: string;
  establishmentName: string;
  establishmentAddress?: string;
  timezone: string;
  /** Pedidos esperam aprovação do staff antes de seguirem para o POS. */
  manualAcceptance: boolean;
  /** Pedidos acima deste valor esperam aprovação (null = sem limite). */
  approvalThresholdCents: number | null;
  /** "pay_first": cada pedido é pago ao pedir (espreguiçadeiras) e só depois segue para o POS. */
  orderingMode: "pay_later" | "pay_first";
  zone: string | null;
  /** Artigos marcados como esgotados no painel (lidos na mesma transação, sem ida extra à BD). */
  locallyUnavailable: Set<string>;
  pos: PosAdapter;
}

/** Resolve o token público de uma mesa (QR/NFC) no tenant, mesa e POS. Nunca confia noutro input do cliente. */
export interface TableDirectory {
  findActiveByToken(token: string): Promise<ResolvedTable | null>;
}

export function createDbTableDirectory(db: Db, resolvePos: PosResolver = resolvePosAdapter): TableDirectory {
  return {
    async findActiveByToken(token) {
      const ids = await resolveTableToken(db, token);
      if (!ids) return null;
      const [row, locallyUnavailable] = await withTenant(db, { organizationId: ids.organizationId }, async (tx) => {
        const [r] = await tx
          .select({
            organizationId: diningTables.organizationId,
            establishmentId: diningTables.establishmentId,
            tableId: diningTables.id,
            tableLabel: diningTables.label,
            posTableRef: diningTables.posTableRef,
            establishmentName: establishments.name,
            establishmentAddress: establishments.address,
            timezone: establishments.timezone,
            manualAcceptance: establishments.manualAcceptance,
            approvalThresholdCents: establishments.approvalThresholdCents,
            orderingMode: diningTables.orderingMode,
            zone: diningTables.zone,
            provider: posIntegrations.provider,
          })
          .from(diningTables)
          .innerJoin(establishments, eq(establishments.id, diningTables.establishmentId))
          .innerJoin(posIntegrations, eq(posIntegrations.establishmentId, diningTables.establishmentId))
          .where(eq(diningTables.id, ids.tableId))
          .limit(1);
        return [r, await listLocallyUnavailable(tx, ids.establishmentId)] as const;
      });
      // Sem mesa do POS mapeada não é possível encaminhar pedidos: tratar como inexistente.
      if (!row || !row.posTableRef) return null;
      const { provider, establishmentAddress, posTableRef, ...rest } = row;
      return {
        ...rest,
        posTableRef,
        establishmentAddress: establishmentAddress ?? undefined,
        locallyUnavailable,
        pos: resolvePos(provider, row.establishmentId),
      };
    },
  };
}
