"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex min-h-11 items-center rounded-xl bg-brand px-5 font-semibold text-white"
    >
      Imprimir
    </button>
  );
}
