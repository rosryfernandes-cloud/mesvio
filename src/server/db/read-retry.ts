import "server-only";

/**
 * Leitura com limite de tempo e uma segunda tentativa: se a consulta falhar ou não responder em
 * `ms`, tenta outra vez. Só para leituras (repetir não muda nada). Evita que uma ligação ao pooler
 * que falhou deixe uma página pendurada até ao timeout da Vercel.
 */
export async function readWithRetry<T>(fn: () => Promise<T>, ms = 8_000): Promise<T> {
  try {
    return await withTimeout(fn(), ms);
  } catch (err) {
    console.error("[bd] leitura falhou, a tentar de novo", err instanceof Error ? (err.cause ?? err.message) : err);
    return withTimeout(fn(), ms);
  }
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`sem resposta em ${ms} ms`)), ms);
  });
  return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}
