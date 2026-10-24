import { Audio, interpolate, Sequence, staticFile } from "remotion";
import { timeline, type SceneId } from "./script";

/**
 * Banda sonora PROVISÓRIA (para avaliar o ritmo): voz sintética "Joana" (macOS, PT-PT) e efeitos
 * e fundo musical sintetizados em código (scripts/gerar-sons.mjs). Para a versão final, trocar os
 * ficheiros em public/audio pela locução gravada e por música licenciada, com os mesmos nomes.
 */
const sfx = (name: string) => staticFile(`audio/sfx/${name}.wav`);
const voiceFile = (dir: string, id: SceneId) => staticFile(`audio/${dir}/${id}.wav`);

/** Atraso da fala dentro de cada cena (fotogramas), para não pisar as transições. */
// A pergunta da viragem entra logo no congelamento (a voz da ElevenLabs precisa de ~3,2 s) e acaba
// antes de a fala do toque começar (tap +10).
const VOICE_OFFSET: Record<SceneId, number> = { full: 6, chaos: 0, turn: 3, tap: 10, order: 20, send: 6, calm: 4, end: 6 };

/** `voiceDir`: pasta da locução em public/audio (por omissão "voz"; outras servem para comparar vozes). */
export function Soundtrack({ voiceDir = "voz" }: { voiceDir?: string }) {
  const scenes = timeline();
  const at = (id: SceneId) => scenes.find((s) => s.id === id)!.from;
  const len = (id: SceneId) => scenes.find((s) => s.id === id)!.duration;
  const beachEnd = at("turn");
  return (
    <>
      {/* Voz */}
      {scenes.map((s) => (
        <Sequence key={`v-${s.id}`} from={s.from + VOICE_OFFSET[s.id]} name={`voz ${s.id}`}>
          <Audio src={voiceFile(voiceDir, s.id)} volume={1} />
        </Sequence>
      ))}

      {/* Esplanada: mar; no caos, relógio a acelerar */}
      <Sequence from={0} durationInFrames={beachEnd} name="ondas">
        <Audio src={sfx("ondas")} loop volume={(f) => interpolate(f, [0, 10, beachEnd - 6, beachEnd], [0, 0.45, 0.45, 0], { extrapolateRight: "clamp" })} />
      </Sequence>
      {Array.from({ length: 12 }, (_, k) => {
        // tiques cada vez mais juntos durante o caos
        const from = at("chaos") + Math.round(len("chaos") * (1 - Math.pow(1 - k / 12, 1.6)));
        return (
          <Sequence key={`t-${k}`} from={from} durationInFrames={4} name="tique">
            <Audio src={sfx("tique")} volume={0.35} />
          </Sequence>
        );
      })}

      {/* Viragem */}
      <Sequence from={at("turn")} name="impacto">
        <Audio src={sfx("impacto")} volume={0.9} />
      </Sequence>
      <Sequence from={at("turn") + 8} name="brilho">
        <Audio src={sfx("brilho")} volume={0.45} />
      </Sequence>

      {/* Fundo musical calmo da viragem até ao fim (baixa quando há voz) */}
      <Sequence from={at("turn") + 10} name="fundo">
        <Audio src={sfx("fundo")} volume={0.55} />
      </Sequence>

      {/* Toque NFC */}
      <Sequence from={at("tap") + 46} name="ping">
        <Audio src={sfx("ping")} volume={0.7} />
      </Sequence>

      {/* Toques na ementa (mesmos fotogramas da animação) e envio */}
      {[26, 56, 86, 124].map((f) => (
        <Sequence key={`k-${f}`} from={at("order") + f} name="toque">
          <Audio src={sfx("toque")} volume={0.6} />
        </Sequence>
      ))}
      <Sequence from={at("send") + 6} name="whoosh">
        <Audio src={sfx("whoosh")} volume={0.6} />
      </Sequence>
      <Sequence from={at("send") + 46} name="confirmado">
        <Audio src={sfx("confirmado")} volume={0.6} />
      </Sequence>

      {/* Calma: o mar volta, mais baixo */}
      <Sequence from={at("calm")} durationInFrames={len("calm")} name="ondas calmas">
        <Audio src={sfx("ondas")} loop volume={(f) => interpolate(f, [0, 12, len("calm") - 8, len("calm")], [0, 0.25, 0.25, 0], { extrapolateRight: "clamp" })} />
      </Sequence>

      {/* Logótipo final */}
      <Sequence from={at("end")} name="assinatura">
        <Audio src={sfx("confirmado")} volume={0.35} playbackRate={0.75} />
      </Sequence>
    </>
  );
}
