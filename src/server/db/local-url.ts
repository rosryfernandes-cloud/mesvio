/** A base de dados é desta máquina (dev/benchmark)? Nunca é o caso numa base de produção. */
export function isLocalDatabaseUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
  } catch {
    return false;
  }
}

/**
 * Ambiente local "como produção" para testes de carga: build de produção (`next start`) contra
 * um Postgres em localhost, com MESA_LOCAL_BENCH=1. Só aí se permitem a entrada de demonstração e
 * o pagamento simulado num build de produção.
 */
export function isLocalBench(): boolean {
  return process.env.MESA_LOCAL_BENCH === "1" && isLocalDatabaseUrl(process.env.DATABASE_URL);
}
