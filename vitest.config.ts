import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      // "server-only" lança erro fora do runtime do Next; nos testes substituímos por um módulo vazio.
      "server-only": fileURLToPath(new URL("./test/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Testes que criam e migram um Postgres em memória (PGlite) demoram alguns segundos em paralelo.
    testTimeout: 20_000,
    // A primeira base de cada ficheiro é migrada num beforeEach; em paralelo pode passar os 10 s por omissão
    // (auditoria F4: falhas intermitentes "Hook timed out").
    hookTimeout: 60_000,
  },
});
