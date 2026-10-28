"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/i18n-provider";

type Kind = "bill" | "waiter";
type Call = { kind: Kind; detail: string | null; acknowledged: boolean };

const POLL_MS = 10_000;

/**
 * "Pedir a conta" (mesas) e "Chamar empregado" (mesas e camas). Avisa o painel do restaurante,
 * com som, e mostra ao cliente quando o empregado vem a caminho.
 */
export function CallStaff({ tableToken, payFirst }: { tableToken: string; payFirst: boolean }) {
  const { t } = useI18n();
  const [sheet, setSheet] = useState<Kind | null>(null);
  const [calls, setCalls] = useState<Call[]>([]);
  const [payInApp, setPayInApp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/mesa/${tableToken}/chamar`, { cache: "no-store" }).catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      setCalls(data.calls ?? []);
      setPayInApp(Boolean(data.payInApp));
    }
  }, [tableToken]);

  // Só faz sentido acompanhar enquanto há uma chamada aberta; ao abrir "Pedir a conta" atualiza
  // (pode já haver pedidos para pagar pelo telemóvel).
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (sheet === "bill") void load();
  }, [sheet, load]);
  useEffect(() => {
    if (calls.length === 0) return;
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [calls.length, load]);

  async function send(kind: Kind, detail: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/mesa/${tableToken}/chamar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, detail }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setError((res && (await res.json().catch(() => ({}))).message) || t.call.failed);
      return;
    }
    setCalls((await res.json()).calls ?? []);
    setSheet(null);
  }

  const bill = calls.find((c) => c.kind === "bill");
  const waiter = calls.find((c) => c.kind === "waiter");
  const options: Record<Kind, { question: string; choices: [string, string][] }> = {
    bill: { question: t.call.billQuestion, choices: [["card", t.call.card], ["cash", t.call.cash]] },
    waiter: {
      question: t.call.waiterQuestion,
      choices: [
        ["order", t.call.reasonOrder],
        ["napkins", t.call.reasonNapkins],
        ["clear", t.call.reasonClear],
        ["other", t.call.reasonOther],
      ],
    },
  };
  const pill = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-line bg-card px-3 text-sm font-medium whitespace-nowrap hover:border-brand hover:text-brand";

  return (
    <div className="mx-4 mt-3">
      <div className={`grid gap-2 ${payFirst ? "grid-cols-1" : "grid-cols-2"}`}>
        {!payFirst && (
          <button type="button" className={pill} onClick={() => setSheet("bill")}>
            <span aria-hidden="true">🧾</span> {t.call.askBill}
          </button>
        )}
        <button type="button" className={pill} onClick={() => setSheet("waiter")}>
          <span aria-hidden="true">🙋</span> {t.call.callWaiter}
        </button>
      </div>

      {(bill || waiter) && (
        <div role="status" className="mt-3 grid gap-1 rounded-xl border border-ok/30 bg-[#ecfdf3] px-4 py-3 text-sm text-ok">
          {bill && <p>{bill.acknowledged ? `✓ ${t.call.onTheWay}` : bill.detail === "cash" ? t.call.billSentCash : t.call.billSentCard}</p>}
          {waiter && <p>{waiter.acknowledged ? `✓ ${t.call.onTheWay}` : t.call.waiterSent}</p>}
        </div>
      )}

      {sheet && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40" onClick={() => setSheet(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={sheet === "bill" ? t.call.askBill : t.call.callWaiter}
            className="w-full max-w-2xl rounded-t-3xl bg-paper px-5 pt-5 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <p className="font-[family-name:var(--font-display)] text-xl">{options[sheet].question}</p>
              <button type="button" onClick={() => setSheet(null)} aria-label={t.call.close} className="min-h-10 px-2 text-2xl text-ink-soft">
                ×
              </button>
            </div>
            <div className="mt-4 grid gap-2">
              {sheet === "bill" && payInApp && (
                <Link
                  href={`/m/${tableToken}/conta`}
                  className="flex min-h-14 flex-col justify-center rounded-2xl bg-brand px-4 text-left font-semibold text-white"
                >
                  <span>💳 {t.call.payNow}</span>
                  <span className="text-xs font-normal text-white/80">{t.call.payNowHint}</span>
                </Link>
              )}
              {options[sheet].choices.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  disabled={busy}
                  onClick={() => send(sheet, value)}
                  className="min-h-12 rounded-2xl border border-line bg-card px-4 text-left font-semibold hover:border-brand disabled:opacity-60"
                >
                  {label}
                </button>
              ))}
            </div>
            {error && (
              <p role="alert" className="mt-3 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
                {error}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
