import "server-only";
import { after } from "next/server";

/**
 * Mantém vivo trabalho que continua depois de a resposta sair. Na Vercel, sem isto a função
 * pode ser congelada a meio; no servidor Node a promessa continua de qualquer forma. Fora de um
 * pedido HTTP (testes, scripts) `after` não está disponível e não é preciso.
 */
export function keepAlive(work: Promise<unknown>): void {
  try {
    after(work);
  } catch {
    // fora de um pedido: nada a fazer
  }
}
