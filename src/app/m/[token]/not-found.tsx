export default function TableNotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 text-center">
      <h1 className="font-[family-name:var(--font-display)] text-3xl">Mesa não encontrada</h1>
      <p className="mt-3 text-ink-soft">
        Este código já não é válido ou foi substituído. Volte a ler o QR Code da mesa ou peça ajuda a um
        funcionário.
      </p>
    </main>
  );
}
