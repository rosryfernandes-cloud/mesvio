/** Posto que prepara um artigo: cada um tem o seu talão (e a sua impressora). */
export type Station = "kitchen" | "bar";

export const STATIONS: Station[] = ["kitchen", "bar"];

export const STATION_LABEL: Record<Station, string> = { kitchen: "Cozinha", bar: "Bar" };

const BAR_WORDS = /bebida|drink|caf[eé]|coffee|vinho|wine|cerveja|beer|cocktail|cocktai|sumo|juice|refriger|[aá]gua|water|ch[aá]s?\b|espirituos|gin|bar\b|shot|smoothie|limonada|sangria/i;

/** Primeira sugestão quando a ementa passa a ser da MESVIO: bebidas para o bar, o resto para a cozinha. */
export function guessStation(name: string, section?: string | null): Station {
  return BAR_WORDS.test(`${section ?? ""} ${name}`) ? "bar" : "kitchen";
}
