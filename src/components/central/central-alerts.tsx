"use client";

import { useEffect, useState } from "react";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
type State = "loading" | "unsupported" | "install-first" | "blocked" | "off" | "on";

function keyBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
const registration = () => navigator.serviceWorker.register("/sw.js", { scope: "/central" });
const post = async (body: unknown) => {
  const res = await fetch("/api/central/notificacoes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const data = res ? await res.json().catch(() => ({})) : {};
  return { ok: Boolean(res?.ok), message: data.message as string | undefined };
};

/**
 * Avisos da Central neste aparelho: um restaurante abriu (ou voltou a abrir) o link de demonstração,
 * pediu para ativar, ou chegou um pedido de demonstração do site. No iPhone, só com a Central no ecrã principal.
 */
export function CentralAlerts() {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const ua = navigator.userAgent;
      const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && PUBLIC_KEY;
      if (!supported) return setState(ios && !standalone ? "install-first" : "unsupported");
      if (Notification.permission === "denied") return setState("blocked");
      const sub = await (await registration()).pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  async function enable() {
    setBusy(true);
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setState(permission === "denied" ? "blocked" : "off");
      const reg = await registration();
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(PUBLIC_KEY) }));
      const r = await post({ subscription: sub.toJSON() });
      if (!r.ok) throw new Error(r.message);
      setState("on");
      setMessage("Avisos ligados neste aparelho. Carregue em Testar para confirmar.");
    } catch {
      setMessage("Não foi possível ligar os avisos. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }
  async function disable() {
    setBusy(true);
    const sub = await (await registration()).pushManager.getSubscription();
    if (sub) {
      await post({ remove: sub.endpoint });
      await sub.unsubscribe();
    }
    setBusy(false);
    setState("off");
    setMessage(null);
  }
  async function test() {
    setBusy(true);
    const r = await post({ test: true });
    setBusy(false);
    setMessage(r.ok ? "Enviado. Deve aparecer daqui a uns segundos." : (r.message ?? "Não foi possível enviar."));
  }

  if (state === "loading" || state === "unsupported") return null;
  return (
    <section aria-label="Avisos no telemóvel" className="mt-6 rounded-3xl border border-line bg-card px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 font-semibold">{state === "on" ? "🔔 Avisos ligados neste aparelho" : "🔔 Avisos no telemóvel"}</p>
        {state === "on" ? (
          <>
            <button type="button" disabled={busy} onClick={() => void test()} className="min-h-9 rounded-lg border border-line bg-paper px-3 text-sm font-semibold">
              Testar
            </button>
            <button type="button" disabled={busy} onClick={() => void disable()} className="min-h-9 rounded-lg border border-line bg-paper px-3 text-sm font-semibold">
              Desligar
            </button>
          </>
        ) : state === "off" ? (
          <button type="button" disabled={busy} onClick={() => void enable()} className="min-h-10 rounded-xl bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60">
            Ligar avisos
          </button>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        {state === "install-first"
          ? "No iPhone, os avisos só funcionam com a Central no ecrã principal: Partilhar → Adicionar ao ecrã principal, e abrir a partir do ícone."
          : state === "blocked"
            ? "Os avisos estão bloqueados para este site. Ligue-os nas definições do browser ou do telemóvel e volte a abrir a Central."
            : "Quando um restaurante abre ou volta a abrir o link de demonstração, pede para ativar ou pede uma demonstração no site."}
      </p>
      {message && (
        <p role="status" className="mt-1 text-sm text-ink-soft">
          {message}
        </p>
      )}
    </section>
  );
}
