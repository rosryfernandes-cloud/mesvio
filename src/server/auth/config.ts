/**
 * Modo de autenticação do painel:
 * - "supabase": Supabase Auth (produção). Exige NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.
 * - "dev": SÓ com uma base desta máquina (PGlite, ou Postgres em localhost) e fora de produção
 *   (ou num teste de carga local, MESA_LOCAL_BENCH) — escolhe-se um utilizador de demonstração.
 *   Com uma base remota nunca existe: permitiria entrar como qualquer membro e listar emails de
 *   todos os restaurantes (auditoria S1).
 * - "unavailable": sem Supabase e com base real (ou em produção) → o painel recusa entradas.
 */
import { isLocalBench, isLocalDatabaseUrl } from "@/server/db/local-url";

export type AuthMode = "supabase" | "dev" | "unavailable";

export function authMode(): AuthMode {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return "supabase";
  const url = process.env.DATABASE_URL;
  const localDb = !url || isLocalDatabaseUrl(url);
  if (!localDb) return "unavailable";
  if (process.env.NODE_ENV === "production" && !isLocalBench()) return "unavailable";
  return "dev";
}
