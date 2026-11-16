/**
 * Um objeto da Stripe que não existe com a chave atual: típico depois de passar do modo de teste
 * para o modo real (as contas, clientes e subscrições de teste não existem com a chave real).
 * Nesse caso a app esquece o identificador guardado em vez de dar erro.
 *
 * - `resource_missing`: cliente, subscrição ou outro objeto que não existe.
 * - `account_invalid` / 403 "does not have access to account": conta ligada que não pertence a esta
 *   plataforma com esta chave (ex.: conta de teste lida com a chave real).
 */
export function isMissingStripeObject(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: unknown; statusCode?: unknown; message?: unknown };
  if (e.code === "resource_missing" || e.code === "account_invalid") return true;
  return e.statusCode === 403 && typeof e.message === "string" && /does not have access to account|that account does not exist/i.test(e.message);
}
