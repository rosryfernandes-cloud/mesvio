/**
 * Guião do anúncio: tempos (segundos) e legendas. É o único sítio onde mudar textos e durações.
 * As cenas encadeiam-se pela ordem; o total tem de dar 30 s.
 */
export const FPS = 30;

export const SCENES = {
  full: { seconds: 4, caption: "Sábado, 14h. Casa cheia." },
  chaos: { seconds: 4, caption: "A equipa não chega a todo o lado." },
  turn: { seconds: 3, caption: "E se ninguém tivesse de esperar para pedir?" },
  tap: { seconds: 4, caption: "Aproxima. Ou lê o QR. Sem instalar nada." },
  order: { seconds: 5, caption: "Escolhe. Pede. Em segundos." },
  send: { seconds: 4, caption: "Direto para o sistema do restaurante." },
  calm: { seconds: 3, caption: "Menos espera. Mais serviço." },
  end: { seconds: 3, caption: "" },
} as const;

export type SceneId = keyof typeof SCENES;
export const ORDER: SceneId[] = ["full", "chaos", "turn", "tap", "order", "send", "calm", "end"];

export const TEXT = {
  slogan: "O empregado que não sabias que precisavas.",
  tagline: "Menos espera. Mais serviço.",
  cta: "Pede uma demonstração",
  /** Honesto: a ZoneSoft ainda não está ligada, por isso não se nomeia. */
  posFootnote: "Integração com sistemas POS compatíveis.",
  restaurant: "Beach Club",
  table: "Mesa 12",
};

/** Início (em fotogramas) e duração de cada cena. */
export function timeline() {
  let from = 0;
  return ORDER.map((id) => {
    const duration = Math.round(SCENES[id].seconds * FPS);
    const item = { id, from, duration, caption: SCENES[id].caption };
    from += duration;
    return item;
  });
}

export const TOTAL_FRAMES = timeline().reduce((s, x) => s + x.duration, 0);
