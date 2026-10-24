import { AbsoluteFill, Easing, Freeze, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, fontFamily } from "../brand";
import { useLayout } from "../components/layout";
import { Logo } from "../components/Logo";
import { MenuScreen, StatusScreen, type MenuState } from "../components/MenuScreen";
import { Phone, SCREEN_H, SCREEN_W } from "../components/Phone";
import { RestaurantPanel } from "../components/RestaurantPanel";
import { BrandBackground } from "../scenes/Brand";
import { TEXT_V2, type CampaignId } from "./campaigns";
import { Venue } from "./Venue";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
/** Nas campanhas v2 o cliente pede uma bebida. */
const DRINK = { burger: 0, mojito: 1 };

/** A viragem: o problema congela, o verde MESVIO varre a partir do ponto menta e o logótipo desenha-se. */
export function Turn({ kind, problemDuration }: { kind: CampaignId; problemDuration: number }) {
  const frame = useCurrentFrame();
  const { width: w, height: h, vertical, u } = useLayout();
  const grey = interpolate(frame, [0, 6], [0, 1], clamp);
  const wipe = interpolate(frame, [5, 22], [0, Math.hypot(w, h)], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const dotIn = interpolate(frame, [0, 6], [0, 1], clamp);
  const draw = interpolate(frame, [20, 48], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ filter: `grayscale(${grey}) brightness(${1 - grey * 0.3})` }}>
        <Freeze frame={problemDuration - 1}>
          <Venue kind={kind} mode="problem" duration={problemDuration} />
        </Freeze>
      </AbsoluteFill>
      <AbsoluteFill style={{ clipPath: `circle(${wipe}px at 50% 45%)` }}>
        <BrandBackground />
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", paddingBottom: h * 0.1 }}>
        {frame < 20 ? (
          <div style={{ width: 46 * u * dotIn, height: 46 * u * dotIn, borderRadius: 999, background: C.mint, boxShadow: `0 0 ${60 * u}px ${C.mint}` }} />
        ) : (
          <Logo height={(vertical ? 170 : 170) * u} draw={draw} dot={interpolate(frame, [42, 54], [0, 1], clamp)} />
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

/** A ementa MESVIO: toca na bebida, abre o pedido e envia. Interface igual à da app. */
export function Order() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { width: w, height: h, vertical, u } = useLayout();
  const phoneW = vertical ? 600 * u : 350 * u;
  const T = { mojito: 22, bar: 48, send: 80 };
  const after = (t: number) => (frame >= t ? 1 : 0);
  const s: MenuState = {
    qty: { burger: 0, mojito: after(T.mojito) },
    bar: spring({ frame: frame - T.mojito, fps, config: { damping: 16 } }),
    sheet: spring({ frame: frame - T.bar - 2, fps, config: { damping: 20 } }),
    pressed: frame >= T.send && frame < T.send + 8,
  };
  // Dedo: desliza entre os alvos (coordenadas do ecrã 390×844).
  const targets = [
    { t: T.mojito, x: 160, y: 480 },
    { t: T.bar, x: 200, y: 784 },
    { t: T.send, x: 200, y: 560 },
  ];
  let fx = targets[0].x + 60;
  let fy = targets[0].y + 200;
  for (let i = 0; i < targets.length; i++) {
    const prev = i === 0 ? { x: targets[0].x + 60, y: targets[0].y + 200, t: 4 } : targets[i - 1];
    if (frame >= prev.t) {
      const p = interpolate(frame, [prev.t + 4, targets[i].t - 3], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
      fx = prev.x + (targets[i].x - prev.x) * p;
      fy = prev.y + (targets[i].y - prev.y) * p;
    }
  }
  const press = targets.reduce((m, t) => Math.max(m, interpolate(frame, [t.t - 4, t.t, t.t + 6], [0, 1, 0], clamp)), 0);
  s.finger = { x: fx, y: fy, opacity: interpolate(frame, [4, 10, 90, 98], [0, 1, 1, 0], clamp), press };

  const enter = spring({ frame, fps, config: { damping: 200 } });
  const phoneH = (SCREEN_H / SCREEN_W) * phoneW * 0.93 + phoneW * 0.07;
  return (
    <AbsoluteFill>
      <BrandBackground />
      <div
        style={{
          position: "absolute",
          left: (w - phoneW) / 2,
          top: vertical ? h * 0.23 : Math.max(170 * u, (h - phoneH) / 2 + 40 * u),
          transform: `translateY(${(1 - enter) * 80 * u}px) scale(${0.96 + enter * 0.04})`,
          opacity: enter,
        }}
      >
        <Phone width={phoneW} glow={0.4}>
          <MenuScreen s={s} />
        </Phone>
      </div>
      {!vertical && (
        <>
          <SideLabel x={w * 0.2} y={h * 0.36} text="A ementa abre" sub="sem instalar nada" show={interpolate(frame, [8, 20], [0, 1], clamp)} />
          <SideLabel x={w * 0.8} y={h * 0.36} text="Escolhe e confirma" sub="o pedido segue logo" show={interpolate(frame, [50, 62], [0, 1], clamp)} />
        </>
      )}
    </AbsoluteFill>
  );
}

function SideLabel({ x, y, text, sub, show }: { x: number; y: number; text: string; sub: string; show: number }) {
  const { u } = useLayout();
  return (
    <div style={{ position: "absolute", left: x, top: y, transform: `translate(-50%, ${(1 - show) * 20}px)`, opacity: show, textAlign: "center", fontFamily, color: "#fff", whiteSpace: "nowrap" }}>
      <div style={{ fontSize: 44 * u, fontWeight: 800, letterSpacing: "-0.02em" }}>{text}</div>
      <div style={{ fontSize: 26 * u, color: C.mint, marginTop: 6 * u }}>{sub}</div>
    </div>
  );
}

/** O pedido viaja do telemóvel para o painel MESVIO do espaço; o telemóvel confirma. */
export function Panel({ label }: { label: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { width: w, height: h, vertical, u } = useLayout();
  const phoneW = (vertical ? 300 : 290) * u;
  const panelW = (vertical ? 860 : 900) * u;
  const phone = vertical ? { x: w * 0.5 - phoneW / 2, y: h * 0.2 } : { x: w * 0.1, y: h * 0.19 };
  const panel = vertical ? { x: (w - panelW) / 2, y: h * 0.56 } : { x: w * 0.44, y: h * 0.25 };
  const start = vertical ? { x: w * 0.5, y: phone.y + phoneW * 1.95 } : { x: phone.x + phoneW * 0.95, y: phone.y + phoneW * 1.05 };
  const end = vertical ? { x: w * 0.5, y: panel.y + 60 * u } : { x: panel.x + 40 * u, y: panel.y + panelW * 0.26 };
  const travel = interpolate(frame, [4, 30], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const ctrl = vertical ? { x: w * 0.86, y: (start.y + end.y) / 2 } : { x: (start.x + end.x) / 2, y: start.y - 260 * u };
  const bx = (1 - travel) ** 2 * start.x + 2 * (1 - travel) * travel * ctrl.x + travel ** 2 * end.x;
  const by = (1 - travel) ** 2 * start.y + 2 * (1 - travel) * travel * ctrl.y + travel ** 2 * end.y;
  const arrive = spring({ frame: frame - 30, fps, config: { damping: 14 } });
  const confirmed = frame >= 36;
  const check = interpolate(frame, [38, 52], [0, 1], clamp);
  const enter = spring({ frame, fps, config: { damping: 200 } });
  return (
    <AbsoluteFill>
      <BrandBackground />
      <svg width={w} height={h} style={{ position: "absolute", inset: 0 }}>
        <path d={`M${start.x} ${start.y} Q${ctrl.x} ${ctrl.y} ${end.x} ${end.y}`} fill="none" stroke={C.mint} strokeWidth={5 * u} strokeDasharray={`${14 * u} ${14 * u}`} opacity={0.35 * Math.min(1, travel * 3)} />
        {travel > 0 && travel < 1 && <circle cx={bx} cy={by} r={22 * u} fill={C.mint} style={{ filter: `drop-shadow(0 0 ${20 * u}px ${C.mint})` }} />}
      </svg>
      <div style={{ position: "absolute", left: phone.x, top: phone.y, opacity: enter }}>
        <Phone width={phoneW} glow={confirmed ? 0.6 : 0.2}>
          {confirmed ? <StatusScreen check={check} qty={DRINK} /> : <MenuScreen s={{ qty: DRINK, bar: 0, sheet: 1, pressed: true }} />}
        </Phone>
      </div>
      <div style={{ position: "absolute", left: panel.x, top: panel.y, opacity: enter, transform: `translateY(${(1 - enter) * 40 * u}px)` }}>
        <div style={{ fontFamily, color: C.mint, fontSize: 32 * u, fontWeight: 800, marginBottom: 14 * u }}>{label}</div>
        <RestaurantPanel width={panelW} arrive={arrive} qty={DRINK} />
      </div>
    </AbsoluteFill>
  );
}

/** Assinatura: o logótipo em destaque, slogan, linha da campanha e a chamada à ação. */
export function EndCard({ endLine }: { endLine: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { vertical, u } = useLayout();
  const draw = interpolate(frame, [0, 26], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const dot = spring({ frame: frame - 22, fps, config: { damping: 9, stiffness: 160 } });
  const a = spring({ frame: frame - 28, fps, config: { damping: 200 } });
  const b = spring({ frame: frame - 44, fps, config: { damping: 200 } });
  const c = spring({ frame: frame - 58, fps, config: { damping: 13 } });
  return (
    <AbsoluteFill>
      <BrandBackground />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", fontFamily, color: "#fff", padding: 80 * u, textAlign: "center" }}>
        <div style={{ transform: `scale(${1.08 - a * 0.08})` }}>
          <Logo height={(vertical ? 200 : 170) * u} draw={draw} dot={dot} />
        </div>
        <div style={{ marginTop: 56 * u, fontSize: (vertical ? 74 : 66) * u, fontWeight: 800, lineHeight: 1.08, letterSpacing: "-0.03em", maxWidth: vertical ? "100%" : "62%", textWrap: "balance", opacity: a, transform: `translateY(${(1 - a) * 30 * u}px)` }}>
          {TEXT_V2.slogan.replace(/\.$/, "")}
          <span style={{ color: C.mint }}>.</span>
        </div>
        <div style={{ marginTop: 26 * u, fontSize: (vertical ? 36 : 32) * u, color: "rgba(255,255,255,0.8)", fontWeight: 600, opacity: b, transform: `translateY(${(1 - b) * 20 * u}px)` }}>{endLine}</div>
        <div style={{ marginTop: 56 * u, background: C.mint, color: C.forest, fontWeight: 800, fontSize: (vertical ? 40 : 36) * u, padding: `${26 * u}px ${54 * u}px`, borderRadius: 999, transform: `scale(${c})`, boxShadow: `0 0 ${50 * u * c}px rgba(145,233,195,0.45)` }}>
          {TEXT_V2.cta} →
        </div>
        <div style={{ marginTop: 34 * u, fontSize: 26 * u, letterSpacing: "0.04em", color: "rgba(255,255,255,0.6)", opacity: b }}>{TEXT_V2.tagline}</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
