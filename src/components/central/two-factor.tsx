"use client";

import { useEffect, useRef, useState } from "react";
import { browserSupportsWebAuthn, startAuthentication, startRegistration } from "@simplewebauthn/browser";

const codeField =
  "mt-1 block w-full rounded-xl border border-line bg-card px-4 py-3 text-center text-2xl tracking-[0.4em] tabular-nums";
const primary = "min-h-12 rounded-2xl bg-brand px-5 font-semibold text-white disabled:opacity-50";
const secondary = "min-h-12 rounded-2xl border border-line bg-card px-5 font-semibold disabled:opacity-50";
const linkBtn = "text-sm text-ink-soft underline";

type Reply = { ok: boolean; data: Record<string, unknown> & { message?: string } };

async function post(url: string, body?: unknown): Promise<Reply> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    return { ok: res.ok, data: await res.json().catch(() => ({})) };
  } catch {
    return { ok: false, data: { message: "Sem ligação. Verifique a rede." } };
  }
}

/** Mudança de página completa: o painel central lê o cookie novo logo à primeira. */
const goTo = (path: string) => window.location.assign(path);

/** O utilizador fechou a janela do Face ID / Touch ID: não é um erro a mostrar a vermelho. */
const cancelled = (e: unknown) => e instanceof Error && (e.name === "NotAllowedError" || e.name === "AbortError");

function ErrorBox({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
      {text}
    </p>
  );
}

/** Registar o Face ID / Touch ID deste aparelho (primeira configuração ou mais um aparelho). */
export async function registerPasskey(activationCode?: string): Promise<{ ok: true; recoveryCodes: string[] | null } | { ok: false; message: string | null }> {
  const opts = await post("/api/central/2fa/chave/opcoes-registo", activationCode ? { codigoAtivacao: activationCode } : {});
  if (!opts.ok) return { ok: false, message: opts.data.message ?? "Não foi possível começar." };
  let response;
  try {
    response = await startRegistration({ optionsJSON: opts.data.options as Parameters<typeof startRegistration>[0]["optionsJSON"] });
  } catch (e) {
    if (e instanceof Error && e.name === "InvalidStateError") return { ok: false, message: "Este aparelho já tem uma chave registada." };
    return { ok: false, message: cancelled(e) ? null : "O aparelho não conseguiu criar a chave." };
  }
  const done = await post("/api/central/2fa/chave/registar", { response });
  if (!done.ok) return { ok: false, message: done.data.message ?? "Não foi possível guardar a chave." };
  return { ok: true, recoveryCodes: (done.data.recoveryCodes as string[] | null) ?? null };
}

function CodeForm({ action, label, onDone }: { action: string; label: string; onDone: (data: Reply["data"]) => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  return (
    <form
      className="mt-6 grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        // Um envio de cada vez (o preenchimento automático do código também envia o formulário).
        if (sending.current) return;
        sending.current = true;
        setBusy(true);
        setError(null);
        const r = await post(action, { codigo: code });
        if (!r.ok) {
          sending.current = false;
          setBusy(false);
          setCode("");
          return setError(r.data.message ?? "Código inválido.");
        }
        // Fica "a verificar" até a página mudar: um segundo envio já não acontece.
        onDone(r.data);
      }}
    >
      <label className="text-sm font-semibold">
        {label}
        <input
          className={codeField}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          required
        />
      </label>
      <ErrorBox text={error} />
      <button type="submit" disabled={busy || code.length !== 6} className={primary}>
        {busy ? "A verificar…" : "Confirmar"}
      </button>
    </form>
  );
}

/** Códigos de recuperação: aparecem uma única vez, logo a seguir a ligar o primeiro método. */
export function RecoveryCodes({ codes, onContinue, continueLabel = "Continuar para o painel" }: { codes: string[]; onContinue: () => void; continueLabel?: string }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const text = `Códigos de recuperação MESVIO Central (cada um serve uma vez)\n\n${codes.join("\n")}\n`;
  return (
    <section className="mt-6 grid gap-4">
      <div className="rounded-2xl border border-line bg-card p-4">
        <p className="font-semibold">Guarde estes códigos de recuperação</p>
        <p className="mt-1 text-sm text-ink-soft">
          Servem para entrar se perder o telemóvel ou o Face ID deixar de funcionar. Cada um serve uma vez. Guarde-os nas Notas, num
          gestor de palavras-passe ou em papel. <strong>Não voltam a aparecer.</strong>
        </p>
        <ul className="mt-3 grid grid-cols-2 gap-2 font-mono text-base tabular-nums">
          {codes.map((c) => (
            <li key={c} className="rounded-lg bg-paper px-3 py-2 text-center select-all">
              {c}
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="min-h-10 rounded-xl border border-line bg-paper px-3 text-sm"
            onClick={async () => {
              await navigator.clipboard?.writeText(text).catch(() => undefined);
              setCopied(true);
            }}
          >
            {copied ? "✓ Copiados" : "Copiar"}
          </button>
          <a
            className="inline-flex min-h-10 items-center rounded-xl border border-line bg-paper px-3 text-sm"
            href={`data:text/plain;charset=utf-8,${encodeURIComponent(text)}`}
            download="mesvio-codigos-recuperacao.txt"
          >
            Descarregar
          </a>
        </div>
      </div>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" className="mt-0.5 size-5" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        Guardei os códigos num sítio seguro.
      </label>
      <button type="button" className={primary} disabled={!saved} onClick={onContinue}>
        {continueLabel}
      </button>
    </section>
  );
}

/**
 * Primeira entrada: (em produção) código de ativação recebido da equipa MESVIO e depois o Face ID /
 * Touch ID deste aparelho. A app de códigos fica como alternativa.
 */
export function TwoFactorSetup({ needsActivationCode }: { needsActivationCode: boolean }) {
  const [mode, setMode] = useState<"choose" | "app">("choose");
  const [setup, setSetup] = useState<{ secret: string; qrSvg: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activation, setActivation] = useState("");
  const [busy, setBusy] = useState(false);
  const [supported, setSupported] = useState(true);
  useEffect(() => setSupported(browserSupportsWebAuthn()), []);

  const activationOk = !needsActivationCode || activation.replace(/[^a-z0-9]/gi, "").length === 12;
  const finish = (recovery: string[] | null) => (recovery?.length ? setCodes(recovery) : goTo("/central"));

  async function withFaceId() {
    setBusy(true);
    setError(null);
    const r = await registerPasskey(needsActivationCode ? activation : undefined);
    setBusy(false);
    if (r.ok) finish(r.recoveryCodes);
    else setError(r.message);
  }

  async function withApp() {
    setBusy(true);
    setError(null);
    const r = await post("/api/central/2fa/iniciar", needsActivationCode ? { codigoAtivacao: activation } : {});
    setBusy(false);
    if (r.ok) {
      setSetup(r.data as { secret: string; qrSvg: string });
      setMode("app");
    } else setError(r.data.message ?? "Não foi possível começar a configuração.");
  }

  if (codes) {
    return (
      <section className="mt-8">
        <h1 className="text-3xl">Verificação ativada ✓</h1>
        <RecoveryCodes codes={codes} onContinue={() => goTo("/central")} />
      </section>
    );
  }

  if (mode === "app" && setup) {
    return (
      <section className="mt-8">
        <h1 className="text-3xl">App de códigos</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Abra uma app de autenticação (Google Authenticator, Microsoft Authenticator, Palavras-passe do iPhone…), escolha{" "}
          <strong>adicionar conta</strong> e leia este QR Code.
        </p>
        <div
          className="mx-auto mt-6 w-52 rounded-2xl border border-line bg-white p-3 [&_svg]:h-auto [&_svg]:w-full"
          role="img"
          aria-label="QR Code para a app de autenticação"
          dangerouslySetInnerHTML={{ __html: setup.qrSvg }}
        />
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-ink-soft underline">Não consigo ler o QR Code</summary>
          <p className="mt-2">Introduza esta chave na app (tipo: baseado no tempo):</p>
          <code className="mt-1 block rounded-xl bg-card px-3 py-2 font-mono text-sm break-all select-all">{setup.secret.match(/.{1,4}/g)?.join(" ")}</code>
        </details>
        <CodeForm action="/api/central/2fa/confirmar" label="Código de 6 dígitos que a app mostra" onDone={(d) => finish((d.recoveryCodes as string[] | null) ?? null)} />
      </section>
    );
  }

  return (
    <section className="mt-8">
      <h1 className="text-3xl">Ativar verificação em dois passos</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Obrigatória para o painel central. A forma mais simples é o <strong>Face ID / Touch ID</strong> deste aparelho: fica guardado
        nas Palavras-passe do iCloud e funciona também no Mac.
      </p>
      <form
        className="mt-6 grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void (supported ? withFaceId() : withApp());
        }}
      >
        {needsActivationCode && (
          <label className="text-sm font-semibold">
            Código de ativação
            <input
              className="mt-1 block w-full rounded-xl border border-line bg-card px-4 py-3 text-center font-mono text-xl tracking-widest uppercase"
              value={activation}
              onChange={(e) => setActivation(e.target.value)}
              placeholder="XXXX-XXXX-XXXX"
              autoComplete="off"
              autoFocus
              required
            />
            <span className="mt-1 block font-normal text-ink-soft">Recebido da equipa MESVIO (não vem por email). Serve uma vez e expira em 48 horas.</span>
          </label>
        )}
        <ErrorBox text={error} />
        {supported ? (
          <button type="submit" disabled={busy || !activationOk} className={primary}>
            {busy ? "A ativar…" : "Ativar com Face ID / Touch ID"}
          </button>
        ) : (
          <p className="rounded-xl bg-card px-4 py-3 text-sm text-ink-soft">Este navegador não suporta Face ID / Touch ID. Use a app de códigos.</p>
        )}
        <button type={supported ? "button" : "submit"} disabled={busy || !activationOk} className={secondary} onClick={supported ? () => void withApp() : undefined}>
          Usar uma app de códigos
        </button>
      </form>
    </section>
  );
}

/** Entradas seguintes: Face ID / Touch ID, código da app ou, em último caso, código de recuperação. */
export function TwoFactorChallenge({ methods }: { methods: { passkey: boolean; totp: boolean } }) {
  const [mode, setMode] = useState<"passkey" | "app" | "recovery">(methods.passkey ? "passkey" : "app");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recovery, setRecovery] = useState("");
  const [after, setAfter] = useState<number | null>(null);

  async function faceId() {
    setBusy(true);
    setError(null);
    const opts = await post("/api/central/2fa/chave/opcoes-entrada");
    if (!opts.ok) {
      setBusy(false);
      return setError(opts.data.message ?? "Não foi possível começar.");
    }
    try {
      const response = await startAuthentication({ optionsJSON: opts.data.options as Parameters<typeof startAuthentication>[0]["optionsJSON"] });
      const r = await post("/api/central/2fa/chave/entrar", { response });
      if (r.ok) return goTo("/central");
      setError(r.data.message ?? "Não foi possível confirmar.");
    } catch (e) {
      if (!cancelled(e)) setError("O aparelho não conseguiu confirmar. Tente de novo ou use outra forma.");
    }
    setBusy(false);
  }

  if (after !== null) {
    return (
      <section className="mt-8">
        <h1 className="text-3xl">Entrou com um código de recuperação</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Restam {after} código(s). Registe já o Face ID / Touch ID deste aparelho e, se precisar, gere códigos novos em Segurança.
        </p>
        <button type="button" className={`${primary} mt-6 w-full`} onClick={() => goTo("/central/seguranca")}>
          Ir para Segurança
        </button>
      </section>
    );
  }

  return (
    <section className="mt-8">
      <h1 className="text-3xl">Verificação em dois passos</h1>
      {mode === "passkey" && (
        <div className="mt-6 grid gap-4">
          <p className="text-sm text-ink-soft">Confirme que é você com o Face ID ou Touch ID deste aparelho.</p>
          <ErrorBox text={error} />
          <button type="button" className={primary} disabled={busy} onClick={() => void faceId()} autoFocus>
            {busy ? "A confirmar…" : "Entrar com Face ID / Touch ID"}
          </button>
        </div>
      )}
      {mode === "app" && (
        <>
          <p className="mt-2 text-sm text-ink-soft">Introduza o código de 6 dígitos da sua app de autenticação.</p>
          <CodeForm action="/api/central/2fa/verificar" label="Código" onDone={() => goTo("/central")} />
        </>
      )}
      {mode === "recovery" && (
        <form
          className="mt-6 grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            const r = await post("/api/central/2fa/recuperacao", { codigo: recovery });
            setBusy(false);
            if (r.ok) setAfter(Number(r.data.remaining ?? 0));
            else setError(r.data.message ?? "Código inválido.");
          }}
        >
          <p className="text-sm text-ink-soft">Use um dos códigos de recuperação que guardou quando ativou a verificação.</p>
          <label className="text-sm font-semibold">
            Código de recuperação
            <input
              className="mt-1 block w-full rounded-xl border border-line bg-card px-4 py-3 text-center font-mono text-xl tracking-widest uppercase"
              value={recovery}
              onChange={(e) => setRecovery(e.target.value)}
              placeholder="XXXX-XXXX"
              autoComplete="off"
              autoFocus
              required
            />
          </label>
          <ErrorBox text={error} />
          <button type="submit" className={primary} disabled={busy || recovery.replace(/[^a-z0-9]/gi, "").length !== 8}>
            {busy ? "A verificar…" : "Entrar"}
          </button>
        </form>
      )}
      <div className="mt-6 grid justify-start gap-2">
        {mode !== "passkey" && methods.passkey && (
          <button type="button" className={linkBtn} onClick={() => (setError(null), setMode("passkey"))}>
            Usar Face ID / Touch ID
          </button>
        )}
        {mode !== "app" && methods.totp && (
          <button type="button" className={linkBtn} onClick={() => (setError(null), setMode("app"))}>
            Usar o código da app
          </button>
        )}
        {mode !== "recovery" && (
          <button type="button" className={linkBtn} onClick={() => (setError(null), setMode("recovery"))}>
            Usar um código de recuperação
          </button>
        )}
      </div>
    </section>
  );
}
