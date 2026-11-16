"use client";

import { useState } from "react";
import { CallStaff } from "./call-staff";
import { ReviewPrompt } from "./review-prompt";
import { MockPaySheet } from "./mock-pay-sheet";
import { StripePaySheet, waitForPayment } from "./stripe-pay-sheet";
import { backoffSchedule, usePolling } from "../use-polling";
import Link from "next/link";
import { formatEur } from "@/lib/money";
import { maxTipCents, parseTipEuros } from "@/lib/tip";
import type { BillOrder, TableBill } from "@/server/tables/table-sessions";
import { useI18n } from "../i18n/i18n-provider";
import { apiErrorText, LOCALE_TAGS, type Messages } from "@/lib/i18n/messages";

/** Gorjetas rápidas em cêntimos; "Outro" deixa escrever o valor. */
const TIP_PRESETS = [100, 200];

/** Identifica este telemóvel nos pagamentos da conta dividida (fica no browser; sem dados pessoais). */
function payerKey(): string {
  try {
    const saved = localStorage.getItem("mesvio:pagador");
    if (saved && /^[A-Za-z0-9_-]{8,64}$/.test(saved)) return saved;
    const key = crypto.randomUUID();
    localStorage.setItem("mesvio:pagador", key);
    return key;
  } catch {
    return crypto.randomUUID();
  }
}

// 10 s nos primeiros 5 min, 30 s até à meia hora, depois 60 s; parado com o ecrã bloqueado.
const BILL_POLL = backoffSchedule([[5 * 60_000, 10_000], [30 * 60_000, 30_000]], 60_000);

function orderLabel(o: BillOrder, t: Messages): { text: string; className: string } {
  if (o.void) return { text: t.bill.cancelled, className: "bg-line text-ink-soft" };
  if (o.awaitingPayment) return { text: t.bill.unpaid, className: "bg-amber-100 text-amber-900" };
  if (o.pending) return { text: t.bill.awaiting, className: "bg-brand-soft text-brand" };
  return { text: t.bill.confirmed, className: "bg-[#ecfdf3] text-ok" };
}

/** Conta da mesa vista pelo cliente: todos os pedidos desde que a mesa abriu. */

/**
 * Dividir a conta no telemóvel (Tudo / Partes iguais / O que consumi): escondido a 2026-11-15 a
 * pedido do Rodrigo, por confundir quem paga. Com isto desligado, cada pagamento é a conta toda.
 */
const SPLIT_BILL_ON_PHONE = false;
export function TableBillView({ initial, tableToken }: { initial: TableBill; tableToken: string }) {
  const { locale, t } = useI18n();
  const [bill, setBill] = useState(initial);
  const [paying, setPaying] = useState<{ paymentId: string; amountCents: number; provider: string; clientSecret?: string; accountId?: string } | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [justPaid, setJustPaid] = useState(false);
  const [starting, setStarting] = useState(false);
  // Gorjeta em euros: nenhuma, um valor rápido ou outro valor escrito pelo cliente.
  const [tipChoice, setTipChoice] = useState<number | "other">(0);
  const [tipText, setTipText] = useState("");
  // Fatura com NIF por email (só se o restaurante tiver o programa de faturação ligado).
  const [wantInvoice, setWantInvoice] = useState(false);
  const [nif, setNif] = useState("");
  const [email, setEmail] = useState("");
  // Conta dividida: pagar tudo, uma parte igual ou só o que esta pessoa consumiu.
  const [split, setSplit] = useState<"all" | "equal" | "items">("all");
  const [people, setPeople] = useState(2);
  const [picked, setPicked] = useState<Set<string>>(new Set());

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
      body: JSON.stringify({
        tipCents,
        ...(wantInvoice ? { fatura: { nif: nifDigits, email: email.trim() } } : {}),
        ...(shareCents !== null ? { parte: { cents: shareCents, payerKey: payerKey() } } : {}),
      }),
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
  // O que esta pessoa vai pagar. `shareCents` = null → paga tudo da forma habitual.
  const available = Math.max(0, bill.dueCents - bill.pendingPaymentCents);
  const lines = bill.orders
    .filter((o) => !o.void && !o.awaitingPayment)
    .flatMap((o) => o.lines.map((l, i) => ({ key: `${o.id}:${i}`, ...l })));
  const wanted =
    split === "equal"
      ? Math.ceil(bill.totalCents / people)
      : split === "items"
        ? lines.filter((l) => picked.has(l.key)).reduce((acc, l) => acc + l.lineTotalCents, 0)
        : available;
  // Com outra pessoa a pagar (ex.: MB WAY por aprovar), "Tudo" paga só o resto, sem cancelar o dela.
  const shareCents = split === "all" && bill.pendingPaymentCents === 0 ? null : Math.min(wanted, available);
  const payCents = shareCents ?? bill.dueCents;
  const capped = split !== "all" && wanted > available;
  const tipMax = maxTipCents(payCents);
  const typedTip = tipChoice === "other" ? parseTipEuros(tipText) : null;
  const tipCents = tipChoice === "other" ? Math.min(typedTip ?? 0, tipMax) : tipChoice;
  const tipInvalid = tipChoice === "other" && (typedTip === null || typedTip > tipMax);

  return (
    <main className={`mx-auto max-w-2xl px-4 pt-8 ${bill.paymentsEnabled && !fullyPaid && bill.dueCents > 0 ? "pb-40" : "pb-16"}`}>
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
          <section className="mt-6 rounded-3xl border border-line bg-card">
            <ul className="divide-y divide-line">
              {bill.orders.map((o) => {
                const label = orderLabel(o, t);
                const confirmed = !o.void && !o.awaitingPayment && !o.pending;
                return (
                  <li key={o.id} className={`px-5 py-4 ${o.void ? "opacity-60" : ""}`}>
                    <div className="flex items-center justify-between gap-3 text-xs text-ink-soft">
                      <span>
                        {t.order.orderNo} <span className="tabular-nums">{o.shortCode}</span> · {time(o.createdAt)}
                      </span>
                      {o.awaitingPayment ? (
                        <Link href={`/m/${tableToken}/pedido/${o.id}?pagar=1`} className={`rounded-full px-2.5 py-0.5 font-semibold underline ${label.className}`}>
                          {t.bill.unpaidPay}
                        </Link>
                      ) : (
                        !confirmed && <span className={`rounded-full px-2.5 py-0.5 font-semibold ${label.className}`}>{label.text}</span>
                      )}
                    </div>
                    <ul className={`mt-2 grid gap-1.5 ${o.void ? "line-through" : ""}`}>
                      {o.lines.map((l, i) => (
                        <li key={i} className="flex justify-between gap-3">
                          <span className="min-w-0">
                            <span className="font-semibold tabular-nums">{l.quantity}×</span> {l.name}
                            {l.modifierNames.length > 0 && <span className="block text-sm text-ink-soft">{l.modifierNames.join(", ")}</span>}
                          </span>
                          <span className="shrink-0 tabular-nums">{formatEur(l.lineTotalCents)}</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
            <div className="flex items-baseline justify-between border-t-2 border-ink px-5 py-4">
              <span className="font-semibold">{t.bill.tableTotal}</span>
              <span className="text-2xl font-semibold tabular-nums">{formatEur(bill.totalCents)}</span>
            </div>
          </section>
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

          {!fullyPaid && bill.dueCents > 0 && !bill.paymentsEnabled && (
            <CallStaff tableToken={tableToken} action="bill" review={bill.reviews.enabled ? { googleUrl: bill.reviews.googleUrl } : null} />
          )}
          {/* Sem pagamentos na app, a avaliação aparece quando o cliente pede a conta (no CallStaff). */}

          {fullyPaid ? (
            <>
              <div role="status" className="mt-4 rounded-2xl bg-[#ecfdf3] px-5 py-4 text-ok">
                <p className="font-[family-name:var(--font-display)] text-2xl">{t.bill.paid}</p>
                <p className="mt-1 text-sm">
                  {justPaid ? t.bill.thanksJustPaid : t.bill.thanksPaid}
                </p>
                {bill.tipCents > 0 && <p className="mt-1 text-sm">{t.bill.tipsLeft(formatEur(bill.tipCents))}</p>}
              </div>
              {bill.reviews.enabled && <ReviewPrompt tableToken={tableToken} googleUrl={bill.reviews.googleUrl} />}
            </>
          ) : bill.paymentsEnabled ? (
            <div className="mt-4">
              {hasPending ? (
                <p className="rounded-xl bg-brand-soft px-4 py-3 text-sm">
                  {t.bill.waitConfirmation}
                </p>
              ) : (
                <>
                  {SPLIT_BILL_ON_PHONE && (
                  <fieldset className="mb-3">
                    <legend className="mb-2 text-sm font-semibold">{t.bill.splitTitle}</legend>
                    <div className="grid grid-cols-3 gap-2">
                      {(
                        [
                          ["all", t.bill.splitAll],
                          ["equal", t.bill.splitEqual],
                          ["items", t.bill.splitItems],
                        ] as const
                      ).map(([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          aria-pressed={split === key}
                          onClick={() => setSplit(key)}
                          className={`min-h-12 rounded-xl border text-sm font-semibold ${split === key ? "border-brand bg-brand-soft text-brand" : "border-line bg-card"}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {split === "equal" && (
                      <div className="mt-3 rounded-2xl border border-line bg-card p-3">
                        <div className="flex items-center justify-center gap-4">
                          <button
                            type="button"
                            aria-label="−"
                            disabled={people <= 2}
                            onClick={() => setPeople((n) => Math.max(2, n - 1))}
                            className="size-11 rounded-xl border border-line bg-paper text-lg font-semibold disabled:opacity-40"
                          >
                            −
                          </button>
                          <span className="min-w-24 text-center font-semibold">{t.bill.splitPeople(people)}</span>
                          <button
                            type="button"
                            aria-label="+"
                            disabled={people >= 20}
                            onClick={() => setPeople((n) => Math.min(20, n + 1))}
                            className="size-11 rounded-xl border border-line bg-paper text-lg font-semibold disabled:opacity-40"
                          >
                            +
                          </button>
                        </div>
                        <p className="mt-2 text-center text-xs text-ink-soft">{t.bill.splitEqualHint}</p>
                      </div>
                    )}
                    {split === "items" && (
                      <div className="mt-3 rounded-2xl border border-line bg-card p-3">
                        <p className="mb-2 text-xs text-ink-soft">{t.bill.splitItemsHint}</p>
                        <ul className="grid gap-1">
                          {lines.map((l) => (
                            <li key={l.key}>
                              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl bg-paper px-3 text-sm">
                                <input
                                  type="checkbox"
                                  className="size-5"
                                  checked={picked.has(l.key)}
                                  onChange={() =>
                                    setPicked((p) => {
                                      const next = new Set(p);
                                      if (next.has(l.key)) next.delete(l.key);
                                      else next.add(l.key);
                                      return next;
                                    })
                                  }
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="font-semibold tabular-nums">{l.quantity}×</span> {l.name}
                                </span>
                                <span className="tabular-nums">{formatEur(l.lineTotalCents)}</span>
                              </label>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {capped && <p className="mt-2 text-sm text-amber-800">{t.bill.splitCapped(formatEur(available))}</p>}
                  </fieldset>
                  )}
                  <fieldset className="mb-4">
                    <legend className="mb-2 text-sm font-semibold">{t.bill.tipTitle}</legend>
                    <div className="grid grid-cols-4 gap-1 rounded-2xl bg-line/50 p-1">
                      {([0, ...TIP_PRESETS, "other"] as const).map((choice) => (
                        <button
                          key={choice}
                          type="button"
                          aria-pressed={tipChoice === choice}
                          onClick={() => setTipChoice(choice)}
                          className={`min-h-12 rounded-xl px-1 text-sm font-semibold leading-tight ${tipChoice === choice ? "bg-card text-brand shadow-sm" : "text-ink-soft"}`}
                        >
                          {choice === 0 ? t.bill.tipNone : choice === "other" ? t.bill.tipOther : formatEur(choice)}
                        </button>
                      ))}
                    </div>
                    {tipChoice === "other" && (
                      <label className="mt-2 flex items-center gap-2 rounded-2xl border-2 border-line bg-card px-4 focus-within:border-brand">
                        <span className="sr-only">{t.bill.tipAmount}</span>
                        <input
                          id="gorjeta-valor"
                          value={tipText}
                          onChange={(e) => setTipText(e.target.value.replace(/[^\d.,]/g, "").slice(0, 6))}
                          inputMode="decimal"
                          autoComplete="off"
                          autoFocus
                          placeholder="0,00"
                          aria-label={t.bill.tipAmount}
                          className="min-h-12 w-full bg-transparent text-lg font-semibold tabular-nums"
                          // O contorno de foco fica na caixa à volta (borda verde), não no campo.
                          style={{ outline: "none" }}
                        />
                        <span className="text-lg font-semibold text-ink-soft">€</span>
                      </label>
                    )}
                    <p className={`mt-1.5 text-xs ${tipInvalid ? "text-danger" : "text-ink-soft"}`}>
                      {tipInvalid ? t.bill.tipTooHigh(formatEur(tipMax)) : t.bill.tipNote}
                    </p>
                  </fieldset>
                  {bill.invoicing && (
                    <div className={`mb-3 rounded-2xl ${wantInvoice ? "border border-line bg-card p-3" : "px-1 py-1"}`}>
                      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold">
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
                  <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-paper/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
                    <div className="mx-auto max-w-2xl">
                      <button
                        type="button"
                        onClick={startPayment}
                        disabled={starting || payCents <= 0 || tipInvalid}
                        className="flex min-h-14 w-full items-center justify-between rounded-2xl bg-brand px-5 text-lg font-semibold text-white disabled:opacity-50"
                      >
                        <span>
                          {starting ? t.order.preparing : split !== "all" ? t.bill.payShare : shareCents !== null ? t.bill.payRest : t.bill.payBill}
                        </span>
                        <span className="tabular-nums">{formatEur(payCents + tipCents)}</span>
                      </button>
                      <p className="mt-1.5 text-center text-xs text-ink-soft">
                        {tipCents > 0 ? `${t.bill.tipIncluded(formatEur(tipCents))} · ` : ""}
                        {t.bill.methodsShort}
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : null}
          {payError && (
            <p role="alert" className="mt-3 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
              {payError}
            </p>
          )}
        </>
      )}

      <Link
        href={`/m/${tableToken}`}
        className="mt-6 flex min-h-12 items-center justify-center font-semibold text-brand underline-offset-4 hover:underline"
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

