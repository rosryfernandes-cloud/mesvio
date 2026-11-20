"use client";

import { useEffect, useRef, useState } from "react";
import { loadFaceEngine, readFace } from "@/components/clock/face-engine";

/** Registar a cara de um funcionário (no telemóvel ou tablet do dono): 4 leituras, a mexer um pouco a cabeça. */
const SAMPLES = 4;

export function FaceEnroll({ name, onSave, onClose }: { name: string; onSave: (samples: number[][]) => Promise<boolean>; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState("A abrir a câmara…");
  const [samples, setSamples] = useState<number[][]>([]);
  const [running, setRunning] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 } }, audio: false });
        if (cancelled) return;
        if (video.current) {
          video.current.srcObject = stream;
          await video.current.play();
        }
        setStatus("A preparar o reconhecimento…");
        await loadFaceEngine();
        if (!cancelled) {
          setReady(true);
          setStatus(`Peça ao ${name} para olhar para a câmara e carregue em Começar.`);
        }
      } catch {
        setError("Não foi possível abrir a câmara. Dê autorização ao browser e tente de novo.");
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [name]);

  async function capture() {
    if (!video.current) return;
    setRunning(true);
    setError(null);
    const faceapi = await loadFaceEngine();
    const got: number[][] = [];
    const hints = ["Olhe de frente", "Vire ligeiramente para a esquerda", "Vire ligeiramente para a direita", "Olhe de frente outra vez"];
    for (let i = 0; i < SAMPLES; i++) {
      setStatus(`${hints[i]}… (${i + 1} de ${SAMPLES})`);
      await new Promise((r) => setTimeout(r, 1200));
      let reading = null;
      for (let tries = 0; tries < 8 && !reading; tries++) {
        const r = await readFace(faceapi, video.current);
        if (r && r.size > 0.18) reading = r;
        else await new Promise((res) => setTimeout(res, 250));
      }
      if (!reading) {
        setRunning(false);
        setStatus("Não vi bem a cara. Chegue mais perto, com a cara bem iluminada, e tente de novo.");
        return;
      }
      got.push(reading.descriptor);
      setSamples([...got]);
    }
    setStatus("A guardar…");
    const ok = await onSave(got);
    setRunning(false);
    if (ok) onClose();
    else setStatus("Não foi possível guardar. Tente de novo.");
  }

  return (
    <div role="dialog" aria-label={`Registar a cara de ${name}`} className="fixed inset-0 z-50 grid place-items-center bg-ink/60 p-4">
      <div className="w-full max-w-sm rounded-3xl bg-card p-4">
        <h3 className="text-lg font-bold">Registar a cara de {name}</h3>
        <div className="relative mt-3 aspect-[3/4] w-full overflow-hidden rounded-2xl bg-ink">
          <video ref={video} playsInline muted className="h-full w-full -scale-x-100 object-cover" />
          <span aria-hidden="true" className="pointer-events-none absolute top-[12%] left-1/2 h-[66%] w-[62%] -translate-x-1/2 rounded-[50%] border-4 border-white/90" />
          <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
            {Array.from({ length: SAMPLES }, (_, i) => (
              <span key={i} className={`size-3 rounded-full ${i < samples.length ? "bg-ok" : "bg-white/50"}`} />
            ))}
          </div>
        </div>
        <p role="status" className="mt-3 min-h-10 text-sm">{error ?? status}</p>
        <p className="text-xs text-ink-soft">Guardamos só uma assinatura numérica da cara, cifrada, e nunca a foto. Pode apagá-la a qualquer momento.</p>
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={onClose} disabled={running} className="min-h-11 flex-1 rounded-xl border border-line bg-card font-semibold">
            Cancelar
          </button>
          <button type="button" onClick={() => void capture()} disabled={!ready || running} className="min-h-11 flex-[2] rounded-xl bg-brand font-semibold text-white disabled:opacity-60">
            {running ? "A registar…" : "Começar"}
          </button>
        </div>
      </div>
    </div>
  );
}
