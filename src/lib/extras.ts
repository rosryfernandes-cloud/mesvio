/**
 * Extras: funcionalidades vendidas à parte de cada plano. Ficam desligadas até a equipa MESVIO as
 * ligar a um restaurante na Central (página do restaurante → Extras).
 */
export const EXTRAS = {
  comandeira: { label: "Comandeira digital", price: "+10 €/mês", hint: "Os empregados registam os pedidos das mesas no telemóvel; os talões saem na cozinha e no bar." },
  cozinha: { label: "Ecrã da cozinha", price: "+5 €/mês", hint: "Um tablet na cozinha mostra os pedidos por ordem, com o tempo de espera, e marca-se pronto com um toque." },
  tv: { label: "Ementa na TV", price: "+5 €/mês", hint: "Um link para abrir na TV do restaurante: menu do dia e ementa a passar sozinhos, em letra grande." },
  site: { label: "Site do restaurante", price: "+9,90 €/mês", hint: "Uma página pública com a ementa, o menu do dia, o horário, a morada e o botão para ligar." },
  ponto: { label: "Picar ponto", price: "+9,90 €/mês", hint: "Tablet de picar ponto com PIN, selfie e reconhecimento facial opcional, escalas, alertas e Excel." },
} as const;
export type ExtraKey = keyof typeof EXTRAS;
export const EXTRA_KEYS = Object.keys(EXTRAS) as ExtraKey[];

export const hasExtra = (extras: { enabled: string[] } | null | undefined, key: ExtraKey) => Boolean(extras?.enabled.includes(key));
