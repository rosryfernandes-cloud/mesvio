"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const codeField =
  "mt-1 block w-full rounded-xl border border-line bg-card px-4 py-3 text-center text-2xl tracking-[0.4em] tabular-nums";
const primary = "min-h-12 rounded-2xl bg-brand px-5 font-semibold text-white disabled:opacity-50";

async function post(url: string, body?: unknown) {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    return { ok: res.ok, data: await res.json().catch(() => ({})) };
  } catch {
    return { ok: false, data: { message: "Sem ligação. Verifique a rede." } };
  }
}

function CodeForm({ action, label, onDone }: { action: string; label: string; onDone: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="mt-6 grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const r = await post(action, { codigo: code });
        setBusy(false);
        if (!r.ok) {
          setCode("");
          return setError(r.data.message ?? "Código inválido.");
        }
        onDone();
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
      {error && (
        <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy || code.length !== 6} className={primary}>
        {busy ? "A verificar…" : "Confirmar"}
      </button>
    </form>
  );
}

/** Primeira entrada: ligar uma app de autenticação e confirmar com o primeiro código. */
export function TwoFactorSetup() {
  const router = useRouter();
  const [setup, setSetup] = useState<{ secret: string; qrSvg: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const r = await post("/api/central/2fa/iniciar");
      if (r.ok) setSetup(r.data);
      else setError(r.data.message ?? "Não foi possível começar a configuração.");
    })();
  }, []);

  return (
    <section className="mt-8">
      <h1 className="text-3xl">Ativar verificação em dois passos</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Obrigatória para o painel central. Abra uma app de autenticação (Google Authenticator, Microsoft Authenticator, 1Password,
        Authy…), escolha <strong>adicionar conta</strong> e leia este QR Code.
      </p>
      {error && (
        <p role="alert" className="mt-4 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}
      {setup ? (
        <>
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
          <CodeForm
            action="/api/central/2fa/confirmar"
            label="Código de 6 dígitos que a app mostra"
            onDone={() => {
              router.replace("/central");
              router.refresh();
            }}
          />
          <p className="mt-4 text-xs text-ink-soft">
            Guarde o acesso à app com cuidado. Se perder o telemóvel, outro administrador pode repor o 2FA (npm run admin:repor-2fa).
          </p>
        </>
      ) : (
        !error && <p className="mt-6 text-ink-soft">A preparar…</p>
      )}
    </section>
  );
}

/** Entradas seguintes: só o código atual da app. */
export function TwoFactorChallenge() {
  const router = useRouter();
  return (
    <section className="mt-8">
      <h1 className="text-3xl">Verificação em dois passos</h1>
      <p className="mt-2 text-sm text-ink-soft">Introduza o código de 6 dígitos da sua app de autenticação.</p>
      <CodeForm
        action="/api/central/2fa/verificar"
        label="Código"
        onDone={() => {
          router.replace("/central");
          router.refresh();
        }}
      />
    </section>
  );
}
