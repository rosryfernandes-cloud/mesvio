import { defineConfig } from "drizzle-kit";

// O drizzle-kit não lê o .env.local do Next; carregamo-lo aqui (se existir).
try {
  process.loadEnvFile(".env.local");
} catch {
  // sem .env.local: usar as variáveis do ambiente (CI)
}

export default defineConfig({
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Migrações pela ligação direta/session pooler (o transaction pooler não serve para DDL longo).
    url: process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || "",
  },
  strict: true,
});
