import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, fontFamily } from "../brand";
import { useLayout } from "../components/layout";
import type { Word } from "./timeline";
import { PROBLEM_PHASES } from "./Venue";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const SHORT = new Set(["a", "o", "e", "as", "os", "um", "uma", "de", "do", "da", "no", "na", "em", "ou", "para", "que", "se", "à", "não", "é", "mais"]);

/**
 * Faixa com os passos do serviço. No "problem" acende o passo que o funcionário está a fazer; no
 * "deliver" risca os três primeiros (ir, anotar, voltar) e deixa só preparar e entregar.
 */
export function Steps({ steps, mode, duration, y }: { steps: string[]; mode: "problem" | "deliver"; duration: number; y: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { vertical, u } = useLayout();
  const f = frame / duration;
  const enter = spring({ frame: frame - 2, fps, config: { damping: 200 } });
  const active = mode === "problem" ? Math.max(0, PROBLEM_PHASES.findIndex((p, k) => f >= p && f < PROBLEM_PHASES[k + 1])) : f < 0.22 ? 3 : 4;
  const strike = interpolate(f, [0.03, 0.16], [0, 1], clamp);
  const fs = (vertical ? 27 : 25) * u;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: y, transform: `translateY(-50%) translateY(${(1 - enter) * -16 * u}px)`, opacity: enter, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 * u, fontFamily }}>
      <div style={{ fontSize: fs * 0.72, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: mode === "problem" ? "#fff" : C.mint, background: mode === "problem" ? "rgba(16,33,29,0.75)" : C.forest, padding: `${5 * u}px ${14 * u}px`, borderRadius: 999 }}>
        {mode === "problem" ? "Serviço tradicional" : "Com a MESVIO"}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 * u }}>
        {steps.map((s, k) => {
          const gone = mode === "deliver" && k < 3;
          const on = k === active;
          const kept = mode === "deliver" && k >= 3;
          return (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: 8 * u }}>
              {k > 0 && <span style={{ color: "rgba(16,33,29,0.55)", fontWeight: 800, fontSize: fs * 0.9, opacity: gone ? 1 - strike * 0.6 : 1 }}>›</span>}
              <span
                style={{
                  position: "relative",
                  fontSize: fs,
                  fontWeight: 800,
                  whiteSpace: "nowrap",
                  padding: `${8 * u}px ${15 * u}px`,
                  borderRadius: 14 * u,
                  background: on ? C.forest : kept ? "#fff" : "rgba(255,255,255,0.88)",
                  color: on ? "#fff" : C.ink,
                  border: kept ? `${3 * u}px solid ${C.mint}` : `${3 * u}px solid transparent`,
                  boxShadow: on ? `0 8px 24px rgba(6,45,37,0.35)${mode === "deliver" ? `, 0 0 ${24 * u}px rgba(145,233,195,0.8)` : ""}` : "0 4px 12px rgba(0,0,0,0.08)",
                  transform: `scale(${on ? 1.06 : 1})`,
                  opacity: gone ? 1 - strike * 0.6 : 1,
                }}
              >
                {s}
                {gone && <span style={{ position: "absolute", left: 10 * u, top: "50%", height: 4 * u, width: `calc(${strike * 100}% - ${20 * u * strike}px)`, background: C.coral, borderRadius: 4 * u }} />}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Legenda sincronizada com a voz, palavra a palavra: mostra a frase aos blocos (curtos no 9:16),
 * a palavra dita fica a menta e as seguintes aparecem esbatidas, para se ler ao ritmo da locução.
 */
export function SyncedCaption({
  words,
  voiceAt,
  duration,
  placement = "bottom",
  size = "normal",
}: {
  words: Word[];
  voiceAt: number;
  duration: number;
  placement?: "top" | "bottom" | "center";
  size?: "normal" | "big";
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { vertical, u, height } = useLayout();
  if (!words.length) return null;
  const t = (frame - voiceAt) / fps;
  const maxWords = vertical ? 5 : 9;
  // Blocos: frase a frase (até à pontuação); uma frase longa divide-se em partes equilibradas,
  // para nunca ficar uma palavra ou duas sozinhas no ecrã.
  const phrases: Word[][] = [];
  let cur: Word[] = [];
  for (const w of words) {
    cur.push(w);
    if (/[.,?!…:]$/.test(w.w)) {
      phrases.push(cur);
      cur = [];
    }
  }
  if (cur.length) phrases.push(cur);
  const chunks: Word[][] = [];
  for (const p of phrases) {
    if (p.length === 1 && chunks.length) {
      chunks[chunks.length - 1].push(...p);
      continue;
    }
    const parts = Math.ceil(p.length / maxWords);
    const size = Math.ceil(p.length / parts);
    let k = 0;
    while (k < p.length) {
      let end = Math.min(p.length, k + size);
      // não acabar um bloco em "e", "a", "de"…: essas palavras passam para o bloco seguinte
      while (end < p.length && end - k > 2 && SHORT.has(p[end - 1].w.toLowerCase())) end--;
      // e uma ou duas palavras que sobrariam juntam-se a este bloco
      if (p.length - end <= 2) end = p.length;
      chunks.push(p.slice(k, end));
      k = end;
    }
  }
  const lead = 0.12;
  let idx = -1;
  chunks.forEach((c, k) => {
    if (t >= c[0].start - lead) idx = k;
  });
  if (idx < 0) return null;
  const chunk = chunks[idx];
  const chunkFrame = voiceAt + (chunk[0].start - lead) * fps;
  const pop = spring({ frame: frame - chunkFrame, fps, config: { damping: 18, stiffness: 220 }, durationInFrames: 8 });
  const exit = interpolate(frame, [duration - 6, duration], [1, 0], clamp);
  const fs = (size === "big" ? (vertical ? 76 : 64) : vertical ? 60 : 50) * u;
  const pos =
    placement === "top"
      ? { top: vertical ? height * 0.11 : 46 * u }
      : placement === "center"
        ? { top: "50%", transform: "translateY(-50%)" }
        : { bottom: vertical ? height * 0.235 : 64 * u };
  return (
    <div style={{ position: "absolute", left: 0, right: 0, ...pos, display: "flex", justifyContent: "center", padding: `0 ${56 * u}px`, opacity: exit }}>
      <div
        style={{
          fontFamily,
          fontWeight: 800,
          fontSize: fs,
          lineHeight: 1.16,
          letterSpacing: "-0.02em",
          textAlign: "center",
          textWrap: "balance",
          color: "#fff",
          background: "rgba(6,45,37,0.88)",
          padding: `${16 * u}px ${30 * u}px`,
          borderRadius: 26 * u,
          maxWidth: vertical ? "100%" : "78%",
          boxShadow: "0 14px 40px rgba(0,0,0,0.25)",
          transform: `scale(${0.94 + pop * 0.06})`,
          opacity: Math.min(1, pop * 1.6),
        }}
      >
        {chunk.map((w, k) => {
          const said = t >= w.start - 0.04;
          const now = said && t < w.end + 0.05;
          return (
            <span key={k} style={{ color: now ? C.mint : "#fff", opacity: said ? 1 : 0.38 }}>
              {w.w}
              {k < chunk.length - 1 ? " " : ""}
            </span>
          );
        })}
      </div>
    </div>
  );
}
