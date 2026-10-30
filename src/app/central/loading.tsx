/** Aparece logo ao clicar num separador do painel central, enquanto o servidor prepara a página. */
export default function CentralLoading() {
  return (
    <div className="min-h-dvh">
      <div className="h-[60px] bg-brand" />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6" aria-busy="true">
        <p className="sr-only">A carregar…</p>
        <div className="h-9 w-56 animate-pulse rounded-xl bg-line" />
        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-3xl bg-line" />
          ))}
        </div>
        <div className="mt-6 h-64 animate-pulse rounded-3xl bg-line" />
      </main>
    </div>
  );
}
