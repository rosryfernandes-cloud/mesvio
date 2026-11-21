"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EYES_CLOSED, EYES_OPEN, FRONTAL, loadFaceEngine, readEyes, readFace, TURNED } from "./face-engine";
import { cachedView, enqueue, flush, queued, saveView } from "./offline-queue";

type Kind = "in" | "out" | "pause" | "resume";
type State = "off" | "working" | "paused";
type Employee = { id: string; name: string; state: State; next: Kind };
type Match = { employeeId: string; name: string; state: State; next: Kind; ticket: string };
/** O que se pode escolher em cada estado (igual ao servidor). */
const CHOICES: Record<State, Kind[]> = { off: ["in"], working: ["pause", "out"], paused: ["resume", "out"] };
type Step =
  | { kind: "list" }
  | { kind: "pin"; emp: Employee }
  | { kind: "choose"; emp: Employee; pin: string }
  | { kind: "camera"; emp: Employee; pin: string; action: Kind }
  | { kind: "face" }
  | { kind: "confirm"; match: Match; photo: Blob | null; auto?: boolean }
  | { kind: "done"; name: string; what: Kind; at: string; offline?: boolean };

const IDLE_MS = 45_000;
const label: Record<Kind, string> = { in: "Entrada", out: "Saída", pause: "Pausa", resume: "Regresso da pausa" };
const button: Record<Kind, string> = { in: "Registar entrada", out: "Saída", pause: "Pausa", resume: "Voltar da pausa" };
const doneText: Record<Kind, { title: string; sub: string }> = {
  in: { title: "Entrada registada", sub: "Bom trabalho!" },
  out: { title: "Saída registada", sub: "Até amanhã!" },
  pause: { title: "Pausa registada", sub: "Bom descanso!" },
  resume: { title: "Regresso registado", sub: "Bom trabalho!" },
};

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
  const [offline, setOffline] = useState(false);
  const [pending, setPending] = useState(0);
  const [refused, setRefused] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>({ kind: "list" });
  const [now, setNow] = useState(() => new Date());

  type View = { establishmentName: string; employees: Employee[]; face: boolean };
  const apply = useCallback((v: View) => {
    setName(v.establishmentName);
    setEmployees(v.employees);
    setFace(Boolean(v.face));
  }, []);

  const load = useCallback(async () => {
    // Primeiro envia o que ficou guardado sem internet (assim o estado de cada um vem certo).
    if (queued(token).length > 0) {
      const r = await flush(token);
      setPending(r.remaining);
      if (r.refused.length) setRefused((old) => [...old, ...r.refused]);
    }
    const res = await fetch(`/api/ponto/${token}`, { cache: "no-store" }).catch(() => null);
    if (!res) {
      // Sem internet: usa a última lista guardada no tablet.
      setOffline(true);
      const v = cachedView<View>(token);
      if (v) apply(v);
      else setError("Sem ligação à internet. A tentar de novo…");
      return;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(data.message ?? "Não foi possível abrir o picar ponto.");
    setOffline(false);
    setError(null);
    apply(data);
    saveView(token, data);
  }, [token, apply]);

  useEffect(() => {
    setPending(queued(token).length);
    const retry = setInterval(() => void load(), 20_000);
    const online = () => void load();
    window.addEventListener("online", online);
    return () => {
      clearInterval(retry);
      window.removeEventListener("online", online);
    };
  }, [token, load]);

  /** Sem internet: guarda no tablet e atualiza logo o estado da pessoa na lista. */
  const saveOffline = useCallback(
    async (emp: Employee, pin: string, action: Kind, photo: Blob | null) => {
      const at = new Date().toISOString();
      const n = await enqueue(token, { employeeId: emp.id, name: emp.name, pin, action, at }, photo);
      setPending(n);
      setOffline(true);
      const state: State = action === "out" ? "off" : action === "pause" ? "paused" : "working";
      const next: Kind = state === "off" ? "in" : state === "paused" ? "resume" : "out";
      setEmployees((list) => {
        const updated = (list ?? []).map((e) => (e.id === emp.id ? { ...e, state, next } : e));
        saveView(token, { establishmentName: name, employees: updated, face });
        return updated;
      });
      setStep({ kind: "done", name: emp.name, what: action, at, offline: true });
    },
    [token, name, face],
  );

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
      {(offline || pending > 0) && (
        <p role="status" className="mb-4 rounded-2xl bg-amber-50 px-4 py-3 text-ink">
          {offline ? <strong>Sem internet. </strong> : null}
          {offline ? "Pode picar com o nome e o PIN: os registos ficam guardados no tablet e são enviados quando a ligação voltar." : "A enviar os registos guardados…"}
          {pending > 0 && ` (${pending} por enviar)`}
        </p>
      )}
      {refused.length > 0 && (
        <p role="alert" className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800">
          {refused.length === 1 ? "1 registo guardado sem internet não foi aceite" : `${refused.length} registos guardados sem internet não foram aceites`} ({[...new Set(refused)].join(", ")}). Peça
          ao responsável para os acrescentar no painel.{" "}
          <button type="button" className="underline" onClick={() => setRefused([])}>
            Fechar
          </button>
        </p>
      )}

      {step.kind === "list" && (
        <>
          {face && !offline && <FaceScan auto token={token} onMatch={(match, photo) => setStep({ kind: "confirm", match, photo, auto: true })} />}
          <p className="mb-4 text-lg text-ink-soft">{face ? "Ou toque no seu nome e use o PIN." : "Toque no seu nome."}</p>
          {employees && employees.length === 0 && <p className="text-ink-soft">Ainda não há funcionários. O responsável acrescenta-os no painel, no separador Ponto.</p>}
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {(employees ?? []).map((e) => (
              <li key={e.id}>
                <button type="button" onClick={() => setStep({ kind: "pin", emp: e })} className="flex min-h-24 w-full flex-col items-start justify-center rounded-3xl border-2 border-line bg-card px-4 py-3 text-left active:border-brand">
                  <span className="text-xl font-bold">{e.name}</span>
                  <span className={`mt-1 text-sm font-semibold ${e.state === "off" ? "text-ok" : e.state === "paused" ? "text-amber-700" : "text-brand"}`}>
                    {e.state === "off" ? "→ Entrada" : e.state === "paused" ? "Em pausa" : "A trabalhar"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {step.kind === "pin" && (
        <PinPad
          emp={step.emp}
          onBack={() => setStep({ kind: "list" })}
          onDone={(pin) => setStep(step.emp.state === "off" ? { kind: "camera", emp: step.emp, pin, action: "in" } : { kind: "choose", emp: step.emp, pin })}
        />
      )}

      {step.kind === "choose" && (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <p className="text-4xl font-extrabold">{step.emp.name}</p>
          <p className="mt-2 text-xl text-ink-soft">{step.emp.state === "paused" ? "Está em pausa. O que vai registar?" : "Está a trabalhar. O que vai registar?"}</p>
          <div className="mt-8 grid w-full max-w-md gap-3">
            {CHOICES[step.emp.state].map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setStep({ kind: "camera", emp: step.emp, pin: step.pin, action: k })}
                className={`min-h-20 rounded-3xl text-2xl font-bold ${k === "out" ? "border-2 border-line bg-card" : "bg-brand text-white"}`}
              >
                {button[k]}
              </button>
            ))}
            <button type="button" onClick={() => setStep({ kind: "list" })} className="min-h-14 text-lg text-ink-soft underline">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {step.kind === "camera" && (
        <Camera
          token={token}
          emp={step.emp}
          pin={step.pin}
          action={step.action}
          onOffline={(photo) => void saveOffline(step.emp, step.pin, step.action, photo)}
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
          auto={step.auto}
          onNo={() => setStep({ kind: "list" })}
          onDone={(r) => setStep({ kind: "done", name: r.name, what: r.kind, at: r.at })}
        />
      )}

      {step.kind === "done" && (
        <div className="flex flex-1 flex-col items-center justify-center text-center" role="status">
          <span aria-hidden="true" className="grid size-28 place-items-center rounded-full bg-ok text-6xl text-white">✓</span>
          <p className="mt-6 text-4xl font-extrabold">{doneText[step.what].title}</p>
          <p className="mt-2 text-2xl">
            {step.name} · {new Date(step.at).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}
          </p>
          <p className="mt-2 text-xl text-ink-soft">{doneText[step.what].sub}</p>
          {step.offline && <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-2 text-ink">Guardado no tablet: é enviado quando a internet voltar.</p>}
        </div>
      )}

      <p className="mt-auto pt-8 text-center text-xs text-ink-soft">
        Registo dos tempos de trabalho (Código do Trabalho, art. 202.º). A foto serve só de prova do registo e só o responsável do restaurante
        a vê.{face ? " A câmara procura caras para picar o ponto mas não grava; a foto só é guardada no momento do registo. Pode usar sempre o nome e o PIN." : ""}
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
      <p className="mt-1 text-center text-lg text-ink-soft">Meta o seu PIN.</p>
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
  action,
  onOffline,
  onBack,
  onWrongPin,
  onDone,
}: {
  token: string;
  emp: Employee;
  pin: string;
  action: Kind;
  onOffline: (photo: Blob | null) => void;
  onBack: () => void;
  onWrongPin: () => void;
  onDone: (r: { name: string; kind: Kind; at: string }) => void;
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
    form.append("action", action);
    const photo = video.current && ready ? await snap(video.current) : null;
    if (photo) form.append("photo", photo, "ponto.jpg");
    const res = await fetch(`/api/ponto/${token}`, { method: "POST", body: form }).catch(() => null);
    setBusy(false);
    // Sem internet: o PIN é verificado quando o registo for enviado.
    if (!res || res.status >= 500) return onOffline(photo);
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
          {busy ? "A registar…" : action === "in" ? "Registar entrada" : `Registar ${label[action].toLowerCase()}`}
        </button>
      </div>
    </div>
  );
}

/** Reconhecimento: espera por uma cara clara e um piscar de olhos (prova de vida), e pergunta ao servidor quem é. */
/** `auto`: fica sempre ligado no ecrã inicial (sem botões) e volta a tentar sozinho quando não reconhece. */
function FaceScan({ token, onBack, onMatch, auto = false }: { token: string; onBack?: () => void; onMatch: (m: Match, photo: Blob | null) => void; auto?: boolean }) {
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
    const give = auto
      ? undefined
      : setTimeout(() => {
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
        // Piscar adaptado a cada pessoa: mede os olhos abertos (máximo recente) e conta um piscar quando
        // descem bem abaixo disso e voltam a abrir. Um limite fixo falhava em quem tem olhos mais fechados.
        let sawOpen = false, sawClosed = false, idle = 0, openRef = 0, turned = false;
        while (!stop) {
          // Só os olhos (rápido) até piscar; a assinatura da cara só se calcula depois.
          const r = await readEyes(faceapi, video.current!);
          // Sem ninguém à frente, olha menos vezes (poupa bateria) e esquece um piscar a meio.
          idle = r && r.size >= 0.15 ? 0 : idle + 1;
          if (idle > 8) {
            sawOpen = sawClosed = turned = false;
            openRef = 0;
          }
          if (r && r.size >= 0.15 && TURNED(r.yaw)) turned = true;
          // Prova de vida: virou a cara e voltou a olhar de frente (ou piscou, se o modelo o apanhar).
          const alive = (turned && r && FRONTAL(r.yaw)) || (sawClosed && r && r.eyes > Math.max(EYES_OPEN * 0.75, openRef * 0.86));
          if (r && r.size >= 0.15) openRef = Math.max(openRef * 0.97, r.eyes);
          if (r && openRef > 0.18) sawOpen = true;
          if (r && sawOpen && r.eyes < Math.min(EYES_CLOSED + 0.02, openRef * 0.8)) sawClosed = true;
          if (!r) setHint(auto ? "Olhe para a câmara e vire a cara para o lado." : "Ponha a cara dentro do oval.");
          else if (r.size < 0.15) setHint("Chegue um pouco mais perto.");
          else if (!alive) setHint(turned ? "Agora olhe de frente." : "Vire a cara para o lado e volte.");
          else {
            // Piscou: agora sim, a assinatura da cara (olhos abertos) para saber quem é.
            setHint("A reconhecer…");
            const full = await readFace(faceapi, video.current!);
            if (!full) {
              sawOpen = sawClosed = turned = false;
              continue;
            }
            const photo = await snap(video.current!);
            const form = new FormData();
            form.append("descriptor", JSON.stringify(full.descriptor));
            const res = await fetch(`/api/ponto/${token}`, { method: "POST", body: form }).catch(() => null);
            const data = res ? await res.json().catch(() => ({})) : {};
            if (stop) return;
            if (res?.ok) return onMatchRef.current(data as Match, photo);
            if (!auto) {
              setError(data.message ?? "Não o reconheci.");
              return;
            }
            // Modo automático: avisa e volta a tentar daqui a pouco.
            setHint(data.message ?? "Não o reconheci. Tente outra vez ou use o seu nome e PIN.");
            sawOpen = sawClosed = turned = false;
            await new Promise((res) => setTimeout(res, 2500));
            continue;
          }
          // Com alguém à frente, sem pausa (cada leitura já demora); sem ninguém, poupa bateria.
          await new Promise((res) => setTimeout(res, idle > 8 ? 600 : 0));
        }
      } catch {
        if (!stop) setError(auto ? "Sem câmara: toque no seu nome e use o PIN." : "Não foi possível usar a câmara. Toque em Voltar e use o seu nome e PIN.");
      }
    })();
    return () => {
      stop = true;
      if (give) clearTimeout(give);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [token, auto]);

  if (auto)
    return (
      <div className="mb-6 flex items-center gap-4 rounded-3xl bg-brand p-4 text-white">
        <div className="relative aspect-[3/4] w-32 shrink-0 overflow-hidden rounded-2xl bg-ink sm:w-40">
          <video ref={video} playsInline muted className="h-full w-full -scale-x-100 object-cover" />
          <span aria-hidden="true" className="pointer-events-none absolute top-[10%] left-1/2 h-[70%] w-[66%] -translate-x-1/2 rounded-[50%] border-2 border-white/90" />
        </div>
        <div>
          <p className="text-2xl font-extrabold">Picar com a cara</p>
          <p role="status" className={`mt-1 text-lg ${error ? "text-amber-200" : "opacity-90"}`}>{error ?? hint}</p>
        </div>
      </div>
    );

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

function Confirm({
  token,
  match,
  photo,
  auto = false,
  onNo,
  onDone,
}: {
  token: string;
  match: Match;
  photo: Blob | null;
  auto?: boolean;
  onNo: () => void;
  onDone: (r: { name: string; kind: Kind; at: string }) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const choices = CHOICES[match.state];
  // Sozinho só o que é óbvio: a entrada, ou o regresso da pausa. A trabalhar, tem de escolher Pausa ou Saída.
  const autoKind: Kind | null = !auto ? null : match.state === "off" ? "in" : match.state === "paused" ? "resume" : null;
  const [count, setCount] = useState(autoKind ? 3 : 0);
  const sendRef = useRef<(k: Kind) => Promise<void>>(async () => {});

  useEffect(() => {
    if (!autoKind || error || busy) return;
    if (count === 0) {
      void sendRef.current(autoKind);
      return;
    }
    const t = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [autoKind, count, error, busy]);

  async function send(kind: Kind) {
    setBusy(true);
    const form = new FormData();
    form.append("ticket", match.ticket);
    form.append("action", kind);
    if (photo) form.append("photo", photo, "ponto.jpg");
    const res = await fetch(`/api/ponto/${token}`, { method: "POST", body: form }).catch(() => null);
    setBusy(false);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) return setError(data.message ?? "Não foi possível registar. Use o nome e o PIN.");
    onDone(data);
  }
  sendRef.current = send;

  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <p className="text-5xl font-extrabold">Olá, {match.name}!</p>
      <p className="mt-3 text-2xl">
        {busy
          ? "A registar…"
          : autoKind
            ? `A registar ${autoKind === "in" ? "a entrada" : "o regresso da pausa"} em ${count}…`
            : match.state === "working"
              ? "Está a trabalhar. O que vai registar?"
              : match.state === "paused"
                ? "Está em pausa. O que vai registar?"
                : "Vai registar a entrada."}
      </p>
      {error && <p role="alert" className="mt-3 text-red-700">{error}</p>}
      <div className="mt-8 grid w-full max-w-md gap-3">
        {choices
          .filter((k) => k !== autoKind)
          .map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => void send(k)}
              disabled={busy}
              className={`min-h-20 rounded-3xl text-2xl font-bold disabled:opacity-60 ${k === "out" ? "border-2 border-line bg-card" : "bg-brand text-white"}`}
            >
              {button[k]}
            </button>
          ))}
        <button type="button" onClick={onNo} disabled={busy} className="min-h-14 rounded-3xl border-2 border-line bg-card text-lg font-semibold">
          {autoKind ? "Cancelar, não sou eu" : "Não sou eu"}
        </button>
      </div>
    </div>
  );
}
