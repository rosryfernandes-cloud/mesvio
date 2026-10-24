import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { fontFamily } from "../brand";
import { useLayout } from "./layout";

/** Legenda grande (a maioria vê sem som). No 9:16 fica no terço central-baixo, fora da interface do TikTok/Reels. */
export function Caption({ text, duration, placement = "bottom" }: { text: string; duration: number; placement?: "top" | "bottom" }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { vertical, u } = useLayout();
  if (!text) return null;
  const enter = spring({ frame: frame - 3, fps, config: { damping: 200 } });
  const exit = interpolate(frame, [duration - 8, duration], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        // 9:16: fora das zonas da interface do TikTok/Reels (topo ~12% e fundo ~20%).
        ...(placement === "top" ? { top: vertical ? "11%" : 46 * u } : { bottom: vertical ? "24%" : 70 * u }),
        display: "flex",
        justifyContent: "center",
        padding: `0 ${60 * u}px`,
        opacity: enter * exit,
        transform: `translateY(${(1 - enter) * 30 * u}px)`,
      }}
    >
      <div
        style={{
          fontFamily,
          fontWeight: 800,
          fontSize: (vertical ? 64 : 52) * u,
          lineHeight: 1.15,
          letterSpacing: "-0.02em",
          textAlign: "center",
          color: "#fff",
          background: "rgba(6,45,37,0.82)",
          padding: `${18 * u}px ${34 * u}px`,
          borderRadius: 28 * u,
          maxWidth: vertical ? "100%" : "75%",
          backdropFilter: "blur(6px)",
        }}
      >
        {text}
      </div>
    </div>
  );
}
