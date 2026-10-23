"use client";

/**
 * Confirmação dentro da página, em vez de window.confirm: há browsers (webviews de apps,
 * tablets em modo quiosque, browsers embutidos) que bloqueiam a caixa nativa e respondem
 * "não" sem a mostrar — o botão parecia não fazer nada.
 */
export function ConfirmInline({
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  busy = false,
}: {
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  return (
    <div role="alertdialog" aria-label={message} className="mt-3 rounded-xl border border-brand bg-brand-soft p-3">
      <p className="text-sm">{message}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          autoFocus
          className="min-h-11 rounded-xl bg-brand px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "…" : confirmLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="min-h-11 rounded-xl border border-line bg-card px-4 text-sm font-semibold disabled:opacity-50"
        >
          Voltar
        </button>
      </div>
    </div>
  );
}
