import { CAMPAIGNS, MIN_SECONDS, SCENE_ORDER, VOICE_OFFSET, type CampaignId, type SceneId, type VoiceId } from "./campaigns";
import TIMINGS from "./timings.json";

export const FPS = 30;
/** Pausa (s) depois da última palavra antes do corte. */
const BREATH = 0.25;

export interface Word {
  w: string;
  start: number;
  end: number;
}
export interface Scene {
  id: SceneId;
  from: number;
  duration: number;
  /** Fotograma (dentro da cena) em que a fala começa. */
  voiceAt: number;
  words: Word[];
  text: string;
}

type Timings = Record<string, Record<string, Record<string, { duration: number; words: Word[] }>>>;

/** As cenas de uma campanha com uma voz: cada cena dura o mínimo da animação ou o tempo da fala. */
export function timelineFor(campaign: CampaignId, voice: VoiceId): Scene[] {
  const t = (TIMINGS as Timings)[campaign]?.[voice];
  let from = 0;
  return SCENE_ORDER.map((id) => {
    const words = t?.[id]?.words ?? [];
    const lastWord = words.length ? words[words.length - 1].end : 0;
    const needed = VOICE_OFFSET[id] / FPS + lastWord + BREATH;
    const duration = Math.round(Math.max(MIN_SECONDS[id], needed) * FPS);
    const scene = { id, from, duration, voiceAt: VOICE_OFFSET[id], words, text: CAMPAIGNS[campaign].lines[id] };
    from += duration;
    return scene;
  });
}

export const totalFrames = (campaign: CampaignId, voice: VoiceId) => timelineFor(campaign, voice).reduce((s, x) => s + x.duration, 0);
