import "server-only";
import { sql, type SQL } from "drizzle-orm";
import type { Db } from "./client";

export interface TenantContext {
  organizationId: string;
  /** Utilizador do painel (para políticas de perfis e auditoria). Vazio em pedidos de clientes. */
  userId?: string;
}

/**
 * Executa `fn` numa transação como `app_user`, com o restaurante atual fixado.
 * As políticas RLS (drizzle/0003_rls.sql) garantem que dentro desta transação só se vê e só se
 * escreve em linhas desta organização — mesmo que uma consulta se esqueça de filtrar.
 *
 * Fora daqui, a ligação é a do dono das tabelas (sem RLS): reservada ao worker, seed e migrações.
 */
export function withTenant<T>(db: Db, ctx: TenantContext, fn: (tx: Db) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local role app_user`);
    await tx.execute(
      sql`select set_config('app.current_org', ${ctx.organizationId}, true), set_config('app.current_user', ${ctx.userId ?? ""}, true)`,
    );
    return fn(tx as unknown as Db);
  });
}

/** Linhas de um `db.execute` (postgres-js devolve um array; PGlite devolve `{ rows }`). */
export async function queryRows<T>(db: Db, query: SQL): Promise<T[]> {
  const result = (await db.execute(query)) as unknown as T[] | { rows: T[] };
  return Array.isArray(result) ? result : result.rows;
}

/** Token de mesa → organização/estabelecimento/mesa (função SECURITY DEFINER; só devolve ids). */
export async function resolveTableToken(
  db: Db,
  token: string,
): Promise<{ organizationId: string; establishmentId: string; tableId: string } | null> {
  const [row] = await queryRows<{ organization_id: string; establishment_id: string; table_id: string }>(
    db,
    sql`select organization_id, establishment_id, table_id from app.resolve_table(${token})`,
  );
  return row ? { organizationId: row.organization_id, establishmentId: row.establishment_id, tableId: row.table_id } : null;
}
