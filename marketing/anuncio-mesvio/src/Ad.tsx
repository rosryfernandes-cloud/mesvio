import { AbsoluteFill, Sequence } from "remotion";
import { C } from "./brand";
import { Caption } from "./components/Caption";
import { Beach } from "./scenes/Beach";
import { EndCard, Order, Send, Tap, Turn } from "./scenes/Brand";
import { timeline, type SceneId } from "./script";
import { Soundtrack } from "./Soundtrack";

/** O anúncio completo: as cenas em sequência, cada uma com a sua legenda; com som provisório se `sound`. */
export function Ad({ sound = false, voiceDir = "voz" }: { sound?: boolean; voiceDir?: string }) {
  const scenes = timeline();
  const durationOf = (id: SceneId) => scenes.find((s) => s.id === id)!.duration;
  const view = (id: SceneId, duration: number) => {
    switch (id) {
      case "full":
        return <Beach mode="full" duration={duration} />;
      case "chaos":
        return <Beach mode="chaos" duration={duration} />;
      case "turn":
        return <Turn chaosDuration={durationOf("chaos")} />;
      case "tap":
        return <Tap />;
      case "order":
        return <Order />;
      case "send":
        return <Send />;
      case "calm":
        return <Beach mode="calm" duration={duration} />;
      case "end":
        return <EndCard />;
    }
  };
  return (
    <AbsoluteFill style={{ background: C.forest }}>
      {sound && <Soundtrack voiceDir={voiceDir} />}
      {scenes.map((s) => (
        <Sequence key={s.id} from={s.from} durationInFrames={s.duration} name={s.id}>
          {view(s.id, s.duration)}
          <Caption text={s.caption} duration={s.duration} placement={s.id === "order" || s.id === "send" || s.id === "tap" ? "top" : "bottom"} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
