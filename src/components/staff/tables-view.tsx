"use client";

import { useCallback, useEffect, useState } from "react";
import { formatEur } from "@/lib/money";
import { ConfirmInline } from "./confirm-inline";
import { usePolling } from "../use-polling";
import { StripeConnectCard } from "./stripe-connect-card";
import type { TableOverview } from "@/server/tables/table-sessions";

const POLL_MS = 5000;

function since(iso: string, now: number) {
  const m = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  return m < 60 ? `há ${m} min` : `há ${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
}

/** Mesas do restaurante: livres e ocupadas, a conta de cada uma, e fechar a mesa. */
export function TablesView({ canEditSettings }: { canEditSettings: boolean }) {
  const [tables, setTables] = useState<TableOverview[] | null>(null);
  const [paymentsEnabled, setPaymentsEnabled] = useState<boolean | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessageState] = useState<{ text: string; error: boolean } | null>(null);
  const setMessage = (text: string | null, error = false) => setMessageState(text ? { text, error } : null);
  const [now, setNow] = useState(() => Date.now());
  /** Mesa à espera de confirmação para fechar (e se é a segunda confirmação, com pedidos por resolver). */
  const [confirming, setConfirming] = useState<{ tableId: string; force: boolean; message: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/painel/mesas", { cache: "no-store" }).catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      setTables(data.tables);
      setPaymentsEnabled(data.paymentsEnabled);
    }
    setNow(Date.now());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  usePolling(load, { enabled: true, intervalFor: () => POLL_MS });

  function askClose(t: TableOverview) {
    setMessage(null);
    setConfirming({
      tableId: t.tableId,
      force: false,
      message: `Fechar a ${t.label}? A conta (${formatEur(t.bill!.totalCents)}) fica fechada e a mesa fica livre para os próximos clientes.`,
    });
  }

  async function close(t: TableOverview, force: boolean): Promise<void> {
    setBusy(t.tableId);
    setMessage(null);
    const res = await fetch(`/api/painel/mesas/${t.tableId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "close", force }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(null);
    if (res?.ok) {
      const cancelled: string[] = data.cancelled ?? [];
      const checkInPos: string[] = data.checkInPos ?? [];
      setMessage(
        `${t.label} fechada.` +
          (cancelled.length ? ` Pedidos cancelados: ${cancelled.map((c) => `#${c}`).join(", ")}.` : "") +
          (checkInPos.length ? ` Atenção: ${checkInPos.map((c) => `#${c}`).join(", ")} podem já estar no POS — anule-os lá.` : ""),
      );
      setOpenId(null);
      setConfirming(null);
    } else if (data.code === "PENDING_ORDERS") {
      setConfirming({
        tableId: t.tableId,
        force: true,
        message: `${data.message} Esses pedidos podem ainda não ter chegado à cozinha. Fechar a mesa mesmo assim?`,
      });
    } else {
      // Inclui PENDING_PAYMENT: com dinheiro a caminho a mesa não fecha, nem forçada.
      setConfirming(null);
      setMessage(data.message ?? (res ? "Não foi possível fechar a mesa." : "Sem ligação. Tente de novo."), true);
    }
    await load();
  }

  async function refund(t: TableOverview) {
    setBusy(t.tableId);
    setMessage(null);
    const res = await fetch(`/api/painel/mesas/${t.tableId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "refund_overpaid" }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(null);
    if (res?.ok) setMessage(`${t.label}: devolvidos ${formatEur(data.refundedCents)} ao cliente.`);
    else setMessage(data.message ?? "Não foi possível devolver. Tente de novo.", true);
    await load();
  }

  async function togglePayments(enabled: boolean) {
    setPaymentsEnabled(enabled);
    const res = await fetch("/api/painel/definicoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentsEnabled: enabled }),
    }).catch(() => null);
    if (res && !res.ok) setMessage((await res.json().catch(() => ({}))).message ?? "Não foi possível mudar.", true);
    await load();
  }

  if (!tables) return <p className="text-ink-soft">A carregar as mesas…</p>;
  const occupied = tables.filter((t) => t.bill);

  return (
    <div className="grid gap-4">
      <label className="flex items-start gap-3 rounded-2xl border border-line bg-card p-4">
        <input
          type="checkbox"
          checked={paymentsEnabled ?? false}
          disabled={!canEditSettings || paymentsEnabled === null}
          onChange={(e) => togglePayments(e.target.checked)}
          className="mt-1 size-5 accent-[var(--color-brand)]"
        />
        <span>
          <span className="font-semibold">Clientes podem pagar a conta no telemóvel</span>
          {!canEditSettings && <span className="ml-2 text-xs text-ink-soft">(só o dono ou o gerente podem mudar)</span>}
          <span className="block text-sm text-ink-soft">Apple Pay, MB WAY e cartão. As mesas pagas aparecem a verde; depois é só fechar a mesa.</span>
        </span>
      </label>
      {canEditSettings && <StripeConnectCard />}
      {canEditSettings && (
        <a href="/painel/qr" className="flex items-center justify-between rounded-2xl border border-line bg-card p-4 hover:border-brand">
          <span>
            <span className="block font-semibold">QR Codes dos lugares</span>
            <span className="block text-sm text-ink-soft">Imprimir, ou gerar um QR novo se um for fotografado e usado de fora.</span>
          </span>
          <span aria-hidden="true">→</span>
        </a>
      )}
      <p className="text-sm text-ink-soft">
        {occupied.length === 0 ? "Todas as mesas estão livres." : `${occupied.length} de ${tables.length} mesas com conta aberta.`} Quando os clientes
        pagarem, feche a mesa para a limpar para os próximos.
      </p>
      {message && (
        <p
          role={message.error ? "alert" : "status"}
          className={`rounded-xl px-4 py-3 text-sm ${message.error ? "bg-red-50 text-red-800" : "bg-[#ecfdf3] text-ok"}`}
        >
          {message.text}
        </p>
      )}

      {[...new Set(tables.map((t) => t.zone ?? "Sem zona"))].map((zone) => (
      <section key={zone} aria-label={zone} className="grid gap-2">
        <h2 className="text-sm font-semibold tracking-wide text-ink-soft uppercase">
          {zone}
          {tables.some((t) => (t.zone ?? "Sem zona") === zone && t.orderingMode === "pay_first") && (
            <span className="ml-2 font-normal normal-case">· pagam ao pedir</span>
          )}
        </h2>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tables.filter((t) => (t.zone ?? "Sem zona") === zone).map((t) => {
          const selected = openId === t.tableId;
          return (
            <li key={t.tableId} className={selected ? "col-span-2 sm:col-span-3 lg:col-span-5" : ""}>
              {!t.bill ? (
                <div className="flex h-full min-h-24 flex-col justify-between rounded-2xl border border-dashed border-line px-4 py-3 text-ink-soft">
                  <span className="font-semibold">{t.label}</span>
                  <span className="text-sm">Livre</span>
                  <CallBadges calls={t.calls} />
                </div>
              ) : (
                <div
                  className={`rounded-2xl border bg-card ${
                    t.bill.totalCents > 0 && t.bill.dueCents === 0
                      ? "border-ok ring-2 ring-ok/20"
                      : t.pendingCount > 0
                        ? "border-amber-500"
                        : "border-brand"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setOpenId(selected ? null : t.tableId);
                      setConfirming(null);
                    }}
                    aria-expanded={selected}
                    className="flex min-h-24 w-full flex-col justify-between px-4 py-3 text-left"
                  >
                    <span className="flex w-full items-center justify-between gap-2">
                      <span className="font-semibold">{t.label}</span>
                      {t.bill.overpaidCents > 0 ? (
                        <span className="rounded-full bg-red-700 px-2 py-0.5 text-xs font-semibold text-white">Pago a mais {formatEur(t.bill.overpaidCents)}</span>
                      ) : t.bill.pendingPaymentCents > 0 ? (
                        <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-semibold text-ink">A pagar…</span>
                      ) : t.bill.totalCents > 0 && t.bill.dueCents === 0 ? (
                        <span className="rounded-full bg-ok px-2 py-0.5 text-xs font-semibold text-white">✓ Paga</span>
                      ) : t.bill.paidCents > 0 ? (
                        <span className="rounded-full bg-[#ecfdf3] px-2 py-0.5 text-xs font-semibold text-ok">Falta {formatEur(t.bill.dueCents)}</span>
                      ) : (
                        t.pendingCount > 0 && (
                          <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-semibold text-ink">{t.pendingCount} por resolver</span>
                        )
                      )}
                    </span>
                    <span className="text-xl font-semibold tabular-nums">{formatEur(t.bill.totalCents)}</span>
                    <span className="text-xs text-ink-soft">
                      {t.bill.orders.length} {t.bill.orders.length === 1 ? "pedido" : "pedidos"} · aberta {since(t.bill.openedAt!, now)}
                    </span>
                    <CallBadges calls={t.calls} />
                  </button>

                  {selected && (
                    <div className="border-t border-line px-4 py-3">
                      <ul className="grid gap-2 text-sm">
                        {t.bill.orders.map((o) => (
                          <li key={o.id} className={o.void ? "text-ink-soft line-through" : ""}>
                            <p className="font-semibold">
                              #{o.shortCode} · {formatEur(o.totalCents)}
                              {o.pending && <span className="ml-2 text-xs font-normal text-brand">por resolver</span>}
                              {o.void && <span className="ml-2 text-xs font-normal">cancelado</span>}
                              {o.awaitingPayment && <span className="ml-2 text-xs font-normal text-ink-soft">por pagar</span>}
                            </p>
                            <p className="text-ink-soft">
                              {o.lines.map((l) => `${l.quantity}× ${l.name}${l.modifierNames.length ? ` (${l.modifierNames.join(", ")})` : ""}`).join(" · ")}
                            </p>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
                        <span className="font-semibold">
                          Total <span className="tabular-nums">{formatEur(t.bill.totalCents)}</span>
                          {t.bill.paidCents > 0 && (
                            <span className="block text-sm font-normal text-ok">Pago no telemóvel: {formatEur(t.bill.paidCents)}</span>
                          )}
                          {t.bill.pendingPaymentCents > 0 && (
                            <span className="block text-sm font-normal text-amber-700">
                              Pagamento em curso: {formatEur(t.bill.pendingPaymentCents)} (não cobrar ao balcão)
                            </span>
                          )}
                          {t.bill.overpaidCents > 0 && (
                            <span className="block text-sm font-normal text-red-700">
                              Pago a mais: {formatEur(t.bill.overpaidCents)}
                              {canEditSettings && (
                                <button
                                  type="button"
                                  disabled={busy === t.tableId}
                                  onClick={() => refund(t)}
                                  className="ml-2 rounded-lg border border-red-700 px-2 py-0.5 text-xs font-semibold"
                                >
                                  Devolver ao cliente
                                </button>
                              )}
                            </span>
                          )}
                        </span>
                        {confirming?.tableId !== t.tableId && (
                          <button
                            type="button"
                            onClick={() => askClose(t)}
                            className="min-h-11 rounded-xl bg-brand px-5 font-semibold text-white"
                          >
                            Fechar mesa
                          </button>
                        )}
                      </div>
                      {confirming?.tableId === t.tableId && (
                        <ConfirmInline
                          message={confirming.message}
                          confirmLabel={confirming.force ? "Fechar mesmo assim" : "Sim, fechar mesa"}
                          busy={busy === t.tableId}
                          onConfirm={() => close(t, confirming.force)}
                          onCancel={() => setConfirming(null)}
                        />
                      )}
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      </section>
      ))}
    </div>
  );
}

/** Chamadas abertas do cliente nesta mesa (o painel também as mostra no topo, com som). */
function CallBadges({ calls }: { calls: TableOverview["calls"] }) {
  if (!calls?.length) return null;
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {calls.includes("bill") && <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-semibold text-ink">🧾 Pede a conta</span>}
      {calls.includes("waiter") && <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-semibold text-ink">🙋 Chama</span>}
      {calls.includes("paid") && <span className="rounded-full bg-ok px-2 py-0.5 text-xs font-semibold text-white">💳 Pagou no telemóvel</span>}
    </span>
  );
}
