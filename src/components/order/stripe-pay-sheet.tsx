"use client";

import { useEffect, useRef, useState } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { formatEur } from "@/lib/money";
import { useI18n } from "../i18n/i18n-provider";

/**
 * Pagamento real com a Stripe: o formulário (Payment Element) é da Stripe, dentro de um iframe,
 * e mostra o que o telemóvel e a conta do restaurante suportam (Apple Pay, Google Pay, MB WAY,
 * cartão). Os dados do cliente nunca passam pela MESVIO. O pagamento é na conta do restaurante.
 */
const stripes = new Map<string, Promise<Stripe | null>>();
function stripeFor(accountId: string): Promise<Stripe | null> {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
  if (!stripes.has(accountId)) stripes.set(accountId, loadStripe(key, { stripeAccount: accountId }));
  return stripes.get(accountId)!;
}

export function StripePaySheet({
  clientSecret,
  accountId,
  amountCents,
  onSubmitted,
  onClose,
}: {
  clientSecret: string;
  accountId: string;
  amountCents: number;
  /** O cliente confirmou: o servidor confirma junto da Stripe (pode ainda estar a processar, ex.: MB WAY). */
  onSubmitted: () => void;
  onClose: () => void;
}) {
  const { locale, t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  const brand = typeof window !== "undefined" ? getComputedStyle(document.documentElement).getPropertyValue("--color-brand").trim() : "";

  return (
    <dialog
      ref={ref}
      aria-label={t.pay.sheetLabel}
      onClose={onClose}
      className="m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-y-auto rounded-t-3xl bg-paper p-0 text-ink backdrop:bg-ink/50 sm:m-auto sm:max-w-md sm:rounded-3xl"
    >
      <div className="px-5 pt-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="flex items-start justify-between">
          <h2 className="font-[family-name:var(--font-display)] text-2xl">{t.pay.payAmount(formatEur(amountCents))}</h2>
          <button type="button" onClick={onClose} className="-mt-1 -mr-2 p-2 text-2xl leading-none text-ink-soft" aria-label={t.product.close}>
            ×
          </button>
        </div>
        <Elements
          stripe={stripeFor(accountId)}
          options={{
            clientSecret,
            locale: locale === "en" ? "en" : "pt",
            appearance: { theme: "stripe", variables: { colorPrimary: brand || "#062d25", borderRadius: "12px" } },
          }}
        >
          <PayForm amountCents={amountCents} onSubmitted={onSubmitted} />
        </Elements>
      </div>
    </dialog>
  );
}

function PayForm({ amountCents, onSubmitted }: { amountCents: number; onSubmitted: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setError(null);
    // Sem sair da página (Apple Pay, cartão, MB WAY); 3-D Secure abre por cima e volta.
    const { error: err } = await stripe.confirmPayment({ elements, redirect: "if_required", confirmParams: { return_url: window.location.href } });
    setBusy(false);
    if (err) return setError(err.message ?? t.pay.notConfirmed);
    onSubmitted();
  }

  return (
    <form onSubmit={pay} className="mt-4 grid gap-4">
      <PaymentElement options={{ layout: "tabs", wallets: { applePay: "auto", googlePay: "auto" } }} />
      {error && (
        <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={!stripe || busy}
        className="flex min-h-14 items-center justify-center rounded-2xl bg-brand px-5 font-semibold text-white disabled:opacity-50"
      >
        <span>{busy ? t.order.preparing : t.pay.payAmount(formatEur(amountCents))}</span>
      </button>
    </form>
  );
}

/**
 * Depois de o cliente confirmar: pergunta ao servidor (que confirma na Stripe) até deixar de estar
 * pendente. MB WAY pode demorar até o cliente aprovar na app; o webhook atualiza também.
 */
export async function waitForPayment(tableToken: string, paymentId: string, { tries = 40, everyMs = 1500 } = {}): Promise<{ status: string; bill?: unknown } | null> {
  let last: { status: string; bill?: unknown } | null = null;
  for (let i = 0; i < tries; i++) {
    const res = await fetch(`/api/mesa/${tableToken}/pagamento/${paymentId}`, { cache: "no-store" }).catch(() => null);
    if (res?.ok) {
      last = await res.json();
      if (last && last.status !== "PENDING") return last;
    }
    await new Promise((r) => setTimeout(r, everyMs));
  }
  return last;
}
