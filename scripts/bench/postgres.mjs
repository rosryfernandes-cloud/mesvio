// Postgres 17 verdadeiro, local, para testes de carga (binários do pacote embedded-postgres).
// Uso: node scripts/bench/postgres.mjs  → fica a correr em localhost:54329 até Ctrl+C.
import { existsSync } from "node:fs";
import EmbeddedPostgres from "embedded-postgres";

const dir = new URL("../../.data/bench-pg", import.meta.url).pathname;
const pg = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "postgres", port: 54329, persistent: true });

if (!existsSync(`${dir}/PG_VERSION`)) await pg.initialise();
await pg.start();
try {
  await pg.createDatabase("mesa");
} catch {
  // já existe
}
console.log("postgres pronto em postgres://postgres:postgres@localhost:54329/mesa");

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 1 << 30);
