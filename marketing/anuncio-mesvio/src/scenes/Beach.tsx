import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, fontFamily } from "../brand";
import { useLayout } from "../components/layout";

/**
 * A esplanada vista de cima. "full": casa cheia, mesas a chamar; "chaos": espera a disparar e o
 * empregado a correr; "calm": depois da MESVIO, pedidos feitos e o empregado só a servir.
 */
export type BeachMode = "full" | "chaos" | "calm";

const UMBRELLA = [C.coral, C.amber, "#4FB3BF", C.coral, "#7FB069", C.amber, "#4FB3BF", "#7FB069", C.coral, C.amber];

function tablesFor(vertical: boolean, w: number, h: number) {
  const cols: number = vertical ? 2 : 5;
  const rows: number = vertical ? 3 : 2;
  const top = vertical ? h * 0.355 : h * 0.42;
  const bottom = vertical ? h * 0.6 : h * 0.72;
  const left = vertical ? w * 0.24 : w * 0.12;
  const right = vertical ? w * 0.76 : w * 0.88;
  const out: { x: number; y: number; i: number }[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const x = cols === 1 ? (left + right) / 2 : left + ((right - left) * c) / (cols - 1) + (r % 2 ? 0.04 * w : 0);
      const y = rows === 1 ? top : top + ((bottom - top) * r) / (rows - 1);
      out.push({ x, y, i: out.length });
    }
  return out;
}

function Umbrella({ x, y, r, color }: { x: number; y: number; r: number; color: string }) {
  const wedges = 8;
  return (
    <g transform={`translate(${x} ${y})`}>
      {/* cadeiras */}
      {[0, 1, 2, 3].map((k) => (
        <rect key={k} x={-r * 0.22} y={-r * 1.38} width={r * 0.44} height={r * 0.3} rx={r * 0.08} fill="#fff" opacity={0.85} transform={`rotate(${k * 90 + 45})`} />
      ))}
      <circle r={r * 1.04} fill="rgba(0,0,0,0.12)" transform={`translate(${r * 0.12} ${r * 0.16})`} />
      {Array.from({ length: wedges }, (_, k) => {
        const a1 = (k / wedges) * Math.PI * 2;
        const a2 = ((k + 1) / wedges) * Math.PI * 2;
        return (
          <path
            key={k}
            d={`M0 0L${Math.cos(a1) * r} ${Math.sin(a1) * r}A${r} ${r} 0 0 1 ${Math.cos(a2) * r} ${Math.sin(a2) * r}Z`}
            fill={k % 2 ? "#fff" : color}
          />
        );
      })}
      <circle r={r * 0.09} fill="#fff" stroke={color} strokeWidth={r * 0.04} />
    </g>
  );
}

/** Balão de "faz favor!" (mão no ar) ou, depois da MESVIO, um visto menta. */
function Call({ x, y, s, ok }: { x: number; y: number; s: number; ok: boolean }) {
  if (s <= 0.01) return null;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <circle r={34} fill={ok ? C.forest : "#fff"} stroke={ok ? C.mint : C.coral} strokeWidth={5} />
      {ok ? (
        <path d="m-13 1 9 9 17-18" fill="none" stroke={C.mint} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        // mão no ar
        <g fill={C.coral}>
          <rect x={-13} y={-8} width={24} height={24} rx={8} />
          <rect x={-13} y={-24} width={6} height={20} rx={3} />
          <rect x={-6} y={-28} width={6} height={22} rx={3} />
          <rect x={1} y={-26} width={6} height={20} rx={3} />
          <rect x={8} y={-20} width={6} height={16} rx={3} />
          <rect x={10} y={0} width={12} height={6} rx={3} transform="rotate(-35 16 3)" />
        </g>
      )}
    </g>
  );
}

/** O empregado visto de cima: camisa branca, avental verde, cabeça; bloco de notas ou bandeja. */
function Waiter({ x, y, s, tray, angle }: { x: number; y: number; s: number; tray: boolean; angle: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle}) scale(${s})`}>
      <ellipse cx={6} cy={10} rx={46} ry={30} fill="rgba(0,0,0,0.18)" />
      {/* braços */}
      <rect x={-50} y={-10} width={22} height={20} rx={10} fill="#f1c9a5" stroke="#fff" strokeWidth={3} />
      <rect x={28} y={-10} width={22} height={20} rx={10} fill="#f1c9a5" stroke="#fff" strokeWidth={3} />
      {/* ombros: camisa branca com contorno, alças do avental */}
      <rect x={-38} y={-22} width={76} height={44} rx={22} fill="#ffffff" stroke={C.forest} strokeWidth={4} />
      <rect x={-20} y={-21} width={8} height={42} fill={C.forest} />
      <rect x={12} y={-21} width={8} height={42} fill={C.forest} />
      {/* cabeça vista de cima: sobretudo cabelo */}
      <circle r={17} fill="#3b2416" stroke="#fff" strokeWidth={3} />
      <ellipse cx={0} cy={11} rx={9} ry={5} fill="#f1c9a5" />
      {tray ? (
        <g transform="translate(62 -2)">
          <circle r={24} fill="#e9eef0" stroke="#9aa5a2" strokeWidth={3} />
          <circle cx={-8} cy={-5} r={7} fill={C.amber} />
          <circle cx={8} cy={6} r={7} fill="#7FB069" />
        </g>
      ) : (
        <g transform="translate(58 -16)">
          <rect width={26} height={32} rx={4} fill="#fff" stroke="#9aa5a2" strokeWidth={2.5} />
          <path d="M5 9h16M5 16h16M5 23h11" stroke="#9aa5a2" strokeWidth={2} />
        </g>
      )}
    </g>
  );
}

export function Beach({ mode, duration }: { mode: BeachMode; duration: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { width: w, height: h, vertical, u } = useLayout();
  const tables = tablesFor(vertical, w, h);
  const r = (vertical ? 100 : 92) * u;
  const progress = frame / duration;

  // Tempo de espera e pedidos à espera.
  const wait =
    mode === "full"
      ? Math.round(interpolate(frame, [0, duration], [3, 6], { extrapolateRight: "clamp" }))
      : mode === "chaos"
        ? Math.round(interpolate(frame, [0, duration * 0.9], [6, 18], { extrapolateRight: "clamp" }))
        : Math.round(interpolate(frame, [0, duration * 0.7], [18, 2], { extrapolateRight: "clamp" }));
  const waiting = mode === "calm" ? 0 : mode === "full" ? Math.min(tables.length, Math.floor(frame / 9)) : tables.length + Math.floor(progress * 6);

  // Tremor de câmara no caos.
  const shake = mode === "chaos" ? interpolate(frame, [0, duration], [2, 9]) * u : 0;
  const dx = Math.sin(frame * 2.1) * shake;
  const dy = Math.cos(frame * 2.7) * shake;
  const warm = mode === "calm" ? 0.35 : 0;

  // Empregado: no caos corre de mesa em mesa; na calma passeia com a bandeja.
  const path = mode === "calm" ? [tables[1], tables[tables.length - 2]] : [tables[0], tables[3], tables[1], tables[tables.length - 1], tables[2]];
  const speed = mode === "chaos" ? 0.11 : mode === "full" ? 0.05 : 0.025;
  const pos = (frame * speed) % (path.length - 1);
  const seg = Math.floor(pos);
  const t = pos - seg;
  const ease = t * t * (3 - 2 * t);
  const a = path[seg];
  const b = path[seg + 1];
  const wx = a.x + (b.x - a.x) * ease;
  const wy = a.y + (b.y - a.y) * ease + r * 1.15;
  const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;

  const hud = spring({ frame: frame - 4, fps, config: { damping: 200 } });
  const waitColor = mode === "calm" ? "#166534" : wait >= 12 ? "#c2410c" : C.ink;

  return (
    <AbsoluteFill style={{ background: C.sand }}>
      <svg width={w} height={h} style={{ position: "absolute", inset: 0, transform: `translate(${dx}px, ${dy}px) scale(1.03)` }}>
        {/* mar */}
        <rect width={w} height={vertical ? h * 0.2 : h * 0.24} fill={C.sea} />
        {[0, 1, 2].map((k) => (
          <path
            key={k}
            d={`M0 ${(vertical ? h * 0.2 : h * 0.24) - k * 26 * u - 8 * u} ${Array.from({ length: 24 }, (_, i) => `Q${(i + 0.5) * (w / 24)} ${(vertical ? h * 0.2 : h * 0.24) - k * 26 * u - 8 * u + Math.sin(frame / 12 + i + k) * 7 * u} ${(i + 1) * (w / 24)} ${(vertical ? h * 0.2 : h * 0.24) - k * 26 * u - 8 * u}`).join(" ")}`}
            fill="none"
            stroke="rgba(255,255,255,0.55)"
            strokeWidth={4 * u}
          />
        ))}
        {/* espuma */}
        <rect y={(vertical ? h * 0.2 : h * 0.24) - 6 * u} width={w} height={12 * u} fill="rgba(255,255,255,0.7)" />
        {/* deck da esplanada */}
        <rect x={w * 0.04} y={vertical ? h * 0.27 : h * 0.31} width={w * 0.92} height={vertical ? h * 0.6 : h * 0.62} rx={40 * u} fill="#e8cfa2" />
        {tables.map((tb) => (
          <Umbrella key={tb.i} x={tb.x} y={tb.y} r={r} color={UMBRELLA[tb.i % UMBRELLA.length]} />
        ))}
        <Waiter x={wx} y={wy} s={u * (vertical ? 1.7 : 1.45)} tray={mode === "calm"} angle={angle * 0.15} />
        {tables.map((tb) => {
          const appear =
            mode === "full"
              ? spring({ frame: frame - 6 - tb.i * 7, fps, config: { damping: 12, stiffness: 160 } })
              : mode === "chaos"
                ? 1 + Math.max(0, Math.sin(frame / 3 + tb.i)) * 0.12
                : spring({ frame: frame - 4 - tb.i * 4, fps, config: { damping: 14 } });
          return <Call key={tb.i} x={tb.x + r * 0.55} y={tb.y - r * 0.75} s={appear * u * (vertical ? 1.5 : 1.15)} ok={mode === "calm"} />;
        })}
      </svg>

      {/* tom mais calmo depois da MESVIO */}
      <AbsoluteFill style={{ background: `rgba(200,233,218,${warm})` }} />

      {/* Indicadores */}
      <div
        style={{
          position: "absolute",
          top: vertical ? h * 0.215 : 36 * u,
          right: vertical ? undefined : 40 * u,
          left: vertical ? 0 : undefined,
          width: vertical ? "100%" : undefined,
          display: "flex",
          justifyContent: vertical ? "center" : "flex-end",
          gap: 18 * u,
          opacity: hud,
          transform: `translateY(${(1 - hud) * -20 * u}px)`,
          fontFamily,
        }}
      >
        <div style={{ background: "#fff", borderRadius: 24 * u, padding: `${14 * u}px ${24 * u}px`, boxShadow: "0 10px 30px rgba(0,0,0,0.15)" }}>
          <div style={{ fontSize: 22 * u, fontWeight: 700, color: C.inkSoft }}>Tempo de espera</div>
          <div style={{ fontSize: 58 * u, fontWeight: 800, color: waitColor, letterSpacing: "-0.03em" }}>{wait} min</div>
        </div>
        <div style={{ background: "#fff", borderRadius: 24 * u, padding: `${14 * u}px ${24 * u}px`, boxShadow: "0 10px 30px rgba(0,0,0,0.15)" }}>
          <div style={{ fontSize: 22 * u, fontWeight: 700, color: C.inkSoft }}>{mode === "calm" ? "Pedidos" : "Mesas a chamar"}</div>
          <div style={{ fontSize: 58 * u, fontWeight: 800, color: mode === "calm" ? "#166534" : C.ink, letterSpacing: "-0.03em" }}>
            {mode === "calm" ? "✓ feitos" : waiting}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}
