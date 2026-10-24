import { C, LOGO } from "../brand";

/** Logótipo "mesvio." — `draw` (0–1) desenha as letras traço a traço; `dot` (0–1) faz crescer o ponto menta. */
export function Logo({ height, color = C.white, draw = 1, dot = 1 }: { height: number; color?: string; draw?: number; dot?: number }) {
  return (
    <svg viewBox={LOGO.viewBox} style={{ height, width: "auto", overflow: "visible" }}>
      <g fill="none" stroke={color} strokeWidth={LOGO.stroke} strokeLinecap="round" strokeLinejoin="round">
        {LOGO.paths.map((d) => (
          <path key={d} d={d} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw} />
        ))}
      </g>
      <circle {...LOGO.iDot} fill={color} opacity={draw > 0.8 ? 1 : 0} />
      <circle cx={LOGO.dot.cx} cy={LOGO.dot.cy} r={LOGO.dot.r * dot} fill={C.mint} />
    </svg>
  );
}
