/**
 * Um objeto da Stripe que não existe com a chave atual: típico depois de passar do modo de teste
 * para o modo real (as contas, clientes e subscrições de teste não existem com a chave real).
 * Nesse caso a app esquece o identificador guardado em vez de dar erro.
 */
export function isMissingStripeObject(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "resource_missing";
}
