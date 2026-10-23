import "server-only";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";
import { isLocalDatabaseUrl } from "./local-url";

/** Tipo comum aos dois drivers (postgres-js em produção, PGlite em dev/testes). */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const MIGRATIONS_DIR = path.join(process.cwd(), "drizzle");

/**
 * - `DATABASE_URL` definida → Postgres real (Supabase). Migrações via `npm run db:migrate`.
 * - Sem `DATABASE_URL` → PGlite (Postgres em WebAssembly, no próprio processo):
 *   em ficheiro `.data/pglite` no `next dev`, em memória nos testes. Migra e semeia a demo sozinho.
 * Em produção é obrigatório `DATABASE_URL`: nunca guardar pedidos num ficheiro local por engano.
 *
 * Guardado em `globalThis` porque o Next pode carregar este módulo mais do que uma vez no mesmo
 * processo, e duas instâncias PGlite sobre a mesma pasta corrompem os dados.
 */
const g = globalThis as typeof globalThis & { __db?: Promise<Db> };

export function getDb(): Promise<Db> {
  g.__db ??= connect().catch((err) => {
    g.__db = undefined; // permite nova tentativa no pedido seguinte
    throw err;
  });
  return g.__db;
}

async function connect(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const [{ drizzle }, { default: postgres }] = await Promise.all([import("drizzle-orm/postgres-js"), import("postgres")]);
    // prepare:false é necessário com o pooler de transações do Supabase.
    const db = drizzle(postgres(url, { prepare: false, max: Number(process.env.DB_POOL_MAX ?? 10) }), { schema }) as unknown as Db;
    // Só numa base desta máquina (dev/teste de carga): criar os dados de demonstração.
    if (process.env.SEED_DEMO === "1" && isLocalDatabaseUrl(url)) await (await import("./seed-demo")).seedDemo(db);
    return db;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL não definida (ver .env.example).");
  }

  const [{ PGlite }, { drizzle }, { migrate }, { seedDemo }] = await Promise.all([
    import("@electric-sql/pglite"),
    import("drizzle-orm/pglite"),
    import("drizzle-orm/pglite/migrator"),
    import("./seed-demo"),
  ]);
  const dataDir = process.env.NODE_ENV === "test" ? undefined : (process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite"));
  if (dataDir) mkdirSync(dataDir, { recursive: true });
  const db = drizzle(new PGlite(dataDir), { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  await seedDemo(db as unknown as Db);
  return db as unknown as Db;
}

/**
 * Só para testes: base nova em memória, já migrada e semeada. Migra uma vez por ficheiro de
 * testes e depois clona (muito mais rápido do que migrar em cada teste).
 */
let testTemplate: Promise<import("@electric-sql/pglite").PGlite> | undefined;
export async function createTestDb(): Promise<Db> {
  const [{ PGlite }, { drizzle }, { migrate }, { seedDemo }] = await Promise.all([
    import("@electric-sql/pglite"),
    import("drizzle-orm/pglite"),
    import("drizzle-orm/pglite/migrator"),
    import("./seed-demo"),
  ]);
  testTemplate ??= (async () => {
    const pg = new PGlite();
    const db = drizzle(pg, { schema });
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
    await seedDemo(db as unknown as Db);
    return pg;
  })();
  const clone = (await (await testTemplate).clone()) as import("@electric-sql/pglite").PGlite;
  return drizzle(clone, { schema }) as unknown as Db;
}
