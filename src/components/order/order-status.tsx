"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatEur } from "@/lib/money";
import type { OrderView } from "@/server/orders/order-view";
import { MockPaySheet } from "./mock-pay-sheet";
import { backoffSchedule, usePolling } from "../use-polling";
import { useI18n } from "../i18n/i18n-provider";
import { apiErrorText, type Messages } from "@/lib/i18n/messages";

// Só se pergunta enquanto o pedido ainda pode mudar sem o cliente fazer nada. Depois de
// "Confirmado" pára (o POS atual não envia "em preparação"/"servido").
const PENDING = new Set<OrderView["status"]>(["AWAITING_PAYMENT", "RECEIVED", "SUBMITTING", "FAILED_RETRYING", "SUBMITTED"]);
// 3 s no 1.º minuto, 10 s até aos 10 min, 30 s até à meia hora; depois pára (há o botão "Atualizar").
const ORDER_POLL = backoffSchedule([[60_000, 3_000], [10 * 60_000, 10_000], [30 * 60_000, 30_000]]);

// Só ACCEPTED diz "Confirmado" (docs/02-ARQUITETURA.md §4). Os estados intermédios da fila mostram "Enviado".
const STATUS_COPY_KEY = {
  AWAITING_PAYMENT: "AWAITING_PAYMENT",
  RECEIVED: "SENT",
  SUBMITTING: "SENT",
  FAILED_RETRYING: "SENT",
  SUBMITTED: "SENT",
  ACCEPTED: "ACCEPTED",
  IN_PREPARATION: "IN_PREPARATION",
  SERVED: "SERVED",
  REJECTED: "REJECTED",
  CANCELLED: "CANCELLED",
  NEEDS_ATTENTION: "NEEDS_ATTENTION",
} as const satisfies Record<OrderView["status"], keyof Messages["order"]["status"]>;
const TONE: Record<OrderView["status"], "ok" | "wait" | "bad"> = {
  AWAITING_PAYMENT: "wait",
  RECEIVED: "wait",
  SUBMITTING: "wait",
  FAILED_RETRYING: "wait",
  SUBMITTED: "wait",
  ACCEPTED: "ok",
  IN_PREPARATION: "ok",
  SERVED: "ok",
  REJECTED: "bad",
  CANCELLED: "bad",
  NEEDS_ATTENTION: "bad",
};

export function OrderStatus({ initial, tableToken, autoPay = false }: { initial: OrderView; tableToken: string; autoPay?: boolean }) {
  const { locale, t } = useI18n();
  const [order, setOrder] = useState(initial);
  const [paying, setPaying] = useState<{ paymentId: string; amountCents: number } | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const reload = async () => {
    const res = await fetch(`/api/orders/${order.id}?mesa=${encodeURIComponent(tableToken)}`, { cache: "no-store" }).catch(() => null);
    if (res?.ok) setOrder((await res.json()).order);
  };

  async function startPayment() {
    setStarting(true);
    setPayError(null);
    const res = await fetch(`/api/mesa/${tableToken}/pedidos/${order.id}/pagamento`, { method: "POST" }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setStarting(false);
    if (!res?.ok) {
      await reload(); // pode já estar pago ou ter expirado
      return setPayError(res ? apiErrorText(t, locale, data, t.apiError.generic) : t.pay.offline);
    }
    if (data.provider !== "mock") return setPayError(t.pay.notConfigured);
    setPaying({ paymentId: data.paymentId, amountCents: data.amountCents });
  }

  async function finishMock(method: "apple_pay" | "mb_way", approved: boolean) {
    if (!paying) return;
    const res = await fetch(`/api/pagamentos/simulado/${paying.paymentId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: tableToken, method, approved }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setPaying(null);
    if (data.status !== "SUCCEEDED") setPayError(approved ? t.pay.notConfirmed : t.pay.declined);
    await reload();
  }

  // Vindo do carrinho ("Pagar e pedir"): abrir logo o pagamento, uma vez.
  const [autoStarted, setAutoStarted] = useState(false);
  useEffect(() => {
    if (autoPay && !autoStarted && order.status === "AWAITING_PAYMENT") {
      setAutoStarted(true);
      void startPayment();
    }
  }, [autoPay, autoStarted, order.status]);

  usePolling(reload, { enabled: PENDING.has(order.status), intervalFor: ORDER_POLL });

  const copy = { ...t.order.status[STATUS_COPY_KEY[order.status]], tone: TONE[order.status] };
  const toneClass = { ok: "bg-[#ecfdf3] text-ok", wait: "bg-brand-soft text-brand", bad: "bg-ink text-paper" }[copy.tone];

  return (
    <main className="mx-auto max-w-2xl px-4 pt-8 pb-16">
      <p className="flex justify-between text-sm font-medium text-brand">
        <span>{order.tableLabel}</span>
        <span>
          {t.order.orderNo} <span className="tabular-nums">{order.shortCode}</span>
        </span>
      </p>
      <div role="status" aria-live="polite" className={`mt-3 rounded-2xl px-5 py-5 ${toneClass}`}>
        <p className="flex items-center gap-2 font-[family-name:var(--font-display)] text-3xl">
          {copy.tone === "ok" && <span aria-hidden="true">✓</span>}
          {copy.tone === "wait" && (
            <span aria-hidden="true" className="size-3 animate-pulse rounded-full bg-current motion-reduce:animate-none" />
          )}
          {copy.title}
        </p>
        <p className="mt-1 text-sm">{copy.body}</p>
        {PENDING.has(order.status) && (
          <button type="button" onClick={() => void reload()} className="mt-2 text-sm underline">
            {t.order.refresh}
          </button>
        )}
      </div>

      {order.status === "AWAITING_PAYMENT" && (
        <div className="mt-4">
          <button
            type="button"
            onClick={startPayment}
            disabled={starting}
            className="flex min-h-14 w-full items-center justify-between rounded-2xl bg-brand px-5 font-semibold text-white disabled:opacity-50"
          >
            <span>{starting ? t.order.preparing : t.order.payAndSend}</span>
            <span className="tabular-nums">{formatEur(order.totalCents)}</span>
          </button>
          <p className="mt-2 text-center text-xs text-ink-soft">{t.order.payNote}</p>
        </div>
      )}
      {payError && (
        <p role="alert" className="mt-3 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          {payError}
        </p>
      )}
      {paying && <MockPaySheet amountCents={paying.amountCents} onPay={finishMock} onClose={() => setPaying(null)} />}

      <h2 className="mt-8 text-sm font-semibold tracking-wide text-ink-soft uppercase">{t.order.summary}</h2>
      <ul className="mt-2 divide-y divide-line rounded-2xl border border-line bg-card px-4">
        {order.lines.map((l, i) => (
          <li key={i} className="flex justify-between gap-3 py-3">
            <div className="min-w-0">
              <p>
                <span className="font-semibold tabular-nums">{l.quantity}×</span> {l.name}
              </p>
              {l.modifierNames.length > 0 && <p className="text-sm text-ink-soft">{l.modifierNames.join(" · ")}</p>}
              {l.notes && <p className="text-sm text-ink-soft italic">“{l.notes}”</p>}
            </div>
            <p className="shrink-0 tabular-nums">{formatEur(l.lineTotalCents)}</p>
          </li>
        ))}
        <li className="flex justify-between py-3 font-semibold">
          <span>{t.order.total}</span>
          <span className="tabular-nums">{formatEur(order.totalCents)}</span>
        </li>
      </ul>
      {order.notes && <p className="mt-3 text-sm text-ink-soft">
          {t.order.note} “{order.notes}”
        </p>}

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        <Link
          href={`/m/${tableToken}`}
          className="flex min-h-14 items-center justify-center rounded-2xl border border-brand font-semibold text-brand"
        >
          {t.order.backToMenu}
        </Link>
        <Link
          href={`/m/${tableToken}/conta`}
          className="flex min-h-14 items-center justify-center rounded-2xl border border-line bg-card font-semibold"
        >
          {order.orderingMode === "pay_first" ? t.menu.myOrders : t.order.viewBill}
        </Link>
      </div>
      <p className="mt-4 text-center text-xs text-ink-soft">
        {order.orderingMode === "pay_first"
          ? order.status === "AWAITING_PAYMENT"
            ? t.order.paidInAppBefore
            : t.order.paidInAppBring
          : t.order.payAtEnd}
      </p>
    </main>
  );
}
