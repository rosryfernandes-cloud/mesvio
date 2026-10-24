import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, fontFamily } from "../brand";
import { useLayout } from "../components/layout";
import { Call, Umbrella, Waiter } from "../scenes/Beach";
import type { CampaignId } from "./campaigns";

/**
 * O espaço visto de cima: a praia (camas com chapéu e o bar) ou a sala (mesas e a cozinha).
 * - "hook": os clientes chamam um a um e o funcionário atravessa o espaço todo a pé;
 * - "problem": o serviço tradicional — ir ao cliente, anotar, voltar, preparar, entregar — com o
 *   passo atual marcado na faixa `Steps` (o rasto dos passos fica no chão);
 * - "deliver": com a MESVIO os pedidos chegam sozinhos (✓) e o funcionário só prepara e entrega.
 */
export type VenueMode = "hook" | "problem" | "deliver";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const UMBRELLA = [C.coral, C.amber, "#4FB3BF", "#7FB069", C.coral, C.amber, "#4FB3BF", "#7FB069", C.amber, C.coral, "#7FB069", "#4FB3BF", C.coral, C.amber, "#4FB3BF"];

export function venueLayout(vertical: boolean, w: number, h: number) {
  const cols = vertical ? 3 : 5;
  const rows = vertical ? 4 : 3;
  const x0 = vertical ? w * 0.2 : w * 0.33;
  const x1 = vertical ? w * 0.8 : w * 0.87;
  const y0 = vertical ? h * 0.255 : h * 0.355;
  const y1 = vertical ? h * 0.5 : h * 0.68;
  const spots: { x: number; y: number; i: number }[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) spots.push({ x: x0 + ((x1 - x0) * c) / (cols - 1) + (r % 2 ? (vertical ? 0.03 : 0.025) * w : 0), y: y0 + ((y1 - y0) * r) / (rows - 1), i: spots.length });
  const base = vertical ? { x: w * 0.5, y: h * 0.6 } : { x: w * 0.12, y: h * 0.53 };
  /** Linha da faixa de passos (entre o mar/parede e as camas/mesas). */
  const stepsY = vertical ? h * 0.168 : h * 0.215;
  /** Lugares-alvo: o mais distante (abertura e problema) e o que recebe a entrega. */
  const far = vertical ? spots[2] : spots[cols - 1];
  const problemSpot = vertical ? spots[0] : spots[cols * 2 + 3];
  const deliverSpot = vertical ? spots[4] : spots[cols + 2];
  return { spots, base, stepsY, far, problemSpot, deliverSpot, cols };
}

type Pt = { x: number; y: number };
const lerp = (a: Pt, b: Pt, t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const smooth = (t: number) => t * t * (3 - 2 * t);

/** Percurso do funcionário: pontos-chave (fração da cena → posição) e o que leva na mão. */
interface Keyframe {
  at: number;
  p: Pt;
  tray: boolean;
}
function positionAt(keys: Keyframe[], f: number) {
  if (f <= keys[0].at) return { ...keys[0].p, tray: keys[0].tray, moving: false, dir: 0 };
  for (let k = 1; k < keys.length; k++) {
    if (f <= keys[k].at) {
      const a = keys[k - 1];
      const b = keys[k];
      const t = (f - a.at) / Math.max(1e-6, b.at - a.at);
      const moving = a.p.x !== b.p.x || a.p.y !== b.p.y;
      return { ...lerp(a.p, b.p, smooth(t)), tray: b.tray && moving ? true : a.tray, moving, dir: Math.atan2(b.p.y - a.p.y, b.p.x - a.p.x) };
    }
  }
  const last = keys[keys.length - 1];
  return { ...last.p, tray: last.tray, moving: false, dir: 0 };
}

/** Fases do serviço tradicional (frações da cena "problem"), alinhadas com a faixa de passos. */
export const PROBLEM_PHASES = [0, 0.27, 0.4, 0.66, 0.78, 1];

export function Venue({ kind, mode, duration }: { kind: CampaignId; mode: VenueMode; duration: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { width: w, height: h, vertical, u } = useLayout();
  const L = venueLayout(vertical, w, h);
  const praia = kind === "praia";
  const f = frame / duration;
  const r = (vertical ? 58 : 50) * u;
  // o funcionário fica ao lado do lugar, não em cima dele
  const beside = (p: Pt) => ({ x: p.x - r * 1.35, y: p.y + r * 0.4 });
  const atBase = { x: L.base.x, y: L.base.y - (vertical ? 95 : 85) * u };

  const keys: Keyframe[] =
    mode === "hook"
      ? [
          { at: 0, p: atBase, tray: false },
          { at: 0.95, p: beside(L.far), tray: false },
        ]
      : mode === "problem"
        ? [
            { at: PROBLEM_PHASES[0], p: atBase, tray: false },
            { at: PROBLEM_PHASES[1], p: beside(L.problemSpot), tray: false },
            { at: PROBLEM_PHASES[2], p: beside(L.problemSpot), tray: false },
            { at: PROBLEM_PHASES[3], p: atBase, tray: false },
            { at: PROBLEM_PHASES[4], p: atBase, tray: true },
            { at: PROBLEM_PHASES[5], p: beside(L.problemSpot), tray: true },
          ]
        : [
            { at: 0, p: atBase, tray: true },
            { at: 0.22, p: atBase, tray: true },
            { at: 0.72, p: beside(L.deliverSpot), tray: true },
          ];
  const me = positionAt(keys, f);
  // rasto: pegadas na areia / passos no chão
  const trail: Pt[] = [];
  for (let k = 0; k <= frame; k += 2) trail.push(positionAt(keys, k / duration));
  const trailD = trail.length > 1 ? `M${trail.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join("L")}` : "";
  const delivered = mode === "deliver" && f >= 0.72;

  // câmara: aproximação lenta e contínua (sem tremer — é um anúncio premium, não um caos visual)
  const zoom = mode === "hook" ? interpolate(f, [0, 1], [1.0, 1.06]) : mode === "problem" ? interpolate(f, [0, 1], [1.06, 1.1]) : interpolate(f, [0, 1], [1.04, 1.0]);
  const sea = vertical ? h * 0.14 : h * 0.16;

  return (
    <AbsoluteFill style={{ background: praia ? C.sand : "#d8b98f", overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: `scale(${zoom})`, transformOrigin: `${w * 0.5}px ${h * 0.45}px` }}>
        <svg width={w} height={h} style={{ position: "absolute", inset: 0 }}>
          {praia ? <BeachGround w={w} h={h} sea={sea} u={u} frame={frame} /> : <RoomGround w={w} h={h} wall={sea} u={u} />}
          <path d={trailD} fill="none" stroke={praia ? "rgba(120,86,40,0.38)" : "rgba(6,45,37,0.28)"} strokeWidth={7 * u} strokeLinecap="round" strokeDasharray={`${0.1} ${16 * u}`} />
          {L.spots.map((s) => (praia ? <Lounger key={s.i} x={s.x} y={s.y} r={r} color={UMBRELLA[s.i % UMBRELLA.length]} /> : <Table key={s.i} x={s.x} y={s.y} r={r} />))}
          <Base x={L.base.x} y={L.base.y} u={u * (vertical ? 1.1 : 1)} praia={praia} />
          {mode === "deliver" && (
            <g>
              {/* o lugar que recebe a entrega */}
              <circle cx={L.deliverSpot.x} cy={L.deliverSpot.y} r={r * 1.75} fill="none" stroke={C.mint} strokeWidth={5 * u} opacity={delivered ? 1 - interpolate(f, [0.72, 1], [0, 0.6], clamp) : 0} />
            </g>
          )}
          <Waiter x={me.x} y={me.y} s={u * (vertical ? 1.25 : 1.05)} tray={me.tray} angle={me.moving ? Math.sin(frame * 0.9) * 4 : 0} />
          {L.spots.map((s) => {
            const appear =
              mode === "hook"
                ? spring({ frame: frame - 4 - s.i * 4, fps, config: { damping: 12, stiffness: 170 } })
                : mode === "problem"
                  ? 1 + Math.max(0, Math.sin(frame / 4 + s.i * 1.3)) * 0.1
                  : spring({ frame: frame - 2 - s.i * 2, fps, config: { damping: 14 } });
            const isTarget = mode === "problem" && s.i === L.problemSpot.i && f > PROBLEM_PHASES[2];
            if (isTarget) return null;
            return <Call key={s.i} x={s.x + r * 0.75} y={s.y - r * 0.95} s={appear * u * (vertical ? 1.15 : 0.95)} ok={mode === "deliver"} />;
          })}
        </svg>
        {mode === "deliver" && (
          <SpotTag x={L.deliverSpot.x} y={L.deliverSpot.y + r * 1.45} u={u} show={spring({ frame: frame - 6, fps, config: { damping: 200 } })} done={delivered} kind={kind} />
        )}
      </AbsoluteFill>
      {/* calor a subir no problema */}
      {mode === "problem" && <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 50%, transparent 55%, rgba(242,119,91,${0.28 * f}) 100%)` }} />}
      {mode === "deliver" && <AbsoluteFill style={{ background: "rgba(200,233,218,0.18)" }} />}
    </AbsoluteFill>
  );
}

function BeachGround({ w, h, sea, u, frame }: { w: number; h: number; sea: number; u: number; frame: number }) {
  return (
    <g>
      <rect width={w} height={h} fill={C.sand} />
      {/* grão da areia (determinístico) */}
      {Array.from({ length: 140 }, (_, k) => (
        <circle key={k} cx={(k * 7919) % w} cy={sea + ((k * 104729) % (h - sea))} r={(2 + (k % 3)) * u} fill="rgba(160,120,60,0.12)" />
      ))}
      <rect width={w} height={sea} fill={C.sea} />
      <rect width={w} height={sea * 0.45} fill="#3ea3b0" />
      {[0, 1, 2].map((k) => (
        <path
          key={k}
          d={`M0 ${sea - k * 24 * u - 8 * u} ${Array.from({ length: 24 }, (_, i) => `Q${(i + 0.5) * (w / 24)} ${sea - k * 24 * u - 8 * u + Math.sin(frame / 12 + i + k) * 6 * u} ${(i + 1) * (w / 24)} ${sea - k * 24 * u - 8 * u}`).join(" ")}`}
          fill="none"
          stroke="rgba(255,255,255,0.5)"
          strokeWidth={4 * u}
        />
      ))}
      <path d={`M0 ${sea} ${Array.from({ length: 12 }, (_, i) => `Q${(i + 0.5) * (w / 12)} ${sea + (8 + Math.sin(frame / 15 + i) * 5) * u} ${(i + 1) * (w / 12)} ${sea}`).join(" ")} V${sea - 10 * u} H0Z`} fill="rgba(255,255,255,0.75)" />
    </g>
  );
}

function RoomGround({ w, h, wall, u }: { w: number; h: number; wall: number; u: number }) {
  const plank = 46 * u;
  return (
    <g>
      <rect width={w} height={h} fill="#d8b98f" />
      {Array.from({ length: Math.ceil(w / plank) }, (_, k) => (
        <rect key={k} x={k * plank} y={wall} width={1.5 * u} height={h} fill="rgba(110,70,30,0.18)" />
      ))}
      {Array.from({ length: 60 }, (_, k) => (
        <rect key={`j${k}`} x={(k % Math.ceil(w / plank)) * plank} y={wall + ((k * 7919) % (h - wall))} width={plank} height={1.5 * u} fill="rgba(110,70,30,0.14)" />
      ))}
      {/* parede com janelas */}
      <rect width={w} height={wall} fill={C.deep} />
      {Array.from({ length: 5 }, (_, k) => (
        <rect key={`w${k}`} x={w * (0.06 + k * 0.19)} y={wall * 0.3} width={w * 0.13} height={wall * 0.45} rx={10 * u} fill="#f3e2c2" opacity={0.6} />
      ))}
    </g>
  );
}

/** Duas camas de praia com chapéu, vistas de cima. */
function Lounger({ x, y, r, color }: { x: number; y: number; r: number; color: string }) {
  const lw = r * 0.5;
  const lh = r * 1.35;
  return (
    <g>
      {[-1, 1].map((side) => (
        <g key={side} transform={`translate(${x + side * r * 0.36} ${y + r * 0.35})`}>
          <rect x={-lw / 2} y={-lh / 2} width={lw} height={lh} rx={r * 0.12} fill="#fff" stroke="rgba(0,0,0,0.12)" strokeWidth={2} />
          <rect x={-lw / 2 + 3} y={-lh / 2 + lh * 0.35} width={lw - 6} height={lh * 0.6} rx={r * 0.08} fill={color} opacity={0.55} />
        </g>
      ))}
      <Umbrella x={x} y={y - r * 0.25} r={r * 0.82} color={color} />
    </g>
  );
}

/** Mesa redonda com quatro cadeiras, vista de cima. */
function Table({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {[0, 1, 2, 3].map((k) => (
        <rect key={k} x={-r * 0.28} y={-r * 1.12} width={r * 0.56} height={r * 0.4} rx={r * 0.12} fill="#7a5532" transform={`rotate(${k * 90 + 45})`} />
      ))}
      <circle r={r * 0.8} fill="rgba(0,0,0,0.12)" transform={`translate(${r * 0.08} ${r * 0.1})`} />
      <circle r={r * 0.78} fill="#fbfaf6" stroke="#e3ddd0" strokeWidth={3} />
      <circle cx={-r * 0.3} cy={-r * 0.12} r={r * 0.18} fill="#fff" stroke="#d6d0c4" strokeWidth={2} />
      <circle cx={r * 0.28} cy={r * 0.16} r={r * 0.18} fill="#fff" stroke="#d6d0c4" strokeWidth={2} />
    </g>
  );
}

/** O bar de praia (telhado de colmo) ou o passe da cozinha. */
function Base({ x, y, u, praia }: { x: number; y: number; u: number; praia: boolean }) {
  const bw = 280 * u;
  const bh = 120 * u;
  return (
    <g transform={`translate(${x - bw / 2} ${y - bh / 2})`}>
      <rect x={6 * u} y={8 * u} width={bw} height={bh} rx={22 * u} fill="rgba(0,0,0,0.15)" />
      <rect width={bw} height={bh} rx={22 * u} fill={praia ? "#c98f45" : "#9aa5a2"} />
      {praia
        ? Array.from({ length: 9 }, (_, k) => <rect key={k} x={(k + 0.5) * (bw / 9) - 2 * u} y={6 * u} width={4 * u} height={bh - 12 * u} rx={2 * u} fill="rgba(255,231,194,0.35)" />)
        : Array.from({ length: 4 }, (_, k) => <rect key={k} x={(k + 0.6) * (bw / 4.4)} y={bh * 0.25} width={bw / 6} height={bh * 0.5} rx={8 * u} fill="rgba(255,255,255,0.35)" />)}
      <rect x={bw / 2 - 80 * u} y={bh / 2 - 24 * u} width={160 * u} height={48 * u} rx={24 * u} fill={C.forest} />
      <text x={bw / 2} y={bh / 2 + 10 * u} textAnchor="middle" fontFamily={fontFamily} fontWeight={800} fontSize={28 * u} fill="#fff" letterSpacing={2 * u}>
        {praia ? "BAR" : "COZINHA"}
      </text>
    </g>
  );
}

function SpotTag({ x, y, u, show, done, kind }: { x: number; y: number; u: number; show: number; done: boolean; kind: CampaignId }) {
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: `translate(-50%, 0) scale(${0.8 + show * 0.2})`,
        opacity: show,
        fontFamily,
        fontWeight: 800,
        fontSize: 26 * u,
        whiteSpace: "nowrap",
        color: done ? C.forest : "#fff",
        background: done ? C.mint : C.forest,
        padding: `${8 * u}px ${18 * u}px`,
        borderRadius: 999,
        boxShadow: "0 8px 20px rgba(0,0,0,0.2)",
      }}
    >
      {done ? "✓ Entregue" : `${kind === "praia" ? "Cama" : "Mesa"} 12 · 1× Mojito`}
    </div>
  );
}
