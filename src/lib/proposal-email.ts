import { EXTRAS, type ExtraKey } from "@/lib/extras";
import { PLAN_MONTHLY_CENTS, type Plan } from "@/lib/plan";

/**
 * Proposta comercial por email, gerada na Central a partir do link de demonstração do restaurante:
 * o que a MESVIO faz (com as imagens de mesvio.pt/email), as taxas da Stripe (plano com pagamentos),
 * a instalação, o preço e o que é preciso para avançar. A pessoa da MESVIO cola no Gmail e envia.
 * As taxas são as da Stripe para Portugal (stripe.com/pt/pricing, confirmadas a 26/11/2026).
 */
export type ProposalInput = {
  restaurant: string;
  contactName?: string;
  url: string;
  sender: string;
  phone?: string;
  baseUrl: string;
  plan: Plan;
  sunbeds: boolean;
  extras: ExtraKey[];
  /** Extras apresentados como opcionais ("se quiserem"): explicados, mas não somam ao preço. */
  optionalExtras?: ExtraKey[];
};

/** Como funciona cada extra, para a proposta (mais completo do que a frase do catálogo). */
export const EXTRA_DETAILS: Record<ExtraKey, string[]> = {
  comandeira: [
    "O empregado abre a comandeira no telemóvel dele, escolhe a mesa ou a espreguiçadeira e toca nos pratos, com as opções (ponto da carne, tamanho) e notas como &ldquo;sem cebola&rdquo;.",
    "Ao enviar, o pedido sai logo em talão na cozinha e no bar e soma à conta do lugar, tal como os pedidos feitos pelo QR.",
    "Ideal para quem prefere pedir ao empregado: acabam os papéis e as idas à cozinha para entregar o pedido.",
  ],
  cozinha: [
    "Um tablet na cozinha (ou no bar) mostra os pedidos por ordem de chegada, com o tempo de espera de cada um.",
    "A cozinha marca &ldquo;Pronto&rdquo; com um toque e a sala sabe logo que pode levar o pedido.",
    "Funciona com os pedidos do QR e da comandeira, e pode substituir os talões em papel.",
  ],
  tv: [
    "Um link que se abre na TV do restaurante: o menu do dia e a ementa passam sozinhos, em letra grande.",
    "Muda sozinho quando mudam a ementa no painel.",
  ],
  site: [
    "Uma página pública do restaurante com a ementa, o menu do dia, o horário, a morada e um botão para ligar.",
    "Atualiza-se sozinha com a ementa do painel. Basta pôr o link no Google Maps e no Instagram.",
  ],
  ponto: [
    "Um tablet à entrada onde a equipa pica a entrada, as pausas e a saída com nome e PIN, com uma selfie de prova.",
    "O dono vê quem está a trabalhar, as horas de cada um e os atrasos, faz a escala da semana e exporta um Excel para o contabilista.",
  ],
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const eur = (cents: number) => `${(cents / 100).toLocaleString("pt-PT", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })} €`;
/** Preço mensal de um extra a partir do texto do catálogo (ex.: "+9,90 €/mês" → 990). */
export const extraCents = (key: ExtraKey) => Math.round(Number(EXTRAS[key].price.replace(/[^\d,]/g, "").replace(",", ".")) * 100);

export const STRIPE_FEES: [string, string][] = [
  ["MB WAY", "1,5% + 0,25 €"],
  ["Cartões europeus (incluindo Apple Pay e Google Pay)", "1,5% + 0,25 €"],
  ["Cartões europeus premium (empresa, gold, etc.)", "2,8% + 0,25 €"],
  ["Cartões do Reino Unido", "2,5% + 0,25 €"],
  ["Cartões de fora da Europa", "3,15% + 0,25 €"],
];

export function proposalSubject(restaurant: string, plan: Plan): string {
  return plan === "payments" ? `${restaurant}: proposta MESVIO, com pedidos, pagamentos e taxas` : plan === "orders" ? `${restaurant}: proposta MESVIO, ementa digital e pedidos` : `${restaurant}: a vossa ementa digital (proposta MESVIO)`;
}

export function proposalEmail(p: ProposalInput): { subject: string; html: string; text: string } {
  const R = esc(p.restaurant);
  const base = p.baseUrl.replace(/\/+$/, "");
  const ordering = p.plan !== "menu";
  const payments = p.plan === "payments";
  const beds = p.sunbeds && payments;
  const extras = p.extras.filter((k) => k in EXTRAS);
  const monthly = PLAN_MONTHLY_CENTS[p.plan] + extras.reduce((t, k) => t + extraCents(k), 0);
  const h: string[] = [];
  const t: string[] = [];
  const P = (html: string, text = html.replace(/<[^>]+>/g, "").replace(/&ldquo;|&rdquo;/g, '"').replace(/&amp;/g, "&")) => {
    h.push(`<p style="margin:0 0 14px">${html}</p>`);
    t.push(text);
  };
  const H = (title: string) => {
    h.push(`<p style="margin:8px 0 6px;font-size:17px"><strong>${title}</strong></p>`);
    t.push(`\n${title.toUpperCase()}`);
  };
  const IMG = (file: string, alt: string) =>
    h.push(`<img src="${esc(base)}/email/${file}" width="600" alt="${esc(alt)}" style="display:block;width:100%;max-width:600px;height:auto;border:0;border-radius:16px;margin:4px 0 12px">`);
  const LIST = (items: [string, string, string][]) => {
    h.push(
      `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 18px">${items
        .map(([i, b, r]) => `<tr><td style="padding:5px 10px 5px 0;font-size:18px;vertical-align:top">${i}</td><td style="padding:5px 0"><strong>${b}</strong> ${r}</td></tr>`)
        .join("")}</table>`,
    );
    t.push(...items.map(([, b, r]) => `• ${b} ${r}`.replace(/&ldquo;|&rdquo;/g, '"')));
  };
  const OL = (items: string[]) => {
    h.push(`<ol style="margin:0 0 16px;padding-left:22px">${items.map((i) => `<li>${i}</li>`).join("")}</ol>`);
    t.push(...items.map((i, n) => `${n + 1}. ${i.replace(/<[^>]+>/g, "")}`));
  };

  P(`${p.contactName ? `Olá ${esc(p.contactName)}` : "Olá"},`, `${p.contactName ? `Olá ${p.contactName}` : "Olá"},`);
  P(`Obrigado pela conversa! Como combinámos, deixo aqui a proposta da MESVIO para o <strong>${R}</strong>: o que o cliente vê, o que a equipa vê${payments ? ", as taxas dos pagamentos" : ""}, como é a instalação e o preço.`);
  P(`A vossa ementa digital já está feita, pode vê-la aqui no telemóvel: <a href="${esc(p.url)}" style="color:#0f7a5c;font-weight:bold">${esc(p.url.replace(/^https?:\/\//, ""))}</a>`, `A vossa ementa digital já está feita, pode vê-la aqui no telemóvel: ${p.url}`);

  if (beds) {
    H("Nas espreguiçadeiras: pede, paga e sai na cozinha");
    IMG("camas-cozinha.jpg", "Na espreguiçadeira: o cliente pede, paga no telemóvel e o pedido sai na cozinha já pago");
    LIST([
      ["📱", "Cada espreguiçadeira tem o seu QR.", "O cliente abre a ementa no telemóvel, sem instalar nenhuma app, escolhe e carrega em &ldquo;Pedir e pagar&rdquo;."],
      ["💳", "Paga com Apple Pay, Google Pay, MB WAY ou cartão.", "Paga-se ao pedir: não há contas por fechar nem clientes que se vão embora sem pagar."],
      ["🧾", "O pedido sai logo na cozinha e no bar,", "com o número da espreguiçadeira e marcado como pago."],
      ["⏱️", "O empregado só leva o pedido.", "Mais pedidos por cliente e menos voltas na areia."],
    ]);
  }
  if (ordering) {
    H(beds ? "Nas mesas" : "Pedidos na mesa");
    IMG("mesa-chamar-conta.jpg", "Na mesa: chamar o empregado, pedir a conta ou pagar no telemóvel, e o painel com as chamadas");
    LIST([
      ["🛒", "O cliente pede pelo telemóvel", "e o pedido sai logo em talão na cozinha e no bar."],
      ["🙋", "&ldquo;Chamar empregado&rdquo; e &ldquo;Pedir a conta&rdquo;", "com um toque; o painel avisa com som e diz se é preciso levar o terminal."],
      ...(payments ? ([["💳", "Pagar a conta no telemóvel,", "com gorjeta opcional para a equipa, ou pagar como sempre."]] as [string, string, string][]) : []),
    ]);
  }

  H("A ementa que o cliente vê");
  IMG("linguas.png", "A mesma ementa em português, inglês e alemão");
  LIST([
    ["🌍", "Em 5 línguas", "(português, inglês, espanhol, francês e alemão), traduzida automaticamente."],
    ["📸", "Com fotos dos pratos e das bebidas.", "Vende mais do que só o nome."],
    ["⭐", "Sugestões da casa em destaque", "no topo da ementa: o prato do dia, a novidade, o que querem vender mais."],
    ["⚡", "Mudam preços e pratos em 1 minuto,", "no telemóvel. Esgotou? Um toque e o prato sai da ementa."],
    ["💬", "Avaliações:", "o cliente dá de 1 a 5 estrelas e a opinião fica só para vocês. Se quiserem, há também um botão para avaliar no Google."],
  ]);

  if (ordering) {
    H("O painel da equipa e do dono");
    IMG("painel.png", "Painel: pedidos a chegar e resumo dos últimos 7 dias");
    LIST([
      ["🔔", "Pedidos e chamadas em tempo real,", "com som, no telemóvel ou num tablet."],
      ["📊", "Resumo do dia e dos últimos 7 dias:", "vendas, ticket médio, horas de mais movimento, o que esgotou e o que ninguém pediu."],
      ["📲", "Funciona no telemóvel, tablet ou computador", "que já têm. Não é preciso comprar equipamento."],
    ]);
  }

  if (payments) {
    H("Os pagamentos e as taxas");
    P("Os pagamentos passam pela <strong>Stripe</strong>, numa conta <strong>em nome do vosso restaurante</strong> e ligada ao vosso IBAN. O dinheiro <strong>não passa pela MESVIO</strong>: é transferido para o banco automaticamente, em poucos dias úteis. A única taxa por pagamento é a da Stripe, como num terminal multibanco:");
    h.push(
      `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;margin:0 0 10px;font-size:14px"><tr style="background:#f5f3ee"><td style="padding:8px 10px;border-bottom:1px solid #e6e2d8"><strong>Meio de pagamento</strong></td><td style="padding:8px 10px;border-bottom:1px solid #e6e2d8;text-align:right"><strong>Taxa por pagamento</strong></td></tr>${STRIPE_FEES.map(
        ([m, f]) => `<tr><td style="padding:8px 10px;border-bottom:1px solid #e6e2d8">${m}</td><td style="padding:8px 10px;border-bottom:1px solid #e6e2d8;text-align:right">${f}</td></tr>`,
      ).join("")}</table>`,
    );
    t.push(...STRIPE_FEES.map(([m, f]) => `• ${m}: ${f}`));
    P("<strong>Exemplo:</strong> num pedido de <strong>30 €</strong> pago com MB WAY ou cartão português, a taxa é de <strong>0,70 €</strong> e o restaurante recebe 29,30 €. Num pedido de 10 €, a taxa é de 0,40 €.");
    LIST([
      ["✓", "A Stripe não cobra mensalidade", "nem custos de adesão; as transferências para o banco são gratuitas."],
      ["↩", "Devoluções:", "não têm custo, mas a taxa do pagamento original não é devolvida."],
      ["⚖", "Disputas", "de um pagamento pelo banco do cliente (raras): a Stripe cobra 20 €."],
    ]);
  }

  if (extras.length) {
    H("Extras incluídos nesta proposta");
    LIST(extras.map((k) => ["➕", `${EXTRAS[k].label} (${EXTRAS[k].price}):`, EXTRAS[k].hint]));
  }
  H("O que fica no restaurante");
  IMG("placa-qr.jpg", "Placa com QR em cima da mesa, com o logótipo do restaurante");
  P(`Em cada ${p.sunbeds ? "mesa e espreguiçadeira" : "mesa"} fica uma <strong>placa com o QR desse lugar</strong>, com o logótipo e as cores do restaurante. Escolhemos juntos o desenho.`);

  H("Como arrancamos");
  OL([
    "Revemos juntos a ementa que já preparei (preços e fotos).",
    `Preparo os QR de cada ${p.sunbeds ? "mesa e espreguiçadeira" : "mesa"}.`,
    payments
      ? "No dia da instalação, eu estou aí: ligamos a conta Stripe (cerca de 10 minutos, com o NIF da empresa, o IBAN e o cartão de cidadão), fazemos um pagamento real de 1 € para confirmar que o dinheiro chega, pomos os QR e explico à equipa como funciona."
      : "No dia da instalação, eu estou aí: pomos os QR e explico à equipa como funciona.",
    "Na primeira semana acompanho de perto. Qualquer dúvida, falam diretamente comigo.",
  ]);

  H("Preço");
  P(
    `<strong>${eur(monthly)} por mês</strong>${extras.length ? ` (${eur(PLAN_MONTHLY_CENTS[p.plan])} do plano + ${eur(monthly - PLAN_MONTHLY_CENTS[p.plan])} de extras)` : ""}, com tudo o que está neste email. <strong>Sem comissão</strong> sobre as vendas e <strong>sem fidelização</strong>.${payments ? " A única taxa por pagamento é a da Stripe." : ""}`,
  );
  if (p.plan === "menu") {
    P("Se um dia quiserem ir mais longe, a mesma ementa pode passar a receber <strong>pedidos da mesa</strong> (o pedido sai logo na cozinha, com &ldquo;Chamar empregado&rdquo; e &ldquo;Pedir a conta&rdquo;), por 59 € por mês, sem mudar nada do que já está feito. Para já, a ementa digital chega perfeitamente para começar.");
  }

  const optional = (p.optionalExtras ?? []).filter((k) => k in EXTRAS && !extras.includes(k));
  if (optional.length) {
    H("Se quiserem, também temos");
    P("Não estão incluídos no preço acima: ligam-se quando quiserem, a qualquer momento, e desligam-se da mesma forma.");
    for (const k of optional) {
      h.push(`<p style="margin:10px 0 4px"><strong>➕ ${EXTRAS[k].label}</strong> <span style="color:#4a5a55">· ${EXTRAS[k].price.replace("+", "mais ")}</span></p>`);
      t.push(`\n+ ${EXTRAS[k].label} (${EXTRAS[k].price.replace("+", "mais ")})`);
      h.push(`<ul style="margin:0 0 12px;padding-left:20px">${EXTRA_DETAILS[k].map((d) => `<li>${d}</li>`).join("")}</ul>`);
      t.push(...EXTRA_DETAILS[k].map((d) => `  - ${d.replace(/&ldquo;|&rdquo;/g, '"')}`));
    }
  }

  H("O que preciso de vocês para avançar");
  OL([
    `O número de ${p.sunbeds ? "mesas e espreguiçadeiras" : "mesas"} que levam QR.`,
    ...(ordering ? ["Que programa de faturação (POS) usam."] : []),
    "Um dia para a instalação.",
    ...(payments ? ["Para o dia da instalação: o NIF da empresa, o IBAN e o cartão de cidadão de quem cria a conta Stripe."] : []),
  ]);

  const phone = p.phone?.trim();
  P(`Qualquer dúvida, estou disponível${phone ? ` pelo ${esc(phone)} ou` : ""} por este email.`);
  h.push(`<p style="margin:0">Com os melhores cumprimentos,<br><strong>${esc(p.sender)}</strong><br>MESVIO · <a href="https://mesvio.pt" style="color:#0f7a5c">mesvio.pt</a>${phone ? ` · ${esc(phone)}` : ""}</p>`);
  t.push(`\nCom os melhores cumprimentos,\n${p.sender}\nMESVIO · mesvio.pt${phone ? ` · ${phone}` : ""}`);

  return {
    subject: proposalSubject(p.restaurant, p.plan),
    html: `<div style="font-family:Arial,Helvetica,sans-serif;color:#10211D;max-width:600px;font-size:15px;line-height:1.6">${h.join("\n")}</div>`,
    text: t.join("\n").replace(/\n{3,}/g, "\n\n"),
  };
}
