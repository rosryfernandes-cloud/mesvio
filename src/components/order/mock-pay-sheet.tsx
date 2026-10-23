"use client";

import { useEffect, useRef, useState } from "react";
import { formatEur } from "@/lib/money";
import { useI18n } from "../i18n/i18n-provider";

/**
 * Ecrã de pagamento SIMULADO (desenvolvimento, sem chaves Stripe): faz de conta que o cliente
 * paga com Apple Pay ou aprova na app MB WAY. Com a Stripe, aqui aparece o formulário dela.
 */
export function MockPaySheet({
  amountCents,
  onPay,
  onClose,
}: {
  amountCents: number;
  onPay: (method: "apple_pay" | "mb_way", approved: boolean) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  const pay = async (method: "apple_pay" | "mb_way", approved = true) => {
    setBusy(true);
    await onPay(method, approved);
  };
  return (
    <dialog
      ref={ref}
      aria-label={t.pay.sheetLabel}
      onClose={onClose}
      className="m-0 mt-auto w-full max-w-none rounded-t-3xl bg-paper p-0 text-ink backdrop:bg-ink/50 sm:m-auto sm:max-w-md sm:rounded-3xl"
    >
      <div className="px-5 pt-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="flex items-start justify-between">
          <h2 className="font-[family-name:var(--font-display)] text-2xl">{t.pay.payAmount(formatEur(amountCents))}</h2>
          <button type="button" onClick={onClose} className="-mt-1 -mr-2 p-2 text-2xl leading-none text-ink-soft" aria-label={t.product.close}>
            ×
          </button>
        </div>
        <p className="mt-2 rounded-lg border border-dashed border-brand px-3 py-2 text-xs">
          <strong>{t.pay.testTitle}</strong> {t.pay.testBody}
        </p>
        <div className="mt-4 grid gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => pay("apple_pay")}
            className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-black text-lg font-semibold text-white disabled:opacity-50"
          >
            Apple Pay <span className="text-xs font-normal opacity-70">{t.pay.simulated}</span>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => pay("mb_way")}
            className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-[#d60511] text-lg font-semibold text-white disabled:opacity-50"
          >
            MB WAY <span className="text-xs font-normal opacity-80">{t.pay.simulated}</span>
          </button>
          <button type="button" disabled={busy} onClick={() => pay("mb_way", false)} className="text-sm text-ink-soft underline">
            {t.pay.simulateDecline}
          </button>
        </div>
      </div>
    </dialog>
  );
}
