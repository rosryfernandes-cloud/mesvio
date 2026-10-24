/**
 * Campanhas v2 (A — restaurantes, B — bares de praia): falas, textos e tempos mínimos de cada cena.
 * É o único sítio onde mudar o guião. A duração final de cada cena é o maior valor entre o mínimo
 * daqui e o tempo da fala (ver timeline.ts), por isso mudar uma fala obriga a gerar a voz outra vez:
 * `npm run voz:campanhas`.
 */
export type CampaignId = "praia" | "restaurante";
export type VoiceId = "carlos" | "maria";
export type SceneId = "hook" | "problem" | "turn" | "tap" | "order" | "panel" | "deliver" | "end";

export const SCENE_ORDER: SceneId[] = ["hook", "problem", "turn", "tap", "order", "panel", "deliver", "end"];

/** Duração mínima (s) de cada cena: o tempo de que a animação precisa. */
export const MIN_SECONDS: Record<SceneId, number> = {
  hook: 3.6,
  problem: 3.6,
  turn: 2.4,
  tap: 3.3,
  order: 3.4,
  panel: 2.6,
  deliver: 3.6,
  end: 4.4,
};

/** Atraso (fotogramas) da fala dentro de cada cena, para não pisar a transição. */
export const VOICE_OFFSET: Record<SceneId, number> = {
  hook: 3,
  problem: 3,
  turn: 10,
  tap: 3,
  order: 3,
  panel: 3,
  deliver: 3,
  end: 12,
};

export interface Campaign {
  id: CampaignId;
  /** Falas da locução (também são as legendas, palavra a palavra). */
  lines: Record<SceneId, string>;
  place: {
    restaurant: string;
    /** "Cama 12" ou "Mesa 12" */
    spot: string;
    area: string;
    /** Onde o pedido aparece: "Painel do bar" / "Painel do restaurante". */
    panelLabel: string;
  };
  /** O serviço tradicional, passo a passo (os três primeiros desaparecem com a MESVIO). */
  steps: [string, string, string, string, string];
  /** Linha do fecho, por baixo do slogan. */
  endLine: string;
}

const COMMON_END = "MESVIO. O empregado que não sabias que precisavas. Solicita uma demonstração.";

export const CAMPAIGNS: Record<CampaignId, Campaign> = {
  praia: {
    id: "praia",
    lines: {
      hook: "Tens um bar de praia e a equipa não chega a todos os clientes?",
      problem: "Camas longe do bar, areia, calor… cada pedido é uma ida e volta.",
      turn: "Com a MESVIO, o pedido vem até ti.",
      tap: "Aproxima o telemóvel do NFC, ou lê o QR Code.",
      order: "Escolhe uma bebida e confirma o pedido.",
      panel: "O pedido aparece logo no painel do bar.",
      deliver: "E a equipa deixa de recolher pedidos, para se concentrar nas entregas.",
      end: COMMON_END,
    },
    place: { restaurant: "Beach Club", spot: "Cama 12", area: "Praia", panelLabel: "Painel do bar" },
    steps: ["Ir ao cliente", "Anotar", "Voltar ao bar", "Preparar", "Entregar"],
    endLine: "Digitaliza os pedidos do teu bar de praia.",
  },
  restaurante: {
    id: "restaurante",
    lines: {
      hook: "Tens um restaurante e a equipa não consegue atender todas as mesas a tempo?",
      problem: "Hora de ponta, mesas a chamar… cada pedido é mais uma volta à sala.",
      turn: "Com a MESVIO, o pedido vem até ti.",
      tap: "Aproxima o telemóvel do NFC, ou lê o QR Code.",
      order: "Escolhe uma bebida e confirma o pedido.",
      panel: "O pedido aparece logo no painel do restaurante.",
      deliver: "E a equipa deixa de recolher pedidos, para se concentrar em servir.",
      end: COMMON_END,
    },
    place: { restaurant: "O teu restaurante", spot: "Mesa 12", area: "Sala", panelLabel: "Painel do restaurante" },
    steps: ["Ir à mesa", "Anotar", "Voltar à cozinha", "Preparar", "Servir"],
    endLine: "Digitaliza os pedidos do teu restaurante.",
  },
};

export const TEXT_V2 = {
  slogan: "O empregado que não sabias que precisavas.",
  tagline: "Menos espera. Mais serviço.",
  cta: "Solicita uma demonstração",
};
