import type { ReactNode } from "react";
import { AbsoluteFill, Audio, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig, type CalculateMetadataFunction } from "remotion";
import { C } from "../brand";
import { useLayout } from "../components/layout";
import { PlaceContext } from "../components/place";
import { Tap } from "../scenes/Brand";
import { CAMPAIGNS, type CampaignId, type SceneId, type VoiceId } from "./campaigns";
import { Steps, SyncedCaption } from "./Overlays";
import { EndCard, Order, Panel, Turn } from "./Scenes";
import { timelineFor, totalFrames, type Scene } from "./timeline";
import { Venue, venueLayout } from "./Venue";

export interface CampaignProps {
  campaign: CampaignId;
  voice: VoiceId;
  [key: string]: unknown;
}

/** A duração do vídeo depende da campanha e da voz (cada cena dura o tempo da sua fala). */
export const campaignMetadata: CalculateMetadataFunction<CampaignProps> = ({ props }) => ({
  durationInFrames: totalFrames(props.campaign, props.voice),
});

const CAPTION: Record<SceneId, { placement: "top" | "bottom"; size?: "big" } | null> = {
  hook: { placement: "bottom", size: "big" },
  problem: { placement: "bottom" },
  turn: { placement: "bottom" },
  tap: { placement: "top" },
  order: { placement: "top" },
  panel: { placement: "top" },
  deliver: { placement: "bottom" },
  // o fecho já mostra o slogan e a chamada à ação em grande
  end: null,
};

/** Anúncio das campanhas v2 (A — restaurantes, B — bares de praia), com voz, legendas e música. */
export function CampaignAd({ campaign, voice }: CampaignProps) {
  const c = CAMPAIGNS[campaign];
  const scenes = timelineFor(campaign, voice);
  const dur = (id: SceneId) => scenes.find((s) => s.id === id)!.duration;
  const place = {
    restaurant: c.place.restaurant,
    table: c.place.spot,
    area: c.place.area,
    panelBadge: "● Ao vivo",
    oldOrders: (campaign === "praia"
      ? [
          ["#013", "Cama 4", "2× Imperial · 1× Água", "6,00 €"],
          ["#012", "Cama 9", "1× Bowl de açaí", "9,50 €"],
          ["#011", "Cama 3", "2× Limonada", "7,00 €"],
        ]
      : [
          ["#013", "Mesa 4", "2× Imperial · 1× Tosta mista", "11,50 €"],
          ["#012", "Mesa 9", "1× Bowl de açaí", "9,50 €"],
          ["#011", "Mesa 7", "3× Limonada · 1× Couvert", "20,50 €"],
        ]) as [string, string, string, string][],
  };
  const view = (s: Scene) => {
    switch (s.id) {
      case "hook":
        return <Venue kind={campaign} mode="hook" duration={s.duration} />;
      case "problem":
        return (
          <>
            <Venue kind={campaign} mode="problem" duration={s.duration} />
            <StepsAt steps={c.steps} mode="problem" duration={s.duration} />
          </>
        );
      case "turn":
        return <Turn kind={campaign} problemDuration={dur("problem")} />;
      case "tap":
        return <Tap />;
      case "order":
        return <Order />;
      case "panel":
        return <Panel label={c.place.panelLabel} />;
      case "deliver":
        return (
          <>
            <Venue kind={campaign} mode="deliver" duration={s.duration} />
            <StepsAt steps={c.steps} mode="deliver" duration={s.duration} />
          </>
        );
      case "end":
        return <EndCard endLine={c.endLine} />;
    }
  };
  return (
    <PlaceContext.Provider value={place}>
      <AbsoluteFill style={{ background: C.forest }}>
        {scenes.map((s) => (
          <Sequence key={s.id} from={s.from} durationInFrames={s.duration} name={s.id}>
            <SceneIn skip={s.id === "turn" || s.id === "hook"}>{view(s)}</SceneIn>
            {CAPTION[s.id] && <SyncedCaption words={s.words} voiceAt={s.voiceAt} duration={s.duration} {...CAPTION[s.id]!} />}
          </Sequence>
        ))}
        <CampaignSound campaign={campaign} voice={voice} scenes={scenes} />
      </AbsoluteFill>
    </PlaceContext.Provider>
  );
}

function StepsAt(props: { steps: string[]; mode: "problem" | "deliver"; duration: number }) {
  const { width, height, vertical } = useLayout();
  return <Steps {...props} y={venueLayout(vertical, width, height).stepsY} />;
}

/** Entrada suave de cada cena (sem cortes secos nem transições "de PowerPoint"). */
function SceneIn({ children, skip }: { children: ReactNode; skip: boolean }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (skip) return <>{children}</>;
  const p = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 10 });
  return <AbsoluteFill style={{ opacity: Math.min(1, p * 1.4), transform: `scale(${1.025 - p * 0.025})` }}>{children}</AbsoluteFill>;
}

const sfx = (name: string) => staticFile(`audio/sfx/${name}.wav`);

function CampaignSound({ campaign, voice, scenes }: { campaign: CampaignId; voice: VoiceId; scenes: Scene[] }) {
  const at = (id: SceneId) => scenes.find((s) => s.id === id)!;
  const total = scenes.reduce((s, x) => s + x.duration, 0);
  const fps = 30;
  // intervalos com voz (fotogramas absolutos), para baixar a música por baixo da locução
  const speech = scenes.filter((s) => s.words.length).map((s) => [s.from + s.voiceAt + s.words[0].start * fps, s.from + s.voiceAt + s.words[s.words.length - 1].end * fps]);
  const duck = (absolute: number) => {
    let d = 0;
    for (const [a, b] of speech) d = Math.max(d, interpolate(absolute, [a - 6, a, b, b + 8], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
    return 1 - d * 0.55;
  };
  const turn = at("turn").from;
  const leveFrom = turn + 6;
  const ambience = campaign === "praia" ? "ondas" : "burburinho";
  const deliver = at("deliver");
  return (
    <>
      {scenes.map((s) => (
        <Sequence key={`v-${s.id}`} from={s.from + s.voiceAt} name={`voz ${s.id}`}>
          <Audio src={staticFile(`audio/campanhas/${campaign}/${voice}/${s.id}.wav`)} />
        </Sequence>
      ))}

      {/* Música: tensa no problema, leve e otimista da viragem ao fim; baixa por baixo da voz */}
      <Sequence durationInFrames={turn + 4} name="música tensão">
        <Audio src={sfx("musica-tensao")} volume={(f) => 0.34 * duck(f) * interpolate(f, [0, 6, turn - 2, turn + 4], [0, 1, 1, 0], { extrapolateRight: "clamp" })} />
      </Sequence>
      <Sequence from={leveFrom} durationInFrames={total - leveFrom} name="música leve">
        <Audio src={sfx("musica-leve")} volume={(f) => 0.3 * duck(f + leveFrom) * interpolate(f, [0, 12, total - leveFrom - 40, total - leveFrom], [0, 1, 1, 0], { extrapolateRight: "clamp" })} />
      </Sequence>

      {/* Ambiente: mar ou sala, no antes e na entrega */}
      <Sequence durationInFrames={turn} name="ambiente">
        <Audio src={sfx(ambience)} loop volume={(f) => interpolate(f, [0, 8, turn - 4, turn], [0, 0.3, 0.3, 0], { extrapolateRight: "clamp" })} />
      </Sequence>
      <Sequence from={deliver.from} durationInFrames={deliver.duration} name="ambiente entrega">
        <Audio src={sfx(ambience)} loop volume={(f) => interpolate(f, [0, 10, deliver.duration - 8, deliver.duration], [0, 0.18, 0.18, 0], { extrapolateRight: "clamp" })} />
      </Sequence>

      {/* Viragem */}
      <Sequence from={turn} name="impacto">
        <Audio src={sfx("impacto")} volume={0.55} />
      </Sequence>
      <Sequence from={turn + 6} name="brilho">
        <Audio src={sfx("brilho")} volume={0.3} />
      </Sequence>

      {/* Passagens suaves entre cenas */}
      {(["tap", "order", "panel", "deliver", "end"] as SceneId[]).map((id) => (
        <Sequence key={`w-${id}`} from={Math.max(0, at(id).from - 12)} durationInFrames={30} name="passagem">
          <Audio src={sfx("whoosh")} volume={0.16} />
        </Sequence>
      ))}

      {/* Interface: NFC, toques, pedido no painel, entrega */}
      <Sequence from={at("tap").from + 46} name="ping">
        <Audio src={sfx("ping")} volume={0.55} />
      </Sequence>
      {[22, 48, 80].map((f) => (
        <Sequence key={`k-${f}`} from={at("order").from + f} durationInFrames={10} name="toque">
          <Audio src={sfx("toque")} volume={0.5} />
        </Sequence>
      ))}
      <Sequence from={at("panel").from + 30} name="confirmado">
        <Audio src={sfx("confirmado")} volume={0.5} />
      </Sequence>
      <Sequence from={deliver.from + Math.round(deliver.duration * 0.72)} name="entregue">
        <Audio src={sfx("confirmado")} volume={0.32} playbackRate={1.2} />
      </Sequence>
      <Sequence from={at("end").from + 20} name="logótipo">
        <Audio src={sfx("ping")} volume={0.3} playbackRate={0.8} />
      </Sequence>
    </>
  );
}
