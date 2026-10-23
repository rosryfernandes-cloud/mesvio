"use client";

import { useState } from "react";
import { MockPaySheet } from "./mock-pay-sheet";
import { backoffSchedule, usePolling } from "../use-polling";
import Link from "next/link";
import { formatEur } from "@/lib/money";
import type { BillOrder, TableBill } from "@/server/tables/table-sessions";

// 10 s nos primeiros 5 min, 30 s até à meia hora, depois 60 s; parado com o ecrã bloqueado.
const BILL_POLL = backoffSchedule([[5 * 60_000, 10_000], [30 * 60_000, 30_000]], 60_000);

function orderLabel(o: BillOrder): { text: string; className: string } {
  if (o.void) return { text: "Cancelado", className: "bg-line text-ink-soft" };
  if (o.awaitingPayment) return { text: "Por pagar", className: "bg-amber-100 text-amber-900" };
  if (o.pending) return { text: "A aguardar confirmação", className: "bg-brand-soft text-brand" };
  return { text: "Confirmado", className: "bg-[#ecfdf3] text-ok" };
}

/** Conta da mesa vista pelo cliente: todos os pedidos desde que a mesa abriu. */
export function TableBillView({ initial, tableToken }: { initial: TableBill; tableToken: string }) {
  const [bill, setBill] = useState(initial);
  const [paying, setPaying] = useState<{ paymentId: string; amountCents: number; provider: string } | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const [justPaid, setJustPaid] = useState(false);
  const [starting, setStarting] = useState(false);

  async function startPayment() {
    setStarting(true);
    setPayError(null);
    const res = await fetch(`/api/mesa/${tableToken}/pagamento`, { method: "POST" }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setStarting(false);
    if (!res?.ok) return setPayError(data.message ?? "Sem ligação. Tente de novo.");
    if (data.provider !== "mock") return setPayError("Pagamento com cartão/MB WAY ainda em configuração. Chame um funcionário.");
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
    else setPayError(approved ? "Não foi possível confirmar o pagamento." : "O pagamento foi recusado. Pode tentar de novo.");
  }

  usePolling(
    async () => {
      const res = await fetch(`/api/mesa/${tableToken}/conta`, { cache: "no-store" }).catch(() => null);
      if (res?.ok) setBill((await res.json()).bill);
    },
    { enabled: true, intervalFor: BILL_POLL },
  );

  const time = (iso: string) => new Date(iso).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
  const hasPending = bill.orders.some((o) => o.pending);
  const fullyPaid = bill.totalCents > 0 && bill.dueCents === 0;

  return (
    <main className="mx-auto max-w-2xl px-4 pt-8 pb-16">
      <p className="text-sm font-medium text-brand">{bill.tableLabel}</p>
      <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl">Conta da mesa</h1>

      {!bill.openedAt ? (
        <p className="mt-6 rounded-2xl border border-dashed border-line px-6 py-10 text-center text-ink-soft">
          Ainda não há pedidos nesta mesa. Os pedidos feitos por qualquer pessoa da mesa aparecem aqui.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-ink-soft">
            Aberta às {time(bill.openedAt)} · inclui os pedidos de todos os telemóveis desta mesa
          </p>
          <ul className="mt-6 grid gap-3">
            {bill.orders.map((o) => {
              const label = orderLabel(o);
              return (
                <li key={o.id} className={`rounded-2xl border border-line bg-card p-4 ${o.void ? "opacity-60" : ""}`}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold">
                      Pedido nº <span className="tabular-nums">{o.shortCode}</span>{" "}
                      <span className="text-sm font-normal text-ink-soft">às {time(o.createdAt)}</span>
                    </p>
                    {o.awaitingPayment ? (
                      <Link
                        href={`/m/${tableToken}/pedido/${o.id}?pagar=1`}
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold underline ${label.className}`}
                      >
                        Por pagar — pagar
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
            <span className="font-semibold">Total da mesa</span>
            <span className="text-2xl font-semibold tabular-nums">{formatEur(bill.totalCents)}</span>
          </div>
          {hasPending && (
            <p className="mt-2 text-sm text-ink-soft">Inclui pedidos ainda à espera de confirmação do restaurante.</p>
          )}

          {bill.pendingPaymentCents > 0 && !fullyPaid && (
            <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Há um pagamento de {formatEur(bill.pendingPaymentCents)} em curso nesta mesa. Se outra pessoa já está a pagar, aguarde.
            </p>
          )}
          {bill.paidCents > 0 && !fullyPaid && (
            <p className="mt-3 flex justify-between rounded-xl bg-[#ecfdf3] px-4 py-3 text-sm text-ok">
              <span>Já pago: {formatEur(bill.paidCents)}</span>
              <strong>Em falta: {formatEur(bill.dueCents)}</strong>
            </p>
          )}

          {fullyPaid ? (
            <div role="status" className="mt-4 rounded-2xl bg-[#ecfdf3] px-5 py-4 text-ok">
              <p className="font-[family-name:var(--font-display)] text-2xl">✓ Conta paga</p>
              <p className="mt-1 text-sm">
                {justPaid ? "Pagamento recebido. Obrigado e até breve!" : "Esta conta já está paga. Obrigado!"}
              </p>
            </div>
          ) : bill.paymentsEnabled ? (
            <div className="mt-4">
              {hasPending ? (
                <p className="rounded-xl bg-brand-soft px-4 py-3 text-sm">
                  Há pedidos à espera de confirmação. Pode pagar assim que forem confirmados.
                </p>
              ) : (
                <button
                  type="button"
                  onClick={startPayment}
                  disabled={starting}
                  className="flex min-h-14 w-full items-center justify-between rounded-2xl bg-brand px-5 font-semibold text-white disabled:opacity-50"
                >
                  <span>{starting ? "A preparar…" : "Pagar a conta"}</span>
                  <span className="tabular-nums">{formatEur(bill.dueCents)}</span>
                </button>
              )}
              <p className="mt-2 text-center text-xs text-ink-soft">Apple Pay, MB WAY ou cartão. Também pode pagar a um funcionário.</p>
            </div>
          ) : (
            <p className="mt-4 rounded-xl bg-brand-soft px-4 py-3 text-sm">
              <strong>Para pagar, chame um funcionário.</strong> O pagamento é feito no restaurante.
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
        Voltar à ementa
      </Link>

      {paying && (
        <MockPaySheet amountCents={paying.amountCents} onPay={finishMock} onClose={() => setPaying(null)} />
      )}
    </main>
  );
}
