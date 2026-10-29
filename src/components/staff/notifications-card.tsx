"use client";

import { useEffect, useState } from "react";

const DISMISSED_KEY = "mesvio:notificacoes-fechado";
const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

type State = "loading" | "unsupported" | "install-first" | "blocked" | "off" | "on" | "hidden";

function keyBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration() {
  return navigator.serviceWorker.register("/sw.js", { scope: "/painel" });
}

/**
 * Notificações neste aparelho (pediu a conta, chamou, pagou, pedido novo), mesmo com o ecrã
 * bloqueado. Cada pessoa liga-as no seu telemóvel; no iPhone só funcionam com a app instalada.
 */
export function NotificationsCard() {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && PUBLIC_KEY;
      const ua = navigator.userAgent;
      const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      let dismissed = false;
      try {
        dismissed = localStorage.getItem(DISMISSED_KEY) === "1";
      } catch {}
      if (!supported) return setState(ios && !standalone && !dismissed ? "install-first" : "unsupported");
      if (Notification.permission === "denied") return setState(dismissed ? "hidden" : "blocked");
      const sub = await (await registration()).pushManager.getSubscription();
      if (sub) return setState("on");
      setState(dismissed ? "hidden" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  async function post(body: unknown) {
    const res = await fetch("/api/painel/notificacoes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    return { ok: Boolean(res?.ok), message: data.message as string | undefined };
  }

  async function enable() {
    setBusy(true);
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }
      const reg = await registration();
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(PUBLIC_KEY) }));
      const r = await post({ action: "subscribe", subscription: sub.toJSON() });
      if (!r.ok) throw new Error(r.message);
      setState("on");
      setMessage("Notificações ligadas neste aparelho.");
    } catch {
      setMessage("Não foi possível ligar as notificações. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMessage(null);
    const sub = await (await registration()).pushManager.getSubscription();
    if (sub) {
      await post({ action: "unsubscribe", endpoint: sub.endpoint });
      await sub.unsubscribe();
    }
    setBusy(false);
    setState("off");
  }

  async function test() {
    setBusy(true);
    const r = await post({ action: "test" });
    setBusy(false);
    setMessage(r.ok ? "Enviada. Deve aparecer daqui a uns segundos." : (r.message ?? "Não foi possível enviar."));
  }

  function dismiss() {
    setState("hidden");
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {}
  }

  if (state === "loading" || state === "unsupported" || state === "hidden") return null;

  if (state === "on") {
    return (
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-card px-4 py-3 text-sm">
        <span className="flex-1 font-semibold">🔔 Notificações ligadas neste aparelho</span>
        <button type="button" disabled={busy} onClick={test} className="min-h-9 rounded-lg border border-line bg-paper px-3 font-semibold">
          Testar
        </button>
        <button type="button" disabled={busy} onClick={disable} className="min-h-9 rounded-lg border border-line bg-paper px-3 font-semibold">
          Desligar
        </button>
        {message && (
          <p role="status" className="w-full text-ink-soft">
            {message}
          </p>
        )}
      </div>
    );
  }

  return (
    <section aria-label="Notificações" className="mb-4 rounded-2xl border border-line bg-card p-4">
      <p className="font-semibold">🔔 Receber avisos neste aparelho</p>
      {state === "install-first" ? (
        <p className="mt-1 text-sm text-ink-soft">
          No iPhone, as notificações só funcionam com o MESVIO instalado: adicione-o ao ecrã principal e abra-o a partir do ícone para as ligar.
        </p>
      ) : state === "blocked" ? (
        <p className="mt-1 text-sm text-ink-soft">
          As notificações estão bloqueadas para este site. Ligue-as nas definições do browser (ou do telemóvel) e volte a abrir o painel.
        </p>
      ) : (
        <p className="mt-1 text-sm text-ink-soft">
          Pediu a conta, chamou o empregado, pagou no telemóvel e pedidos novos, mesmo com o ecrã bloqueado. Com mesas por empregado, só das suas mesas.
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {state === "off" && (
          <button type="button" disabled={busy} onClick={enable} className="min-h-10 rounded-xl bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60">
            Ativar notificações
          </button>
        )}
        <button type="button" onClick={dismiss} className="min-h-10 rounded-xl border border-line bg-paper px-4 text-sm font-semibold">
          Agora não
        </button>
      </div>
      {message && (
        <p role="status" className="mt-2 text-sm text-ink-soft">
          {message}
        </p>
      )}
    </section>
  );
}
