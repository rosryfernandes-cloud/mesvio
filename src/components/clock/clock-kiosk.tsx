"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EYES_CLOSED, EYES_OPEN, loadFaceEngine, readFace } from "./face-engine";

type Employee = { id: string; name: string; next: "in" | "out" };
type Match = { employeeId: string; name: string; next: "in" | "out"; ticket: string };
type Step =
  | { kind: "list" }
  | { kind: "pin"; emp: Employee }
  | { kind: "camera"; emp: Employee; pin: string }
  | { kind: "face" }
  | { kind: "confirm"; match: Match; photo: Blob | null }
  | { kind: "done"; name: string; what: "in" | "out"; at: string };

const IDLE_MS = 45_000;
const label = { in: "Entrada", out: "Saída" } as const;

/** Selfie reduzida (só prova do registo; não é analisada). */
async function snap(video: HTMLVideoElement): Promise<Blob | null> {
  const w = 360, h = Math.round((video.videoHeight / Math.max(video.videoWidth, 1)) * w) || 480;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (!g) return null;
  g.translate(w, 0);
  g.scale(-1, 1); // como num espelho, igual ao que a pessoa viu
  g.drawImage(video, 0, 0, w, h);
  return new Promise((r) => c.toBlob(r, "image/jpeg", 0.72));
}

export function ClockKiosk({ token }: { token: string }) {
  const [name, setName] = useState("");
  const [employees, setEmployees] = useState<Employee[] | null>(null);
  const [face, setFace] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>({ kind: "list" });
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    const res = await fetch(`/api/ponto/${token}`, { cache: "no-store" }).catch(() => null);
    if (!res) return setError("Sem ligação à internet. A tentar de novo…");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(data.message ?? "Não foi possível abrir o picar ponto.");
    setError(null);
    setName(data.establishmentName);
    setEmployees(data.employees);
    setFace(Boolean(data.face));
  }, [token]);

  useEffect(() => {
    void load();
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, [load]);

  // Sem toques durante um bocado, volta à lista (alguém deixou a meio).
  useEffect(() => {
    if (step.kind === "list") return;
    const t = setTimeout(() => setStep({ kind: "list" }), step.kind === "done" ? 4000 : IDLE_MS);
    return () => clearTimeout(t);
  }, [step]);

  useEffect(() => {
    if (step.kind === "done") void load();
  }, [step.kind, load]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col px-5 py-6 select-none">
      <header className="mb-6 flex items-baseline justify-between gap-4">
        <div>
          <p className="text-sm font-semibold tracking-wide text-ink-soft uppercase">Picar ponto</p>
          <h1 className="text-3xl font-extrabold tracking-tight">{name || "…"}</h1>
        </div>
        <p className="text-4xl font-extrabold tabular-nums">{now.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}</p>
      </header>

      {error && <p role="alert" className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-red-800">{error}</p>}

      {step.kind === "list" && (
        <>
          {face && (
            <button
              type="button"
              onClick={() => setStep({ kind: "face" })}
              className="mb-6 flex min-h-28 w-full items-center justify-center gap-4 rounded-3xl bg-brand px-6 text-white active:opacity-90"
            >
              <span aria-hidden="true" className="text-5xl">🙂</span>
              <span className="text-left">
                <span className="block text-2xl font-extrabold">Picar com a cara</span>
                <span className="block text-base opacity-85">Olhe para a câmara e pisque os olhos</span>
              </span>
            </button>
          )}
          <p className="mb-4 text-lg text-ink-soft">{face ? "Ou toque no seu nome e use o PIN." : "Toque no seu nome."}</p>
          {employees && employees.length === 0 && <p className="text-ink-soft">Ainda não há funcionários. O responsável acrescenta-os no painel, no separador Ponto.</p>}
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {(employees ?? []).map((e) => (
              <li key={e.id}>
                <button type="button" onClick={() => setStep({ kind: "pin", emp: e })} className="flex min-h-24 w-full flex-col items-start justify-center rounded-3xl border-2 border-line bg-card px-4 py-3 text-left active:border-brand">
                  <span className="text-xl font-bold">{e.name}</span>
                  <span className={`mt-1 text-sm font-semibold ${e.next === "in" ? "text-ok" : "text-brand"}`}>{e.next === "in" ? "→ Entrada" : "← Saída"}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {step.kind === "pin" && <PinPad emp={step.emp} onBack={() => setStep({ kind: "list" })} onDone={(pin) => setStep({ kind: "camera", emp: step.emp, pin })} />}

      {step.kind === "camera" && (
        <Camera
          token={token}
          emp={step.emp}
          pin={step.pin}
          onBack={() => setStep({ kind: "list" })}
          onWrongPin={() => setStep({ kind: "pin", emp: step.emp })}
          onDone={(r) => setStep({ kind: "done", name: r.name, what: r.kind, at: r.at })}
        />
      )}

      {step.kind === "face" && (
        <FaceScan token={token} onBack={() => setStep({ kind: "list" })} onMatch={(match, photo) => setStep({ kind: "confirm", match, photo })} />
      )}

      {step.kind === "confirm" && (
        <Confirm
          token={token}
          match={step.match}
          photo={step.photo}
          onNo={() => setStep({ kind: "list" })}
          onDone={(r) => setStep({ kind: "done", name: r.name, what: r.kind, at: r.at })}
        />
      )}

      {step.kind === "done" && (
        <div className="flex flex-1 flex-col items-center justify-center text-center" role="status">
          <span aria-hidden="true" className="grid size-28 place-items-center rounded-full bg-ok text-6xl text-white">✓</span>
          <p className="mt-6 text-4xl font-extrabold">{label[step.what]} registada</p>
          <p className="mt-2 text-2xl">
            {step.name} · {new Date(step.at).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}
          </p>
          <p className="mt-2 text-xl text-ink-soft">{step.what === "in" ? "Bom trabalho!" : "Até amanhã!"}</p>
        </div>
      )}

      <p className="mt-auto pt-8 text-center text-xs text-ink-soft">
        Registo dos tempos de trabalho (Código do Trabalho, art. 202.º). A foto serve só de prova do registo e só o responsável do restaurante
        a vê.{face ? " O reconhecimento facial é opcional: pode usar sempre o nome e o PIN." : ""}
      </p>
    </main>
  );
}

function PinPad({ emp, onBack, onDone }: { emp: Employee; onBack: () => void; onDone: (pin: string) => void }) {
  const [pin, setPin] = useState("");
  const press = (d: string) => {
    const next = (pin + d).slice(0, 4);
    setPin(next);
    if (next.length === 4) setTimeout(() => onDone(next), 120);
  };
  const key = "grid h-20 place-items-center rounded-3xl border-2 border-line bg-card text-3xl font-bold active:border-brand";
  return (
    <div className="mx-auto w-full max-w-sm">
      <p className="text-center text-2xl font-bold">{emp.name}</p>
      <p className="mt-1 text-center text-lg text-ink-soft">Vai registar a {label[emp.next].toLowerCase()}. Meta o seu PIN.</p>
      <div className="my-6 flex justify-center gap-4" aria-label={`${pin.length} de 4 algarismos`}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`size-5 rounded-full border-2 border-brand ${i < pin.length ? "bg-brand" : ""}`} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} type="button" className={key} onClick={() => press(d)}>
            {d}
          </button>
        ))}
        <button type="button" className={`${key} text-lg`} onClick={onBack}>
          Voltar
        </button>
        <button type="button" className={key} onClick={() => press("0")}>
          0
        </button>
        <button type="button" className={`${key} text-lg`} onClick={() => setPin(pin.slice(0, -1))} aria-label="Apagar">
          ⌫
        </button>
      </div>
    </div>
  );
}

function Camera({
  token,
  emp,
  pin,
  onBack,
  onWrongPin,
  onDone,
}: {
  token: string;
  emp: Employee;
  pin: string;
  onBack: () => void;
  onWrongPin: () => void;
  onDone: (r: { name: string; kind: "in" | "out"; at: string }) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [noCamera, setNoCamera] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 } }, audio: false })
      .then((s) => {
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play();
        }
      })
      .catch(() => setNoCamera(true));
    if (!navigator.mediaDevices) setNoCamera(true);
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);

  async function send() {
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.append("employeeId", emp.id);
    form.append("pin", pin);
    const photo = video.current && ready ? await snap(video.current) : null;
    if (photo) form.append("photo", photo, "ponto.jpg");
    const res = await fetch(`/api/ponto/${token}`, { method: "POST", body: form }).catch(() => null);
    setBusy(false);
    if (!res) return setError("Sem ligação à internet. Tente de novo.");
    const data = await res.json().catch(() => ({}));
    if (res.status === 403) return onWrongPin();
    if (!res.ok) return setError(data.message ?? "Não foi possível registar.");
    onDone(data);
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center">
      <p className="text-2xl font-bold">{emp.name}</p>
      <p className="mt-1 text-lg text-ink-soft">Ponha a cara dentro do oval e toque em Registar.</p>
      <div className="relative mt-4 aspect-[3/4] w-full max-w-xs overflow-hidden rounded-3xl bg-ink">
        {!noCamera && (
          <video ref={video} playsInline muted onLoadedData={() => setReady(true)} className="h-full w-full -scale-x-100 object-cover" />
        )}
        {noCamera && <p className="grid h-full place-items-center px-6 text-center text-paper">Sem acesso à câmara. O registo fica sem foto.</p>}
        {!noCamera && (
          <span aria-hidden="true" className="pointer-events-none absolute top-[12%] left-1/2 h-[66%] w-[62%] -translate-x-1/2 rounded-[50%] border-4 border-white/90 shadow-[0_0_0_999px_rgba(0,0,0,0.35)]" />
        )}
      </div>
      {error && <p role="alert" className="mt-3 text-red-700">{error}</p>}
      <div className="mt-5 flex w-full max-w-xs gap-3">
        <button type="button" onClick={onBack} disabled={busy} className="min-h-16 flex-1 rounded-3xl border-2 border-line bg-card text-lg font-semibold">
          Cancelar
        </button>
        <button type="button" onClick={() => void send()} disabled={busy || (!ready && !noCamera)} className="min-h-16 flex-[2] rounded-3xl bg-brand text-xl font-bold text-white disabled:opacity-60">
          {busy ? "A registar…" : `Registar ${label[emp.next].toLowerCase()}`}
        </button>
      </div>
    </div>
  );
}

/** Reconhecimento: espera por uma cara clara e um piscar de olhos (prova de vida), e pergunta ao servidor quem é. */
function FaceScan({ token, onBack, onMatch }: { token: string; onBack: () => void; onMatch: (m: Match, photo: Blob | null) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [hint, setHint] = useState("A abrir a câmara…");
  const [error, setError] = useState<string | null>(null);
  // O relógio do ecrã redesenha o pai: a câmara não pode reiniciar por isso.
  const onMatchRef = useRef(onMatch);
  useEffect(() => {
    onMatchRef.current = onMatch;
  });

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stop = false;
    const give = setTimeout(() => {
      stop = true;
      setError("Não consegui. Toque em Voltar e use o seu nome e PIN.");
    }, 25_000);
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 } }, audio: false });
        if (stop || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        setHint("A preparar…");
        const faceapi = await loadFaceEngine();
        let sawOpen = false, sawClosed = false;
        while (!stop) {
          const r = await readFace(faceapi, video.current!);
          if (!r) setHint("Ponha a cara dentro do oval.");
          else if (r.size < 0.2) setHint("Chegue um pouco mais perto.");
          else if (!sawOpen) {
            if (r.eyes > EYES_OPEN) sawOpen = true;
            setHint("Agora pisque os olhos.");
          } else if (!sawClosed) {
            if (r.eyes < EYES_CLOSED) sawClosed = true;
            setHint("Pisque os olhos.");
          } else if (r.eyes > EYES_OPEN) {
            // Piscou: usa esta leitura (olhos abertos) para saber quem é.
            setHint("A reconhecer…");
            const photo = await snap(video.current!);
            const form = new FormData();
            form.append("descriptor", JSON.stringify(r.descriptor));
            const res = await fetch(`/api/ponto/${token}`, { method: "POST", body: form }).catch(() => null);
            const data = res ? await res.json().catch(() => ({})) : {};
            if (stop) return;
            if (res?.ok) return onMatchRef.current(data as Match, photo);
            setError(data.message ?? "Não o reconheci.");
            return;
          }
          await new Promise((res) => setTimeout(res, 120));
        }
      } catch {
        if (!stop) setError("Não foi possível usar a câmara. Toque em Voltar e use o seu nome e PIN.");
      }
    })();
    return () => {
      stop = true;
      clearTimeout(give);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [token]);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center">
      <p className="text-2xl font-bold">Picar com a cara</p>
      <div className="relative mt-4 aspect-[3/4] w-full max-w-xs overflow-hidden rounded-3xl bg-ink">
        <video ref={video} playsInline muted className="h-full w-full -scale-x-100 object-cover" />
        <span aria-hidden="true" className="pointer-events-none absolute top-[12%] left-1/2 h-[66%] w-[62%] -translate-x-1/2 rounded-[50%] border-4 border-white/90 shadow-[0_0_0_999px_rgba(0,0,0,0.35)]" />
      </div>
      <p role="status" className={`mt-4 min-h-8 text-center text-xl font-semibold ${error ? "text-red-700" : ""}`}>{error ?? hint}</p>
      <button type="button" onClick={onBack} className="mt-4 min-h-14 w-full max-w-xs rounded-3xl border-2 border-line bg-card text-lg font-semibold">
        Voltar
      </button>
    </div>
  );
}

function Confirm({ token, match, photo, onNo, onDone }: { token: string; match: Match; photo: Blob | null; onNo: () => void; onDone: (r: { name: string; kind: "in" | "out"; at: string }) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function yes() {
    setBusy(true);
    const form = new FormData();
    form.append("ticket", match.ticket);
    if (photo) form.append("photo", photo, "ponto.jpg");
    const res = await fetch(`/api/ponto/${token}`, { method: "POST", body: form }).catch(() => null);
    setBusy(false);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) return setError(data.message ?? "Não foi possível registar. Use o nome e o PIN.");
    onDone(data);
  }
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <p className="text-xl text-ink-soft">Olá!</p>
      <p className="mt-1 text-5xl font-extrabold">É o {match.name}?</p>
      <p className="mt-3 text-xl">Vai registar a {label[match.next].toLowerCase()}.</p>
      {error && <p role="alert" className="mt-3 text-red-700">{error}</p>}
      <div className="mt-8 flex w-full max-w-md gap-3">
        <button type="button" onClick={onNo} disabled={busy} className="min-h-16 flex-1 rounded-3xl border-2 border-line bg-card text-lg font-semibold">
          Não sou eu
        </button>
        <button type="button" onClick={() => void yes()} disabled={busy} className="min-h-16 flex-[2] rounded-3xl bg-brand text-xl font-bold text-white disabled:opacity-60">
          {busy ? "A registar…" : "Sim, sou eu"}
        </button>
      </div>
    </div>
  );
}
