"use client";

import { useState } from "react";
import { MockPaySheet } from "./mock-pay-sheet";
import { StripePaySheet, waitForPayment } from "./stripe-pay-sheet";
import { backoffSchedule, usePolling } from "../use-polling";
import Link from "next/link";
import { formatEur } from "@/lib/money";
import type { BillOrder, TableBill } from "@/server/tables/table-sessions";
import { useI18n } from "../i18n/i18n-provider";
import { apiErrorText, LOCALE_TAGS, type Messages } from "@/lib/i18n/messages";

const TIP_OPTIONS = [0, 5, 10, 15];

// 10 s nos primeiros 5 min, 30 s até à meia hora, depois 60 s; parado com o ecrã bloqueado.
const BILL_POLL = backoffSchedule([[5 * 60_000, 10_000], [30 * 60_000, 30_000]], 60_000);

function orderLabel(o: BillOrder, t: Messages): { text: string; className: string } {
  if (o.void) return { text: t.bill.cancelled, className: "bg-line text-ink-soft" };
  if (o.awaitingPayment) return { text: t.bill.unpaid, className: "bg-amber-100 text-amber-900" };
  if (o.pending) return { text: t.bill.awaiting, className: "bg-brand-soft text-brand" };
  return { text: t.bill.confirmed, className: "bg-[#ecfdf3] text-ok" };
}

/** Conta da mesa vista pelo cliente: todos os pedidos desde que a mesa abriu. */
export function TableBillView({ initial, tableToken }: { initial: TableBill; tableToken: string }) {
  const { locale, t } = useI18n();
  const [bill, setBill] = useState(initial);
  const [paying, setPaying] = useState<{ paymentId: string; amountCents: number; provider: string; clientSecret?: string; accountId?: string } | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [justPaid, setJustPaid] = useState(false);
  const [starting, setStarting] = useState(false);
  // Gorjeta em percentagem do que falta pagar (0 = sem gorjeta).
  const [tipPct, setTipPct] = useState(0);
  // Fatura com NIF por email (só se o restaurante tiver o programa de faturação ligado).
  const [wantInvoice, setWantInvoice] = useState(false);
  const [nif, setNif] = useState("");
  const [email, setEmail] = useState("");

  async function startPayment() {
    const nifDigits = nif.replace(/\s/g, "");
    if (wantInvoice && ((nifDigits && !/^\d{9}$/.test(nifDigits)) || !/^\S+@\S+\.\S+$/.test(email.trim()))) {
      return setPayError(t.bill.invoiceInvalid);
    }
    setStarting(true);
    setPayError(null);
    const res = await fetch(`/api/mesa/${tableToken}/pagamento`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipCents, ...(wantInvoice ? { fatura: { nif: nifDigits, email: email.trim() } } : {}) }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setStarting(false);
    if (!res?.ok) return setPayError(res ? apiErrorText(t, locale, data, t.apiError.generic) : t.pay.offline);
    if (data.provider === "stripe" && data.clientSecret && data.accountId) {
      return setPaying({ paymentId: data.paymentId, amountCents: data.amountCents, provider: "stripe", clientSecret: data.clientSecret, accountId: data.accountId });
    }
    if (data.provider !== "mock") return setPayError(t.pay.notConfigured);
    setPaying({ paymentId: data.paymentId, amountCents: data.amountCents, provider: data.provider });
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
    if (data.bill) setBill(data.bill);
    if (data.status === "SUCCEEDED") setJustPaid(true);
    else setPayError(approved ? t.pay.notConfirmed : t.pay.declined);
  }

  usePolling(
    async () => {
      const res = await fetch(`/api/mesa/${tableToken}/conta`, { cache: "no-store" }).catch(() => null);
      if (res?.ok) setBill((await res.json()).bill);
    },
    { enabled: true, intervalFor: BILL_POLL },
  );

  const time = (iso: string) => new Date(iso).toLocaleTimeString(LOCALE_TAGS[locale], { hour: "2-digit", minute: "2-digit" });
  const hasPending = bill.orders.some((o) => o.pending);
  const fullyPaid = bill.totalCents > 0 && bill.dueCents === 0;
  const tipCents = Math.round((bill.dueCents * tipPct) / 100);

  return (
    <main className="mx-auto max-w-2xl px-4 pt-8 pb-16">
      <p className="text-sm font-medium text-brand">{bill.tableLabel}</p>
      <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl">{t.bill.title}</h1>

      {!bill.openedAt ? (
        <p className="mt-6 rounded-2xl border border-dashed border-line px-6 py-10 text-center text-ink-soft">
          {t.bill.empty}
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-ink-soft">
            {t.bill.openedAt(time(bill.openedAt))}
          </p>
          <ul className="mt-6 grid gap-3">
            {bill.orders.map((o) => {
              const label = orderLabel(o, t);
              return (
                <li key={o.id} className={`rounded-2xl border border-line bg-card p-4 ${o.void ? "opacity-60" : ""}`}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold">
                      {t.order.orderNo} <span className="tabular-nums">{o.shortCode}</span>{" "}
                      <span className="text-sm font-normal text-ink-soft">{t.bill.at(time(o.createdAt))}</span>
                    </p>
                    {o.awaitingPayment ? (
                      <Link
                        href={`/m/${tableToken}/pedido/${o.id}?pagar=1`}
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold underline ${label.className}`}
                      >
                        {t.bill.unpaidPay}
                      </Link>
                    ) : (
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${label.className}`}>{label.text}</span>
                    )}
                  </div>
                  <ul className={`mt-2 grid gap-1 text-sm ${o.void ? "line-through" : ""}`}>
                    {o.lines.map((l, i) => (
                      <li key={i} className="flex justify-between gap-3">
                        <span className="min-w-0">
                          <span className="font-semibold tabular-nums">{l.quantity}×</span> {l.name}
                          {l.modifierNames.length > 0 && <span className="text-ink-soft"> · {l.modifierNames.join(", ")}</span>}
                        </span>
                        <span className="shrink-0 tabular-nums">{formatEur(l.lineTotalCents)}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>

          <div className="mt-6 flex items-baseline justify-between rounded-2xl bg-ink px-5 py-4 text-paper">
            <span className="font-semibold">{t.bill.tableTotal}</span>
            <span className="text-2xl font-semibold tabular-nums">{formatEur(bill.totalCents)}</span>
          </div>
          {hasPending && (
            <p className="mt-2 text-sm text-ink-soft">{t.bill.includesPending}</p>
          )}

          {bill.pendingPaymentCents > 0 && !fullyPaid && (
            <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {t.bill.paymentInProgress(formatEur(bill.pendingPaymentCents))}
            </p>
          )}
          {bill.paidCents > 0 && !fullyPaid && (
            <p className="mt-3 flex justify-between rounded-xl bg-[#ecfdf3] px-4 py-3 text-sm text-ok">
              <span>{t.bill.alreadyPaid(formatEur(bill.paidCents))}</span>
              <strong>{t.bill.due(formatEur(bill.dueCents))}</strong>
            </p>
          )}

          {fullyPaid ? (
            <div role="status" className="mt-4 rounded-2xl bg-[#ecfdf3] px-5 py-4 text-ok">
              <p className="font-[family-name:var(--font-display)] text-2xl">{t.bill.paid}</p>
              <p className="mt-1 text-sm">
                {justPaid ? t.bill.thanksJustPaid : t.bill.thanksPaid}
              </p>
              {bill.tipCents > 0 && <p className="mt-1 text-sm">{t.bill.tipsLeft(formatEur(bill.tipCents))}</p>}
            </div>
          ) : bill.paymentsEnabled ? (
            <div className="mt-4">
              {hasPending ? (
                <p className="rounded-xl bg-brand-soft px-4 py-3 text-sm">
                  {t.bill.waitConfirmation}
                </p>
              ) : (
                <>
                  <fieldset className="mb-3">
                    <legend className="mb-2 text-sm font-semibold">{t.bill.tipTitle}</legend>
                    <div className="grid grid-cols-4 gap-2">
                      {TIP_OPTIONS.map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          aria-pressed={tipPct === pct}
                          onClick={() => setTipPct(pct)}
                          className={`min-h-12 rounded-xl border text-sm font-semibold ${tipPct === pct ? "border-brand bg-brand-soft text-brand" : "border-line bg-card"}`}
                        >
                          {pct === 0 ? t.bill.tipNone : `${pct}%`}
                          {pct > 0 && <span className="block text-xs font-normal text-ink-soft tabular-nums">{formatEur(Math.round((bill.dueCents * pct) / 100))}</span>}
                        </button>
                      ))}
                    </div>
                    <p className="mt-1 text-xs text-ink-soft">{t.bill.tipNote}</p>
                  </fieldset>
                  {bill.invoicing && (
                    <div className="mb-3 rounded-2xl border border-line bg-card p-3">
                      <label className="flex items-center gap-3 text-sm font-semibold">
                        <input type="checkbox" className="size-5" checked={wantInvoice} onChange={(e) => setWantInvoice(e.target.checked)} />
                        {t.bill.wantInvoice}
                      </label>
                      {wantInvoice && (
                        <div className="mt-3 grid gap-2">
                          <label className="text-sm">
                            {t.bill.invoiceNif}
                            <input
                              className="mt-1 block w-full rounded-xl border border-line bg-paper px-3 py-2.5 tabular-nums"
                              value={nif}
                              onChange={(e) => setNif(e.target.value.replace(/[^\d ]/g, "").slice(0, 11))}
                              inputMode="numeric"
                              autoComplete="off"
                            />
                          </label>
                          <label className="text-sm">
                            {t.bill.invoiceEmail}
                            <input
                              className="mt-1 block w-full rounded-xl border border-line bg-paper px-3 py-2.5"
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              type="email"
                              inputMode="email"
                              autoComplete="email"
                              required
                            />
                          </label>
                          <p className="text-xs text-ink-soft">{t.bill.invoiceHint}</p>
                        </div>
                      )}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={startPayment}
                    disabled={starting}
                    className="flex min-h-14 w-full items-center justify-between rounded-2xl bg-brand px-5 font-semibold text-white disabled:opacity-50"
                  >
                    <span>{starting ? t.order.preparing : t.bill.payBill}</span>
                    <span className="tabular-nums">{formatEur(bill.dueCents + tipCents)}</span>
                  </button>
                  {tipCents > 0 && <p className="mt-1 text-center text-xs text-ink-soft">{t.bill.tipIncluded(formatEur(tipCents))}</p>}
                </>
              )}
              <p className="mt-2 text-center text-xs text-ink-soft">{t.bill.methods}</p>
            </div>
          ) : (
            <p className="mt-4 rounded-xl bg-brand-soft px-4 py-3 text-sm">
              <strong>{t.bill.callStaffTitle}</strong> {t.bill.callStaffBody}
            </p>
          )}
          {payError && (
            <p role="alert" className="mt-3 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
              {payError}
            </p>
          )}
        </>
      )}

      <Link
        href={`/m/${tableToken}`}
        className="mt-8 flex min-h-14 items-center justify-center rounded-2xl border border-brand font-semibold text-brand"
      >
        {t.order.backToMenu}
      </Link>

      {waiting && (
        <p role="status" className="fixed inset-x-4 bottom-4 z-30 mx-auto max-w-md rounded-2xl bg-ink px-5 py-4 text-sm text-paper shadow-lg">
          {t.pay.waiting}
        </p>
      )}
      {paying?.provider === "stripe" && paying.clientSecret && paying.accountId ? (
        <StripePaySheet
          clientSecret={paying.clientSecret}
          accountId={paying.accountId}
          amountCents={paying.amountCents}
          onClose={() => setPaying(null)}
          onSubmitted={async () => {
            const id = paying.paymentId;
            setPaying(null);
            setWaiting(true);
            const r = await waitForPayment(tableToken, id);
            setWaiting(false);
            if (r?.bill) setBill(r.bill as TableBill);
            if (r?.status === "SUCCEEDED") setJustPaid(true);
            else if (r && r.status !== "PENDING") setPayError(t.pay.declined);
          }}
        />
      ) : (
        paying && <MockPaySheet amountCents={paying.amountCents} onPay={finishMock} onClose={() => setPaying(null)} />
      )}
    </main>
  );
}
