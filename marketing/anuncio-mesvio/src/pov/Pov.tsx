import { AbsoluteFill, Audio, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, fontFamily } from "../brand";
import { Phone } from "../components/Phone";
import { EndCard } from "../scenes/Brand";

/**
 * Anúncio "POV: és dono de um beach club num sábado de agosto" — 15 s, 9:16, estilo nativo do
 * TikTok: vemos o telemóvel do dono. Notificações a disparar → risco de disco "Até que…" → o
 * painel MESVIO a encher-se sozinho de pedidos → assinatura. Voz: ElevenLabs (public/audio/pov-voz).
 */
export const POV_FPS = 30;
export const POV_FRAMES = 450;

/** Cenas em fotogramas. */
const S = { hook: 0, chaos: 105, freeze: 210, fix: 252, end: 354 };

/** Fala de cada cena: início em fotogramas (a duração é a do ficheiro). */
const VOICE: [string, number][] = [
  ["hook", 6],
  ["chaos", 108],
  ["turn", 216],
  ["fix", 258],
  ["end", 358],
];

const NOTIFS = [
  { app: "Sala", icon: "🍽️", text: "Mesa 7 está à espera há 20 min 😤" },
  { app: "Cozinha", icon: "👨‍🍳", text: "“hamb s/ceb” é sem cebola ou sem cebolada??" },
  { app: "Sala", icon: "🍽️", text: "A Cama 4 quer pedir e ninguém aparece" },
  { app: "Sala", icon: "🍽️", text: "Mesa 3 pediu mojito, levaram caipirinha 🙃" },
  { app: "Cozinha", icon: "👨‍🍳", text: "Acabaram as folhas do bloco" },
  { app: "Sala", icon: "🍽️", text: "Mesa 12 pede a conta pela 3.ª vez" },
  { app: "Sala", icon: "🍽️", text: "Mesa 9 foi-se embora sem pedir" },
];
/** Fotograma em que cada notificação chega (cada vez mais depressa). */
const NOTIF_AT = [62, 112, 140, 160, 176, 189, 200];

const ORDERS = [
  { n: "#031", where: "Mesa 7", items: "2× Imperial · 1× Tremoços", tag: "Novo" },
  { n: "#032", where: "Cama 4", items: "1× Bowl de açaí · 1× Água", tag: "Novo" },
  { n: "#033", where: "Mesa 3", items: "1× Mojito de maracujá", tag: "Novo" },
  { n: "#034", where: "Mesa 12", items: "Conta paga no telemóvel", tag: "Pago ✓" },
  { n: "#035", where: "Cama 9", items: "2× Limonada · 1× Tosta mista", tag: "Novo" },
];
/** Fotograma (relativo à cena "fix") em que cada pedido entra. */
const ORDER_AT = [16, 34, 50, 64, 78];

export function Pov({ sound = true }: { sound?: boolean }) {
  return (
    <AbsoluteFill style={{ background: "#000", fontFamily }}>
      <Sequence durationInFrames={S.end} name="telemóvel">
        <OwnerPhone />
      </Sequence>
      <Sequence from={S.end} name="assinatura">
        <EndCard />
      </Sequence>
      {sound && <PovSound />}
    </AbsoluteFill>
  );
}

/** O telemóvel do dono, na mão (fundo de praia desfocado), com os textos do TikTok por cima. */
function OwnerPhone() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const chaos = interpolate(frame, [S.chaos, S.freeze], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const frozen = frame >= S.freeze && frame < S.fix;
  // o "agora" congela durante o risco de disco
  const t = frozen ? S.freeze : frame;
  const calm = frame >= S.fix;
  // tremor da mão: leve sempre, forte no caos, nenhum na calma
  const shake = calm ? 0.3 : 1 + chaos * 9;
  const dx = Math.sin(t * 0.9) * shake + Math.sin(t * 2.3) * shake * 0.5;
  const dy = Math.cos(t * 0.7) * shake * 0.8;
  const rot = Math.sin(t * 0.4) * (calm ? 0.4 : 1 + chaos * 1.5);
  const enter = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 14 });
  // varrimento menta do ecrã quando entra a MESVIO
  const wipe = interpolate(frame, [S.fix, S.fix + 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const glow = calm ? interpolate(frame, [S.fix, S.fix + 20], [0, 0.8], { extrapolateRight: "clamp" }) : 0;
  return (
    <AbsoluteFill style={{ filter: frozen ? "grayscale(0.85) contrast(1.1)" : undefined }}>
      <BeachBlur chaos={chaos} calm={calm} />
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 640,
          transform: `translate(-50%, ${(1 - enter) * 300}px) translate(${dx}px, ${dy}px) rotate(${rot}deg)`,
        }}
      >
        <Phone width={660} glow={glow}>
          <LockScreen frame={t} />
          {wipe > 0 && (
            <div style={{ position: "absolute", inset: 0, clipPath: `circle(${wipe * 120}% at 50% 92%)` }}>
              <PanelScreen frame={frame - S.fix} />
            </div>
          )}
        </Phone>
      </div>
      {/* vinheta vermelha a subir no caos */}
      {!calm && <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 55%, transparent 45%, rgba(190,30,30,${chaos * 0.45}) 100%)` }} />}
      <Texts frame={frame} />
    </AbsoluteFill>
  );
}

/** Fundo: a praia ao sol, desfocada (como numa filmagem com o telemóvel em foco). */
function BeachBlur({ chaos, calm }: { chaos: number; calm: boolean }) {
  return (
    <AbsoluteFill style={{ filter: "blur(18px)", transform: "scale(1.1)" }}>
      <AbsoluteFill style={{ background: `linear-gradient(${C.sky} 0%, #FFD59A 32%, ${C.sea} 33%, ${C.sea} 48%, ${C.sand} 49%)` }} />
      <div style={{ position: "absolute", left: 760, top: 160, width: 220, height: 220, borderRadius: 999, background: C.sun }} />
      {[
        [120, 1060, C.coral],
        [520, 980, C.amber],
        [860, 1120, C.coral],
        [300, 1500, C.amber],
        [780, 1580, "#ffffff"],
      ].map(([x, y, c]) => (
        <div key={`${x}`} style={{ position: "absolute", left: x as number, top: y as number, width: 300, height: 120, borderRadius: "150px 150px 20px 20px", background: c as string }} />
      ))}
      {calm && <AbsoluteFill style={{ background: "rgba(6,45,37,0.35)" }} />}
      {!calm && <AbsoluteFill style={{ background: `rgba(255,120,60,${chaos * 0.15})` }} />}
    </AbsoluteFill>
  );
}

/** Ecrã de bloqueio com as notificações a empilhar (coordenadas do ecrã 390×844). */
function LockScreen({ frame }: { frame: number }) {
  const { fps } = useVideoConfig();
  // relógio: 14:07 → 14:31 no caos
  const minutes = Math.round(interpolate(frame, [S.chaos, S.freeze], [7, 31], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const shown = NOTIF_AT.filter((at) => frame >= at).length;
  return (
    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(170deg, #2b6f86 0%, #e9a26b 55%, #f6d2a2 100%)", fontFamily, color: "#fff" }}>
      <div style={{ textAlign: "center", marginTop: 70, fontSize: 17, fontWeight: 600, opacity: 0.9 }}>sábado, 16 de agosto</div>
      <div style={{ textAlign: "center", fontSize: 84, fontWeight: 700, lineHeight: 1, letterSpacing: "-0.03em" }}>14:{String(minutes).padStart(2, "0")}</div>
      <div style={{ position: "absolute", left: 12, right: 12, top: 226 }}>
        {NOTIFS.slice(0, shown)
          .map((n, i) => ({ ...n, i }))
          .reverse()
          .map((n, k) => {
            const p = spring({ frame: frame - NOTIF_AT[n.i], fps, config: { damping: 15, stiffness: 180 } });
            return (
              <div
                key={n.i}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  background: "rgba(245,245,245,0.82)",
                  color: "#111",
                  borderRadius: 20,
                  padding: "10px 12px",
                  marginBottom: 8,
                  opacity: Math.min(1, p * 1.5) * (k > 4 ? 0.5 : 1),
                  transform: `translateY(${(1 - p) * -24}px) scale(${0.92 + p * 0.08})`,
                  boxShadow: "0 6px 18px rgba(0,0,0,0.12)",
                }}
              >
                <div style={{ width: 36, height: 36, borderRadius: 9, background: n.app === "Sala" ? "#25a36a" : "#e8833a", display: "grid", placeItems: "center", fontSize: 20, flexShrink: 0 }}>{n.icon}</div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700 }}>
                    <span>{n.app}</span>
                    <span style={{ fontWeight: 500, color: "#666" }}>agora</span>
                  </div>
                  <div style={{ fontSize: 14, lineHeight: 1.25 }}>{n.text}</div>
                </div>
              </div>
            );
          })}
      </div>
      {shown > 2 && (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 120, textAlign: "center", fontSize: 14, fontWeight: 700, opacity: 0.9 }}>
          +{(shown - 2) * 7 + 12} notificações
        </div>
      )}
    </div>
  );
}

/** O painel MESVIO no telemóvel do dono, com os pedidos a entrar sozinhos. */
function PanelScreen({ frame }: { frame: number }) {
  const { fps } = useVideoConfig();
  const shown = ORDER_AT.filter((at) => frame >= at).length;
  return (
    <div style={{ position: "absolute", inset: 0, background: C.cream, fontFamily, color: C.ink }}>
      <div style={{ background: C.forest, color: "#fff", padding: "64px 18px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: 11, background: "rgba(255,255,255,0.1)", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 21, whiteSpace: "nowrap" }}>
            <span>
              m<span style={{ color: C.mint }}>.</span>
            </span>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", opacity: 0.7 }}>PAINEL</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>Beach Club</div>
          </div>
          <div style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: C.forest, background: C.mint, padding: "5px 10px", borderRadius: 999 }}>● Ao vivo</div>
        </div>
      </div>
      <div style={{ padding: "16px 14px" }}>
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 10 }}>
          Pedidos <span style={{ background: "#166534", color: "#fff", borderRadius: 999, padding: "2px 9px", fontSize: 12 }}>{shown}</span>
        </div>
        {ORDERS.slice(0, shown)
          .map((o, i) => ({ ...o, i }))
          .reverse()
          .map((o, k) => {
            const p = spring({ frame: frame - ORDER_AT[o.i], fps, config: { damping: 16, stiffness: 160 } });
            const fresh = k === 0;
            return (
              <div
                key={o.n}
                style={{
                  background: "#fff",
                  borderRadius: 16,
                  border: fresh ? `2px solid ${C.mint}` : "1px solid #dfe5df",
                  boxShadow: fresh ? `0 0 ${24 * p}px rgba(145,233,195,0.9)` : "none",
                  padding: "12px 14px",
                  marginBottom: 9,
                  opacity: Math.min(1, p * 1.4),
                  transform: `translateY(${(1 - p) * -30}px)`,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 16, fontWeight: 800 }}>
                  <span>
                    {o.n} <span style={{ fontWeight: 600, fontSize: 14 }}>{o.where}</span>
                  </span>
                  <span style={{ fontSize: 12, color: "#166534", background: "#ecfdf3", borderRadius: 999, padding: "3px 9px" }}>{o.tag}</span>
                </div>
                <div style={{ fontSize: 13.5, marginTop: 4, color: C.inkSoft }}>{o.items}</div>
              </div>
            );
          })}
      </div>
    </div>
  );
}

/** Textos ao estilo TikTok (caixa branca, letra preta), no topo e fora da interface da app. */
function Texts({ frame }: { frame: number }) {
  return (
    <>
      <TikTokText frame={frame} from={0} to={S.chaos} lines={["POV: és dono de um beach club", "num sábado de agosto ☀️"]} />
      <TikTokText frame={frame} from={S.chaos} to={S.freeze} lines={["Mesas a chamar.", "Pedidos trocados.", "Clientes à espera."]} stagger={22} />
      <TikTokText frame={frame} from={S.freeze} to={S.fix} lines={["Até que…"]} big />
      <TikTokText frame={frame} from={S.fix} to={S.end} lines={["cada mesa pede pelo telemóvel", "direto para a cozinha 👨‍🍳"]} stagger={42} />
      <TikTokText frame={frame} from={S.fix + 66} to={S.end} lines={["*o dono finalmente respira*"]} small top={500} />
    </>
  );
}

function TikTokText({
  frame,
  from,
  to,
  lines,
  stagger = 0,
  big = false,
  small = false,
  top = 300,
}: {
  frame: number;
  from: number;
  to: number;
  lines: string[];
  stagger?: number;
  big?: boolean;
  small?: boolean;
  top?: number;
}) {
  if (frame < from || frame >= to) return null;
  const f = frame - from;
  return (
    <div style={{ position: "absolute", left: 56, right: 56, top, display: "flex", flexDirection: "column", alignItems: big ? "center" : "flex-start", gap: 6 }}>
      {lines.map((line, i) => {
        // os textos do TikTok aparecem de uma vez (sem animação "de marca")
        if (f < i * stagger) return null;
        return (
          <span
            key={line}
            style={{
              fontFamily,
              fontWeight: 800,
              fontSize: big ? 110 : small ? 40 : 56,
              lineHeight: 1.15,
              background: small ? "rgba(0,0,0,0.6)" : "#fff",
              color: small ? "#fff" : "#000",
              padding: big ? "10px 34px" : "8px 22px",
              borderRadius: 16,
              fontStyle: small ? "italic" : "normal",
              alignSelf: big ? "center" : "flex-start",
            }}
          >
            {line}
          </span>
        );
      })}
    </div>
  );
}

const sfx = (name: string) => staticFile(`audio/sfx/${name}.wav`);

function PovSound() {
  return (
    <>
      {VOICE.map(([id, from]) => (
        <Sequence key={id} from={from} name={`voz ${id}`}>
          <Audio src={staticFile(`audio/pov-voz/${id}.wav`)} />
        </Sequence>
      ))}
      {/* praia ao fundo até ao risco de disco */}
      <Sequence durationInFrames={S.freeze} name="ondas">
        <Audio src={sfx("ondas")} volume={(f) => interpolate(f, [0, 8, S.freeze - 4, S.freeze], [0, 0.35, 0.35, 0])} />
      </Sequence>
      {/* batida do caos, corta seco no risco */}
      <Sequence from={S.chaos - 6} durationInFrames={S.freeze - S.chaos + 6} name="batida">
        <Audio src={sfx("batida")} volume={(f) => interpolate(f, [0, 30], [0.25, 0.5], { extrapolateRight: "clamp" })} />
      </Sequence>
      {NOTIF_AT.map((at) => (
        <Sequence key={at} from={at} durationInFrames={15} name="notificação">
          <Audio src={sfx("notif")} volume={0.55} />
        </Sequence>
      ))}
      <Sequence from={S.freeze} name="risco">
        <Audio src={sfx("risco")} volume={0.9} />
      </Sequence>
      <Sequence from={S.fix} name="brilho">
        <Audio src={sfx("brilho")} volume={0.4} />
      </Sequence>
      <Sequence from={S.fix + 4} name="fundo">
        <Audio src={sfx("fundo")} volume={(f) => interpolate(f, [0, 20, POV_FRAMES - S.fix - 30, POV_FRAMES - S.fix], [0, 0.5, 0.5, 0], { extrapolateRight: "clamp" })} />
      </Sequence>
      {ORDER_AT.map((at) => (
        <Sequence key={at} from={S.fix + at} durationInFrames={12} name="pedido">
          <Audio src={sfx("toque")} volume={0.6} />
        </Sequence>
      ))}
      <Sequence from={S.end + 22} name="confirmado">
        <Audio src={sfx("confirmado")} volume={0.5} />
      </Sequence>
    </>
  );
}
