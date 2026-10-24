import type { ReactNode } from "react";
import { C } from "../brand";

/** Ecrã desenhado a 390×844 (iPhone) e escalado para a largura pedida. */
export const SCREEN_W = 390;
export const SCREEN_H = 844;

export function Phone({ width, children, glow = 0 }: { width: number; children: ReactNode; glow?: number }) {
  const bezel = width * 0.035;
  const inner = width - bezel * 2;
  const scale = inner / SCREEN_W;
  return (
    <div
      style={{
        width,
        height: SCREEN_H * scale + bezel * 2,
        padding: bezel,
        borderRadius: width * 0.14,
        background: C.deep,
        boxShadow: `0 ${width * 0.08}px ${width * 0.2}px rgba(0,0,0,0.35), 0 0 ${width * 0.25 * glow}px rgba(145,233,195,${0.55 * glow})`,
        position: "relative",
      }}
    >
      <div style={{ width: inner, height: SCREEN_H * scale, borderRadius: width * 0.11, overflow: "hidden", position: "relative", background: C.cream }}>
        <div style={{ width: SCREEN_W, height: SCREEN_H, transform: `scale(${scale})`, transformOrigin: "top left", position: "absolute", inset: 0 }}>
          {children}
        </div>
      </div>
      {/* ilha dinâmica */}
      <div style={{ position: "absolute", top: bezel + inner * 0.03, left: "50%", width: inner * 0.28, height: inner * 0.075, marginLeft: -inner * 0.14, borderRadius: 999, background: "#000" }} />
    </div>
  );
}
