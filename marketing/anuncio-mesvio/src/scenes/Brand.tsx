import { AbsoluteFill, Easing, Freeze, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, fontFamily } from "../brand";
import { useLayout } from "../components/layout";
import { Logo } from "../components/Logo";
import { MenuScreen, StatusScreen, type MenuState } from "../components/MenuScreen";
import { Phone, SCREEN_H, SCREEN_W } from "../components/Phone";
import { RestaurantPanel } from "../components/RestaurantPanel";
import { TEXT } from "../script";
import { Beach } from "./Beach";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const empty: MenuState = { qty: { burger: 0, mojito: 0 }, bar: 0, sheet: 0, pressed: false };

/** Fundo verde-escuro da marca, com uma luz menta suave. */
function BrandBackground() {
  return <AbsoluteFill style={{ background: `radial-gradient(circle at 70% 30%, rgba(145,233,195,0.14), transparent 55%), ${C.forest}` }} />;
}

/** 3. O caos congela e é "varrido" para o verde MESVIO a partir do ponto menta; o logótipo desenha-se. */
export function Turn({ chaosDuration }: { chaosDuration: number }) {
  const frame = useCurrentFrame();
  const { width: w, height: h, vertical, u } = useLayout();
  const grey = interpolate(frame, [0, 8], [0, 1], clamp);
  const wipe = interpolate(frame, [8, 26], [0, Math.hypot(w, h)], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const dotIn = interpolate(frame, [2, 8], [0, 1], clamp);
  const draw = interpolate(frame, [26, 58], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  return (
    <AbsoluteFill>
      {/* o caos parado no último instante */}
      <AbsoluteFill style={{ filter: `grayscale(${grey}) brightness(${1 - grey * 0.25})` }}>
        <FrozenChaos at={chaosDuration - 1} duration={chaosDuration} />
      </AbsoluteFill>
      <AbsoluteFill style={{ clipPath: `circle(${wipe}px at 50% 50%)` }}>
        <BrandBackground />
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 30 * u }}>
        {frame < 26 ? (
          <div style={{ width: 46 * u * dotIn, height: 46 * u * dotIn, borderRadius: 999, background: C.mint, boxShadow: `0 0 ${60 * u}px ${C.mint}` }} />
        ) : (
          <Logo height={(vertical ? 150 : 170) * u} draw={draw} dot={interpolate(frame, [50, 62], [0, 1], clamp)} />
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

/** A esplanada "congelada" no último fotograma do caos (para a viragem). */
function FrozenChaos({ at, duration }: { at: number; duration: number }) {
  return (
    <Freeze frame={at}>
      <Beach mode="chaos" duration={duration} />
    </Freeze>
  );
}

/** Autocolante da mesa: QR Code + NFC. */
function Sticker({ size }: { size: number }) {
  const cells = 21;
  const cell = (size * 0.62) / cells;
  // Padrão determinístico com os três "olhos" de um QR (decorativo, não aponta para lado nenhum).
  const isEye = (x: number, y: number) => {
    const inBox = (bx: number, by: number) => x >= bx && x < bx + 7 && y >= by && y < by + 7;
    return inBox(0, 0) || inBox(cells - 7, 0) || inBox(0, cells - 7);
  };
  const eyeFill = (x: number, y: number) => {
    const ex = x < 7 ? x : x - (cells - 7);
    const ey = y < 7 ? y : y - (cells - 7);
    return ex === 0 || ex === 6 || ey === 0 || ey === 6 || (ex >= 2 && ex <= 4 && ey >= 2 && ey <= 4);
  };
  return (
    <div style={{ width: size, height: size * 1.25, background: "#fff", borderRadius: size * 0.08, padding: size * 0.08, boxShadow: "0 20px 50px rgba(0,0,0,0.3)", display: "flex", flexDirection: "column", alignItems: "center", fontFamily }}>
      <div style={{ fontSize: size * 0.075, fontWeight: 800, color: C.forest, textAlign: "center" }}>Toque ou leia para pedir</div>
      <svg width={size * 0.62} height={size * 0.62} style={{ marginTop: size * 0.06 }}>
        {Array.from({ length: cells * cells }, (_, k) => {
          const x = k % cells;
          const y = Math.floor(k / cells);
          const on = isEye(x, y) ? eyeFill(x, y) : (x * 7 + y * 13 + x * y) % 5 < 2;
          return on ? <rect key={k} x={x * cell} y={y * cell} width={cell} height={cell} fill={C.forest} /> : null;
        })}
      </svg>
      <div style={{ marginTop: size * 0.06, display: "flex", alignItems: "center", gap: size * 0.03, fontSize: size * 0.06, fontWeight: 700, color: C.inkSoft }}>
        <svg viewBox="0 0 24 24" width={size * 0.09} height={size * 0.09} fill="none" stroke={C.forest} strokeWidth={2} strokeLinecap="round">
          <path d="M8 8a6 6 0 0 1 0 8M11.5 5a10 10 0 0 1 0 14M4.5 11a2 2 0 0 1 0 2" />
        </svg>
        NFC · {TEXT.table}
      </div>
    </div>
  );
}

/** 4. O telemóvel aproxima-se do autocolante; ondas NFC; a ementa abre. */
export function Tap() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { width: w, height: h, vertical, u } = useLayout();
  const sticker = (vertical ? 420 : 330) * u;
  const phoneW = (vertical ? 470 : 360) * u;
  const enter = spring({ frame: frame - 6, fps, config: { damping: 18, stiffness: 90 } });
  const stickerIn = spring({ frame, fps, config: { damping: 200 } });
  const touch = 46; // fotograma do "toque"
  const lit = interpolate(frame, [touch, touch + 10], [0, 1], clamp);
  const cx = vertical ? w * 0.36 : w * 0.34;
  const cy = vertical ? h * 0.36 : h * 0.52;
  // Telemóvel: entra de baixo à direita e pousa ao lado do autocolante, ligeiramente sobreposto.
  const px = interpolate(enter, [0, 1], [w * (vertical ? 0.9 : 0.85), cx + sticker * (vertical ? 0.42 : 1.0)]);
  const py = interpolate(enter, [0, 1], [h * 1.1, vertical ? cy - phoneW * 0.15 : cy - phoneW * 0.95]);
  return (
    <AbsoluteFill>
      <BrandBackground />
      {/* mesa (madeira clara) */}
      <div style={{ position: "absolute", left: cx - sticker * 1.25, top: cy - sticker * 1.05, width: sticker * 2.5, height: sticker * 2.1, borderRadius: sticker, background: "radial-gradient(circle at 40% 35%, #f1dcb6, #d9b98a)", opacity: stickerIn }} />
      <div style={{ position: "absolute", left: cx - sticker / 2, top: cy - sticker * 0.62, transform: `scale(${0.8 + stickerIn * 0.2}) rotate(-4deg)`, opacity: stickerIn }}>
        <Sticker size={sticker} />
      </div>
      {/* ondas NFC */}
      {[0, 1, 2].map((k) => {
        const p = interpolate(frame, [touch + k * 6, touch + k * 6 + 26], [0, 1], clamp);
        return (
          <div
            key={k}
            style={{
              position: "absolute",
              left: cx + sticker * 0.05 - (sticker * 0.4 + p * sticker),
              top: cy - (sticker * 0.4 + p * sticker),
              width: (sticker * 0.4 + p * sticker) * 2,
              height: (sticker * 0.4 + p * sticker) * 2,
              borderRadius: 9999,
              border: `${6 * u}px solid ${C.mint}`,
              opacity: p > 0 ? 1 - p : 0,
            }}
          />
        );
      })}
      <div style={{ position: "absolute", left: px - phoneW / 2, top: py, transform: `rotate(${(1 - enter) * 12 - 3}deg)` }}>
        <Phone width={phoneW} glow={lit}>
          <div style={{ position: "absolute", inset: 0, background: "#000", opacity: 1 - lit, zIndex: 2 }} />
          <MenuScreen s={empty} />
        </Phone>
      </div>
    </AbsoluteFill>
  );
}

/** 5. A ementa MESVIO: dois toques, ver pedido, enviar. Interface igual à da app. */
export function Order() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { width: w, height: h, vertical, u } = useLayout();
  const phoneW = vertical ? 600 * u : 350 * u;
  const T = { burger: 26, mojito: 56, bar: 86, send: 124 };
  const pressAt = (t: number) => interpolate(frame, [t - 4, t, t + 6], [0, 1, 0], clamp);
  const after = (t: number) => (frame >= t ? 1 : 0);
  const s: MenuState = {
    qty: { burger: after(T.burger), mojito: after(T.mojito) },
    bar: spring({ frame: frame - T.burger, fps, config: { damping: 16 } }),
    sheet: spring({ frame: frame - T.bar - 2, fps, config: { damping: 20 } }),
    pressed: frame >= T.send && frame < T.send + 8,
  };
  // Dedo: desliza entre os alvos (coordenadas do ecrã 390×844).
  const targets = [
    { t: T.burger, x: 150, y: 352 },
    { t: T.mojito, x: 150, y: 480 },
    { t: T.bar, x: 200, y: 784 },
    { t: T.send, x: 200, y: 660 },
  ];
  let fx = targets[0].x;
  let fy = targets[0].y + 120;
  for (let i = 0; i < targets.length; i++) {
    const prev = i === 0 ? { x: targets[0].x + 60, y: targets[0].y + 200, t: 8 } : targets[i - 1];
    if (frame >= prev.t) {
      const p = interpolate(frame, [prev.t + 6, targets[i].t - 4], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
      fx = prev.x + (targets[i].x - prev.x) * p;
      fy = prev.y + (targets[i].y - prev.y) * p;
    }
  }
  const press = targets.reduce((m, t) => Math.max(m, pressAt(t.t)), 0);
  s.finger = { x: fx, y: fy, opacity: interpolate(frame, [8, 14, 136, 146], [0, 1, 1, 0], clamp), press };

  const enter = spring({ frame, fps, config: { damping: 200 } });
  const phoneH = (SCREEN_H / SCREEN_W) * phoneW * 0.93 + phoneW * 0.07;
  return (
    <AbsoluteFill>
      <BrandBackground />
      <div
        style={{
          position: "absolute",
          left: vertical ? (w - phoneW) / 2 : w * 0.5 - phoneW / 2,
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
          <SideLabel x={w * 0.17} y={h * 0.32} text="Ementa digital" sub="com fotos e alergénios" show={interpolate(frame, [10, 22], [0, 1], clamp)} />
          <SideLabel x={w * 0.83} y={h * 0.32} text="Dois toques" sub="e o pedido está feito" show={interpolate(frame, [60, 72], [0, 1], clamp)} />
        </>
      )}
    </AbsoluteFill>
  );
}

function SideLabel({ x, y, text, sub, show }: { x: number; y: number; text: string; sub: string; show: number }) {
  const { u } = useLayout();
  return (
    <div style={{ position: "absolute", left: x, top: y, transform: `translate(-50%, ${(1 - show) * 20}px)`, opacity: show, textAlign: "center", fontFamily, color: "#fff" }}>
      <div style={{ fontSize: 44 * u, fontWeight: 800, letterSpacing: "-0.02em" }}>{text}</div>
      <div style={{ fontSize: 26 * u, color: C.mint, marginTop: 6 * u }}>{sub}</div>
    </div>
  );
}

/** 6. O ponto menta leva o pedido do telemóvel ao sistema do restaurante; o telemóvel confirma. */
export function Send() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { width: w, height: h, vertical, u } = useLayout();
  const phoneW = (vertical ? 320 : 300) * u;
  const panelW = (vertical ? 820 : 860) * u;
  const phone = vertical ? { x: w * 0.5 - phoneW / 2, y: h * 0.205 } : { x: w * 0.12, y: h * 0.2 };
  const panel = vertical ? { x: (w - panelW) / 2, y: h * 0.6 } : { x: w * 0.47, y: h * 0.27 };
  const start = vertical ? { x: w * 0.5, y: phone.y + phoneW * 1.9 } : { x: phone.x + phoneW * 0.95, y: phone.y + phoneW * 1.05 };
  const end = vertical ? { x: w * 0.5, y: panel.y + 40 * u } : { x: panel.x + 40 * u, y: panel.y + panelW * 0.26 };
  const travel = interpolate(frame, [8, 40], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const ctrl = vertical ? { x: w * 0.85, y: (start.y + end.y) / 2 } : { x: (start.x + end.x) / 2, y: start.y - 260 * u };
  const bx = (1 - travel) ** 2 * start.x + 2 * (1 - travel) * travel * ctrl.x + travel ** 2 * end.x;
  const by = (1 - travel) ** 2 * start.y + 2 * (1 - travel) * travel * ctrl.y + travel ** 2 * end.y;
  const arrive = spring({ frame: frame - 40, fps, config: { damping: 14 } });
  const confirmed = frame >= 48;
  const check = interpolate(frame, [50, 64], [0, 1], clamp);
  const enter = spring({ frame, fps, config: { damping: 200 } });
  const footnote = interpolate(frame, [30, 44], [0, 1], clamp);
  return (
    <AbsoluteFill>
      <BrandBackground />
      {/* rasto */}
      <svg width={w} height={h} style={{ position: "absolute", inset: 0 }}>
        <path
          d={`M${start.x} ${start.y} Q${ctrl.x} ${ctrl.y} ${end.x} ${end.y}`}
          fill="none"
          stroke={C.mint}
          strokeWidth={5 * u}
          strokeDasharray={`${14 * u} ${14 * u}`}
          opacity={0.35 * Math.min(1, travel * 3)}
        />
        {travel > 0 && travel < 1 && <circle cx={bx} cy={by} r={22 * u} fill={C.mint} style={{ filter: `drop-shadow(0 0 ${20 * u}px ${C.mint})` }} />}
      </svg>
      <div style={{ position: "absolute", left: phone.x, top: phone.y, opacity: enter }}>
        <Phone width={phoneW} glow={confirmed ? 0.6 : 0.2}>
          {confirmed ? <StatusScreen check={check} /> : <MenuScreen s={{ qty: { burger: 1, mojito: 1 }, bar: 0, sheet: 1, pressed: true }} />}
        </Phone>
      </div>
      <div style={{ position: "absolute", left: panel.x, top: panel.y, opacity: enter, transform: `translateY(${(1 - enter) * 40 * u}px)` }}>
        <div style={{ fontFamily, color: C.mint, fontSize: 30 * u, fontWeight: 700 }}>Sistema do restaurante</div>
        <div style={{ fontFamily, color: "rgba(255,255,255,0.7)", fontSize: 21 * u, marginTop: 4 * u, marginBottom: 14 * u, opacity: footnote }}>{TEXT.posFootnote}</div>
        <RestaurantPanel width={panelW} arrive={arrive} />
      </div>
    </AbsoluteFill>
  );
}

/** 8. Assinatura: logótipo, slogan e chamada. */
export function EndCard() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { vertical, u } = useLayout();
  const a = spring({ frame, fps, config: { damping: 200 } });
  const b = spring({ frame: frame - 10, fps, config: { damping: 200 } });
  const c = spring({ frame: frame - 22, fps, config: { damping: 14 } });
  return (
    <AbsoluteFill>
      <BrandBackground />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", fontFamily, color: "#fff", padding: 80 * u, textAlign: "center" }}>
        <div style={{ opacity: a, transform: `scale(${0.9 + a * 0.1})` }}>
          <Logo height={(vertical ? 130 : 120) * u} />
        </div>
        <div style={{ marginTop: 50 * u, fontSize: (vertical ? 76 : 70) * u, fontWeight: 800, lineHeight: 1.08, letterSpacing: "-0.03em", maxWidth: vertical ? "100%" : "70%", opacity: b, transform: `translateY(${(1 - b) * 30 * u}px)` }}>
          {TEXT.slogan.replace(/\.$/, "")}
          <span style={{ color: C.mint }}>.</span>
        </div>
        <div style={{ marginTop: 26 * u, fontSize: 34 * u, color: "rgba(255,255,255,0.75)", opacity: b }}>{TEXT.tagline}</div>
        <div style={{ marginTop: 60 * u, background: C.mint, color: C.forest, fontWeight: 800, fontSize: 36 * u, padding: `${24 * u}px ${48 * u}px`, borderRadius: 999, transform: `scale(${c})` }}>
          {TEXT.cta} →
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
