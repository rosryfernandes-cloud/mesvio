"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatEur } from "@/lib/money";
import type { Board, BoardOrder, StaffAction, StaffCatalogSection } from "@/server/staff/staff-service";
import type { StaffRole } from "@/server/staff/context";
import { ROLE_LABEL, TeamView } from "./team-view";
import { TablesView } from "./tables-view";
import { ConfirmInline } from "./confirm-inline";
import { BrandingView } from "./branding-view";
import { TranslationsView } from "./translations-view";
import { PhotosView } from "./photos-view";
import { usePolling } from "../use-polling";
import { LogoMark } from "../brand/logo";

const POLL_MS = 3000;

type Tab = "pedidos" | "mesas" | "esgotados" | "equipa" | "fotos" | "ementa" | "traducoes";

export interface PanelUser {
  displayName: string;
  role: StaffRole;
  establishmentId: string;
  establishments: { id: string; name: string; role: StaffRole }[];
  canEditSettings: boolean;
  canViewTeam: boolean;
  manageableRoles: StaffRole[];
}

export function StaffPanel({ initialBoard, me }: { initialBoard: Board; me: PanelUser }) {
  const router = useRouter();
  const [board, setBoard] = useState(initialBoard);
  const [tab, setTab] = useState<Tab>("pedidos");
  // De volta da Stripe (?stripe=…): abrir as Mesas, onde está o estado da conta e a mensagem.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("stripe")) setTab("mesas");
  }, []);
  const [offline, setOffline] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const sound = useAlertSound();

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/painel/pedidos", { cache: "no-store" });
      if (res.status === 401) return router.replace("/painel/entrar");
      if (!res.ok) throw new Error(String(res.status));
      setBoard(await res.json());
      setOffline(false);
    } catch {
      setOffline(true);
    } finally {
      setNow(Date.now());
    }
  }, [router]);

  // "Tempo real": a cada 3 s com o painel à vista; parado com o ecrã do tablet desligado, e
  // atualiza logo ao voltar.
  usePolling(refresh, { enabled: true, intervalFor: () => POLL_MS });

  const urgent = board.orders.filter((o) => o.status === "NEEDS_ATTENTION" || o.awaitingApproval);
  const urgentCount = urgent.length;

  // Alerta sonoro e no título do separador quando aparece um pedido urgente novo.
  const seenUrgent = useRef(new Set(urgent.map((o) => o.id)));
  useEffect(() => {
    const fresh = urgent.filter((o) => !seenUrgent.current.has(o.id));
    if (fresh.length > 0) sound.play();
    seenUrgent.current = new Set(urgent.map((o) => o.id));
    document.title = urgentCount > 0 ? `(${urgentCount}) Painel · ${board.establishmentName}` : `Painel · ${board.establishmentName}`;
  }, [urgent, urgentCount, board.establishmentName, sound]);

  async function act(order: BoardOrder, action: StaffAction): Promise<string | null> {
    const res = await fetch(`/api/painel/pedidos/${order.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    }).catch(() => null);
    await refresh();
    if (!res) return "Sem ligação. Tente de novo.";
    if (res.status === 401) {
      router.replace("/painel/entrar");
      return null;
    }
    return res.ok ? null : ((await res.json().catch(() => ({}))).message ?? "Não foi possível concluir.");
  }

  async function toggleManual(enabled: boolean) {
    setBoard((b) => ({ ...b, manualAcceptance: enabled }));
    await fetch("/api/painel/definicoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ manualAcceptance: enabled }),
    }).catch(() => null);
    await refresh();
  }

  async function saveThreshold(cents: number | null) {
    setBoard((b) => ({ ...b, approvalThresholdCents: cents }));
    await fetch("/api/painel/definicoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvalThresholdCents: cents }),
    }).catch(() => null);
    await refresh();
  }

  async function switchEstablishment(establishmentId: string) {
    await fetch("/api/painel/estabelecimento", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ establishmentId }),
    }).catch(() => null);
    window.location.reload();
  }

  async function logout() {
    await fetch("/api/painel/sessao", { method: "DELETE" }).catch(() => null);
    router.replace("/painel/entrar");
  }

  return (
    <div className="mx-auto min-h-dvh max-w-6xl px-4 pb-16">
      <header className="flex flex-wrap items-center justify-between gap-3 py-5">
        <div className="flex items-center gap-3">
        <LogoMark className="size-10 shrink-0" />
        <div>
          <p className="text-xs font-semibold tracking-wide text-ink-soft uppercase">Painel</p>
          {me.establishments.length > 1 ? (
            <select
              aria-label="Restaurante"
              value={me.establishmentId}
              onChange={(e) => switchEstablishment(e.target.value)}
              className="font-[family-name:var(--font-display)] -ml-1 rounded-lg bg-transparent text-2xl leading-tight"
            >
              {me.establishments.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          ) : (
            <h1 className="font-[family-name:var(--font-display)] text-2xl leading-tight">{board.establishmentName}</h1>
          )}
        </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm">
            {me.displayName}{" "}
            <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand">{ROLE_LABEL[me.role]}</span>
          </span>
          <button
            type="button"
            onClick={sound.toggle}
            aria-pressed={sound.enabled}
            className={`min-h-10 rounded-full border px-4 text-sm font-medium ${
              sound.enabled ? "border-ok bg-[#ecfdf3] text-ok" : "border-line bg-card"
            }`}
          >
            {sound.enabled ? "🔔 Som ligado" : "🔕 Ligar som"}
          </button>
          <button type="button" onClick={logout} className="min-h-10 rounded-full border border-line bg-card px-4 text-sm">
            Sair
          </button>
        </div>
      </header>

      {offline && (
        <p role="alert" className="mb-4 rounded-xl bg-ink px-4 py-3 text-sm text-paper">
          Sem ligação ao servidor — a lista pode estar desatualizada. A tentar de novo…
        </p>
      )}

      {urgentCount > 0 && (
        <button
          type="button"
          onClick={() => {
            setTab("pedidos");
            document.getElementById("urgentes")?.scrollIntoView({ behavior: "smooth" });
          }}
          className="mb-4 flex w-full items-center gap-3 rounded-2xl bg-red-700 px-5 py-4 text-left text-white shadow-lg"
        >
          <span aria-hidden="true" className="text-2xl">⚠</span>
          <span className="font-semibold">
            {urgentCount === 1 ? "1 pedido precisa de si" : `${urgentCount} pedidos precisam de si`}
          </span>
          <span className="ml-auto text-sm underline">Ver</span>
        </button>
      )}

      <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none]" aria-label="Secções do painel">
        {(
          [
            "pedidos",
            "mesas",
            "esgotados",
            ...(me.canViewTeam ? (["equipa"] as const) : []),
            ...(me.canEditSettings ? (["fotos", "ementa", "traducoes"] as const) : []),
          ] as Tab[]
        ).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            aria-current={tab === t ? "page" : undefined}
            className={`-mb-px min-h-11 shrink-0 border-b-2 px-3 font-semibold capitalize sm:px-4 ${
              tab === t ? "border-brand text-brand" : "border-transparent text-ink-soft"
            }`}
          >
            {{ pedidos: "Pedidos", mesas: "Mesas", esgotados: "Esgotados", equipa: "Equipa", fotos: "Fotos", ementa: "Aparência", traducoes: "Inglês" }[t]}
          </button>
        ))}
      </nav>

      {tab === "pedidos" && (
        <OrdersView
          board={board}
          now={now}
          onAction={act}
          onToggleManual={toggleManual}
          onSaveThreshold={saveThreshold}
          canEditSettings={me.canEditSettings}
        />
      )}
      {tab === "mesas" && <TablesView canEditSettings={me.canEditSettings} />}
      {tab === "esgotados" && <SoldOutView />}
      {tab === "equipa" && <TeamView manageableRoles={me.manageableRoles} />}
      {tab === "ementa" && <BrandingView establishmentName={board.establishmentName} />}
      {tab === "traducoes" && <TranslationsView />}
      {tab === "fotos" && <PhotosView />}
    </div>
  );
}

// ─────────────────────────── Pedidos ───────────────────────────

function OrdersView({
  board,
  now,
  onAction,
  onToggleManual,
  onSaveThreshold,
  canEditSettings,
}: {
  board: Board;
  now: number;
  onAction: (o: BoardOrder, a: StaffAction) => Promise<string | null>;
  onToggleManual: (v: boolean) => void;
  onSaveThreshold: (cents: number | null) => void;
  canEditSettings: boolean;
}) {
  const groups = useMemo(() => {
    const by = (f: (o: BoardOrder) => boolean) => board.orders.filter(f);
    return {
      attention: by((o) => o.status === "NEEDS_ATTENTION"),
      approval: by((o) => o.awaitingApproval),
      unconfirmed: by((o) => o.status === "SUBMITTED"),
      sending: by((o) => (o.status === "RECEIVED" && !o.awaitingApproval) || o.status === "SUBMITTING" || o.status === "FAILED_RETRYING"),
      done: by((o) => ["ACCEPTED", "IN_PREPARATION", "SERVED"].includes(o.status)),
      closed: by((o) => o.status === "REJECTED" || o.status === "CANCELLED"),
      // Pagar ao pedir: o cliente ainda está a pagar — não é trabalho para a cozinha.
      unpaid: by((o) => o.status === "AWAITING_PAYMENT"),
    };
  }, [board.orders]);

  return (
    <div className="grid gap-8">
      <label className="flex items-start gap-3 rounded-2xl border border-line bg-card p-4">
        <input
          type="checkbox"
          checked={board.manualAcceptance}
          disabled={!canEditSettings}
          onChange={(e) => onToggleManual(e.target.checked)}
          className="mt-1 size-5 accent-[var(--color-brand)]"
        />
        <span>
          <span className="font-semibold">Aprovar cada pedido antes de seguir para a cozinha</span>
          {!canEditSettings && <span className="ml-2 text-xs text-ink-soft">(só o dono ou o gerente podem mudar)</span>}
          <span className="block text-sm text-ink-soft">
            Só se suspeitar de pedidos falsos: atrasa o serviço. Os clientes veem “a aguardar confirmação” até aprovar.
          </span>
        </span>
      </label>
      <ThresholdSetting value={board.approvalThresholdCents} onSave={onSaveThreshold} disabled={!canEditSettings || board.manualAcceptance} />

      <div id="urgentes" className="grid gap-8">
        <Group title="Precisa de atenção" tone="red" orders={groups.attention} now={now} onAction={onAction}
          hint="O POS não recebeu estes pedidos. Tente de novo ou lance-os à mão no POS." />
        <Group title="Para aprovar" tone="amber" orders={groups.approval} now={now} onAction={onAction} />
      </div>
      <Group title="À espera de confirmação do POS" tone="amber" orders={groups.unconfirmed} now={now} onAction={onAction}
        hint="O POS recebeu, mas não confirmou. Confirme quando vir o pedido no POS." />
      <Group title="A enviar para o POS" tone="neutral" orders={groups.sending} now={now} onAction={onAction} />
      <Group title="Confirmados hoje" tone="ok" orders={groups.done} now={now} onAction={onAction} compact />
      <Group title="À espera de pagamento" tone="neutral" orders={groups.unpaid} now={now} onAction={onAction} compact
        hint="Clientes que ainda estão a pagar. Seguem para a cozinha sozinhos quando o pagamento for confirmado." />
      <Group title="Recusados e cancelados" tone="neutral" orders={groups.closed} now={now} onAction={onAction} compact />

      {board.orders.length === 0 && (
        <p className="rounded-2xl border border-dashed border-line px-6 py-12 text-center text-ink-soft">
          Ainda não há pedidos hoje. Os novos pedidos aparecem aqui automaticamente.
        </p>
      )}
    </div>
  );
}

/**
 * Aprovação só para pedidos grandes — desligada por omissão para não quebrar o ritmo do serviço.
 * Pedidos grandes mostram sempre a etiqueta "Valor alto", sem bloquear.
 */
function ThresholdSetting({ value, onSave, disabled }: { value: number | null; onSave: (cents: number | null) => void; disabled: boolean }) {
  const [euros, setEuros] = useState(String((value ?? 15_000) / 100));
  const enabled = value !== null;
  const save = (on: boolean) => {
    const n = Math.round(Number(euros.replace(",", ".")) * 100);
    onSave(on && Number.isFinite(n) && n >= 500 ? n : on ? 15_000 : null);
  };
  return (
    <div className="-mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-card p-4">
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={enabled}
          disabled={disabled}
          onChange={(e) => save(e.target.checked)}
          className="size-5 accent-[var(--color-brand)]"
        />
        <span className="font-semibold">Aprovar só pedidos acima de</span>
      </label>
      <span className="flex items-center gap-1">
        <input
          inputMode="decimal"
          aria-label="Valor a partir do qual o pedido precisa de aprovação, em euros"
          value={euros}
          disabled={disabled}
          onChange={(e) => setEuros(e.target.value)}
          onBlur={() => enabled && save(true)}
          className="min-h-10 w-20 rounded-lg border border-line bg-paper px-2 text-right tabular-nums"
        />
        €
      </span>
      <span className="basis-full text-sm text-ink-soft">
        {enabled ? "Pedidos acima deste valor esperam por si antes de irem para a cozinha." : "Desligado: todos os pedidos seguem logo para a cozinha. Os grandes aparecem com a etiqueta “Valor alto”."}
      </span>
    </div>
  );
}

const TONES = {
  red: { badge: "bg-red-700 text-white", card: "border-red-700 ring-2 ring-red-700/20" },
  amber: { badge: "bg-amber-500 text-ink", card: "border-amber-500" },
  ok: { badge: "bg-ok text-white", card: "border-line" },
  neutral: { badge: "bg-line text-ink", card: "border-line" },
} as const;

function Group({
  title,
  tone,
  orders,
  now,
  onAction,
  hint,
  compact,
}: {
  title: string;
  tone: keyof typeof TONES;
  orders: BoardOrder[];
  now: number;
  onAction: (o: BoardOrder, a: StaffAction) => Promise<string | null>;
  hint?: string;
  compact?: boolean;
}) {
  if (orders.length === 0) return null;
  return (
    <section aria-labelledby={`g-${title}`}>
      <h2 id={`g-${title}`} className="flex items-center gap-2 text-lg font-semibold">
        {title}
        <span className={`rounded-full px-2.5 py-0.5 text-sm tabular-nums ${TONES[tone].badge}`}>{orders.length}</span>
      </h2>
      {hint && <p className="mt-1 text-sm text-ink-soft">{hint}</p>}
      <div className={`mt-3 grid gap-3 ${compact ? "sm:grid-cols-2 lg:grid-cols-3" : "md:grid-cols-2"}`}>
        {orders.map((o) => (
          <OrderCard key={o.id} order={o} now={now} tone={tone} onAction={onAction} compact={compact} />
        ))}
      </div>
    </section>
  );
}

function minutesAgo(iso: string, now: number) {
  const m = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  if (m < 1) return "agora";
  if (m < 60) return `há ${m} min`;
  return new Date(iso).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
}

const ACTIONS_FOR = (o: BoardOrder): { action: StaffAction; label: string; primary?: boolean; confirm?: string }[] => {
  if (o.awaitingApproval)
    return [
      { action: "approve", label: "Aprovar", primary: true },
      { action: "reject", label: "Recusar", confirm: `Recusar o pedido ${o.shortCode} da ${o.tableLabel}? O cliente verá que foi cancelado.` },
    ];
  if (o.status === "NEEDS_ATTENTION" && o.ambiguous)
    // O POS pode já ter o pedido: primeiro verificar lá; reenviar às cegas pode duplicá-lo na cozinha.
    return [
      { action: "handled", label: "Já está no POS", primary: true, confirm: `Confirma que o pedido ${o.shortCode} já aparece no POS?` },
      {
        action: "retry",
        label: "Não está — reenviar",
        confirm: `Verificou no POS que o pedido ${o.shortCode} NÃO entrou? Se já lá estiver, reenviar duplica-o na cozinha.`,
      },
      { action: "cancel", label: "Cancelar", confirm: `Cancelar o pedido ${o.shortCode} da ${o.tableLabel}?` },
    ];
  if (o.status === "NEEDS_ATTENTION")
    return [
      { action: "retry", label: "Tentar de novo", primary: true },
      { action: "handled", label: "Já lancei no POS", confirm: `Confirma que lançou o pedido ${o.shortCode} à mão no POS?` },
      { action: "cancel", label: "Cancelar", confirm: `Cancelar o pedido ${o.shortCode} da ${o.tableLabel}?` },
    ];
  if (o.status === "SUBMITTED") return [{ action: "confirm", label: "Confirmar", primary: true }];
  return [];
};

const STATUS_LABEL: Partial<Record<BoardOrder["status"], string>> = {
  AWAITING_PAYMENT: "Por pagar",
  SUBMITTING: "A enviar…",
  FAILED_RETRYING: "POS sem resposta — a tentar de novo",
  RECEIVED: "Recebido",
  ACCEPTED: "Confirmado",
  IN_PREPARATION: "Em preparação",
  SERVED: "Servido",
  REJECTED: "Recusado pelo POS",
  CANCELLED: "Cancelado",
};

function OrderCard({
  order: o,
  now,
  tone,
  onAction,
  compact,
}: {
  order: BoardOrder;
  now: number;
  tone: keyof typeof TONES;
  onAction: (o: BoardOrder, a: StaffAction) => Promise<string | null>;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState<StaffAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<(typeof actions)[number] | null>(null);
  const actions = ACTIONS_FOR(o);

  async function run(a: (typeof actions)[number]) {
    setBusy(a.action);
    setError(await onAction(o, a.action));
    setBusy(null);
    setConfirming(null);
  }

  return (
    <article className={`rounded-2xl border bg-card p-4 ${TONES[tone].card}`} aria-label={`Pedido ${o.shortCode}, ${o.tableLabel}`}>
      <header className="flex items-baseline justify-between gap-3">
        <p className="flex items-baseline gap-2">
          <span className="text-2xl font-bold tabular-nums">#{o.shortCode}</span>
          <span className="text-lg font-semibold">{o.tableLabel}</span>
        </p>
        <p className="text-sm text-ink-soft tabular-nums">{minutesAgo(o.createdAt, now)}</p>
      </header>

      {!compact && STATUS_LABEL[o.status] && !o.awaitingApproval && o.status !== "NEEDS_ATTENTION" && (
        <p className="mt-1 text-sm text-ink-soft">{STATUS_LABEL[o.status]}</p>
      )}
      {o.problem && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">Motivo: {o.problem}</p>}
      {o.approvalReason && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{o.approvalReason}</p>}
      {o.highValue && !o.awaitingApproval && (
        <p className="mt-2 inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">Valor alto</p>
      )}
      {o.ambiguous && (
        <p className="mt-2 rounded-lg border border-red-700 px-3 py-2 text-sm text-red-800">
          <strong>O POS pode já ter este pedido.</strong> Procure no POS a {o.tableLabel}, pedido das{" "}
          {new Date(o.createdAt).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}, antes de reenviar.
        </p>
      )}

      <ul className={`mt-3 grid gap-1 ${compact ? "text-sm" : ""}`}>
        {o.lines.map((l, i) => (
          <li key={i}>
            <span className="font-semibold tabular-nums">{l.quantity}×</span> {l.name}
            {l.modifierNames.length > 0 && <span className="text-ink-soft"> · {l.modifierNames.join(", ")}</span>}
            {l.notes && <span className="block pl-6 text-sm text-brand italic">“{l.notes}”</span>}
          </li>
        ))}
      </ul>
      {o.notes && <p className="mt-2 rounded-lg bg-brand-soft px-3 py-2 text-sm">Nota: “{o.notes}”</p>}

      <footer className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        <span className="font-semibold tabular-nums">{formatEur(o.totalCents)}</span>
        {compact && STATUS_LABEL[o.status] && <span className="text-sm text-ink-soft">{STATUS_LABEL[o.status]}</span>}
        {actions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {actions.map((a) => (
              <button
                key={a.action}
                type="button"
                disabled={busy !== null}
                onClick={() => (a.confirm ? setConfirming(a) : run(a))}
                className={`min-h-11 rounded-xl px-4 text-sm font-semibold disabled:opacity-50 ${
                  a.primary ? "bg-brand text-white" : "border border-line bg-paper"
                }`}
              >
                {busy === a.action ? "…" : a.label}
              </button>
            ))}
          </div>
        )}
      </footer>
      {confirming?.confirm && (
        <ConfirmInline
          message={confirming.confirm}
          confirmLabel={`Sim, ${confirming.label.toLowerCase()}`}
          busy={busy !== null}
          onConfirm={() => run(confirming)}
          onCancel={() => setConfirming(null)}
        />
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </article>
  );
}

// ─────────────────────────── Esgotados ───────────────────────────

function SoldOutView() {
  const [sections, setSections] = useState<StaffCatalogSection[] | null>(null);
  const [query, setQuery] = useState("");
  const [onlySoldOut, setOnlySoldOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/painel/catalogo", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => setSections(d.sections))
      .catch(() => setError("Não foi possível carregar a ementa."));
  }, []);

  async function toggle(ref: string, soldOut: boolean) {
    const patch = (value: boolean) =>
      setSections((s) =>
        s!.map((sec) => ({
          ...sec,
          categories: sec.categories.map((c) => ({
            ...c,
            products: c.products.map((p) => (p.ref === ref ? { ...p, locallyUnavailable: value } : p)),
          })),
        })),
      );
    patch(soldOut); // otimista: o staff vê logo o resultado
    const res = await fetch("/api/painel/esgotados", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productRef: ref, soldOut }),
    }).catch(() => null);
    if (!res?.ok) {
      patch(!soldOut);
      setError("Não foi possível guardar. Tente de novo.");
    } else setError(null);
  }

  if (error && !sections) return <p className="text-brand">{error}</p>;
  if (!sections) return <p className="text-ink-soft">A carregar a ementa…</p>;

  const q = query.trim().toLocaleLowerCase("pt-PT");
  const soldOutCount = sections.flatMap((s) => s.categories).flatMap((c) => c.products).filter((p) => p.locallyUnavailable || !p.posAvailable).length;

  return (
    <div>
      <div className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center gap-3 bg-paper/95 px-4 py-3 backdrop-blur">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Procurar artigo…"
          aria-label="Procurar artigo"
          className="min-h-11 flex-1 rounded-xl border border-line bg-card px-4"
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={onlySoldOut} onChange={(e) => setOnlySoldOut(e.target.checked)} className="size-5" />
          Só esgotados ({soldOutCount})
        </label>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}

      {sections.map((sec) => {
        const cats = sec.categories
          .map((c) => ({
            ...c,
            products: c.products.filter(
              (p) =>
                (!q || p.name.toLocaleLowerCase("pt-PT").includes(q)) && (!onlySoldOut || p.locallyUnavailable || !p.posAvailable),
            ),
          }))
          .filter((c) => c.products.length > 0);
        if (cats.length === 0) return null;
        return (
          <section key={sec.section} className="mt-6">
            <h2 className="font-[family-name:var(--font-display)] text-2xl">{sec.section}</h2>
            {cats.map((c) => (
              <div key={c.ref} className="mt-3">
                <h3 className="text-sm font-semibold tracking-wide text-ink-soft uppercase">{c.name}</h3>
                <ul className="mt-2 divide-y divide-line rounded-2xl border border-line bg-card">
                  {c.products.map((p) => {
                    const soldOut = p.locallyUnavailable || !p.posAvailable;
                    return (
                      <li key={p.ref} className="flex min-h-14 items-center gap-3 px-4 py-2">
                        <span className={`flex-1 ${soldOut ? "text-ink-soft line-through" : ""}`}>{p.name}</span>
                        <span className="text-sm text-ink-soft tabular-nums">{formatEur(p.priceCents)}</span>
                        {!p.posAvailable ? (
                          <span className="rounded-lg bg-ink px-2 py-1 text-xs text-paper">Esgotado no POS</span>
                        ) : (
                          <button
                            type="button"
                            role="switch"
                            aria-checked={!p.locallyUnavailable}
                            aria-label={`${p.name}: ${p.locallyUnavailable ? "esgotado" : "disponível"}`}
                            onClick={() => toggle(p.ref, !p.locallyUnavailable)}
                            className={`min-h-10 min-w-28 rounded-full px-3 text-sm font-semibold ${
                              p.locallyUnavailable ? "bg-ink text-paper" : "bg-[#ecfdf3] text-ok"
                            }`}
                          >
                            {p.locallyUnavailable ? "Esgotado" : "Disponível"}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}

// ─────────────────────────── Som ───────────────────────────

/** Bip curto via Web Audio. Os browsers só deixam tocar som depois de um toque do utilizador. */
function useAlertSound() {
  const [enabled, setEnabled] = useState(false);
  const ctx = useRef<AudioContext | null>(null);

  useEffect(() => {
    try {
      setEnabled(localStorage.getItem("painel:som") === "1");
    } catch {}
  }, []);

  const play = useCallback(() => {
    if (!enabled) return;
    try {
      ctx.current ??= new AudioContext();
      const c = ctx.current;
      for (const [i, freq] of [880, 660, 880].entries()) {
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.25, c.currentTime + i * 0.18);
        gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + i * 0.18 + 0.16);
        osc.connect(gain).connect(c.destination);
        osc.start(c.currentTime + i * 0.18);
        osc.stop(c.currentTime + i * 0.18 + 0.17);
      }
    } catch {}
  }, [enabled]);

  const toggle = useCallback(() => {
    setEnabled((v) => {
      const next = !v;
      try {
        localStorage.setItem("painel:som", next ? "1" : "0");
      } catch {}
      if (next) {
        ctx.current ??= new AudioContext();
        void ctx.current.resume();
      }
      return next;
    });
  }, []);

  return useMemo(() => ({ enabled, play, toggle }), [enabled, play, toggle]);
}
