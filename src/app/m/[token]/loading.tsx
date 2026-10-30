/** Aparece logo ao mudar de página na mesa (ementa → pedido → conta), sobretudo com rede fraca na praia. */
export default function TableLoading() {
  return (
    <div className="flex min-h-dvh items-center justify-center" aria-busy="true">
      <span className="size-10 animate-spin rounded-full border-4 border-brand-soft border-t-brand" />
      <span className="sr-only">…</span>
    </div>
  );
}
