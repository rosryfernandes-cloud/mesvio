/**
 * Textos das páginas do cliente (ementa, pedido, conta) em cada língua. O português é a
 * referência: as outras línguas têm de ter exatamente as mesmas chaves (verificado pelo tipo).
 * Nomes de pratos e categorias não estão aqui: vêm do restaurante (menu_translations).
 */
import type { SelectionIssue } from "@/lib/order-pricing";

export const LOCALES = ["pt", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "pt";
export const LOCALE_COOKIE = "mesvio_lang";

export const LOCALE_NAMES: Record<Locale, string> = { pt: "Português", en: "English" };
/** Para datas/horas (Intl). */
export const LOCALE_TAGS: Record<Locale, string> = { pt: "pt-PT", en: "en-GB" };

type StatusCopy = { title: string; body: string };

const pt = {
  menu: {
    nav: "Ementa",
    sections: "Secções",
    categories: "Categorias",
    inOrder: (n: number) => `${n} no pedido`,
    myOrders: "Os meus pedidos",
    tableBill: "Conta da mesa",
    payFirstTitle: "Aqui paga ao pedir.",
    payFirstBody: "Assim que o pagamento for confirmado, o pedido segue para a cozinha e levamo-lo até si.",
    viewOnlyTitle: "Só consulta, por agora.",
    viewOnlyBody: "Este restaurante ainda não recebe pedidos pela app.",
    vatIncluded: "Preços com IVA incluído à taxa legal em vigor.",
    payAtRestaurant: "Pagamento no restaurante.",
    payInApp: "Pagamento na app, ao pedir.",
    allergyNotice: "Em caso de alergia ou intolerância, informe um funcionário.",
    poweredBy: "Pedidos digitais com",
    privacy: "Privacidade",
    terms: "Termos",
    language: "Língua",
  },
  product: {
    add: (name: string) => `Adicionar ${name}`,
    withOptions: "com opções",
    allergens: "Alergénios:",
    from: "desde",
    soldOut: "Esgotado",
    close: "Fechar",
    required: "Obrigatório",
    optionalUpTo: (n: number) => `Opcional · até ${n}`,
    notes: "Observações",
    optional: "(opcional)",
    notesPlaceholder: "Ex.: sem cebola",
    quantity: "Quantidade",
    less: "Menos",
    more: "Mais",
    addButton: "Adicionar",
  },
  cart: {
    viewOrder: "Ver pedido",
    yourOrder: "O seu pedido",
    unavailableItem: "Artigo indisponível",
    quantityOf: (name: string) => `Quantidade de ${name}`,
    noteForRestaurant: "Nota para o restaurante",
    notePlaceholder: "Ex.: trazer as bebidas primeiro",
    removeUnavailable: "Retire os artigos indisponíveis para enviar o pedido.",
    sending: "A enviar…",
    payAndOrder: "Pagar e pedir",
    sendToKitchen: "Enviar pedido para a cozinha",
    payFirstNote: "Paga com Apple Pay, MB WAY ou cartão antes de o pedido seguir para a cozinha.",
    payLaterNote: "O pagamento é feito no restaurante, no fim da refeição.",
    offline: "Sem ligação. Verifique a rede e tente de novo — o pedido não será duplicado.",
    sendFailed: "Não foi possível enviar o pedido. Tente de novo.",
  },
  issue: {
    soldOut: (name: string) => `${name} está esgotado.`,
    repeated: (name: string) => `Opção repetida em ${name}.`,
    invalid: (name: string) => `Opção inválida para ${name}.`,
    choose: (group: string, name: string) => `Escolha ${group.toLowerCase()} para ${name}.`,
    max: (max: number, group: string) => `No máximo ${max} em ${group.toLowerCase()}.`,
    notOnMenu: "Já não está na ementa.",
  },
  /** Erros da API por código (o português usa a mensagem do servidor, mais detalhada). */
  apiError: {
    PRICE_CHANGED: "Os preços mudaram entretanto. Reveja o pedido.",
    INVALID_ITEMS: "Alguns artigos já não estão disponíveis. Reveja o pedido.",
    RATE_LIMITED: "Muitos pedidos seguidos. Aguarde um pouco e tente de novo.",
    ORDERING_DISABLED: "Este restaurante não está a receber pedidos neste momento.",
    TABLE_NOT_FOUND: "Esta mesa já não é válida. Volte a ler o QR Code.",
    generic: "Não foi possível concluir. Tente de novo.",
  } as Record<string, string>,
  order: {
    orderNo: "Pedido nº",
    refresh: "Atualizar",
    preparing: "A preparar…",
    payAndSend: "Pagar e enviar o pedido",
    payNote: "Apple Pay, MB WAY ou cartão. Sem pagamento em 15 minutos, o pedido é cancelado.",
    summary: "Resumo",
    total: "Total",
    note: "Nota:",
    backToMenu: "Voltar à ementa",
    viewBill: "Ver a conta da mesa",
    paidInAppBefore: "Pago na app, antes de seguir para a cozinha.",
    paidInAppBring: "Pago na app. Levamos o pedido até si.",
    payAtEnd: "Pagamento no restaurante, no fim da refeição.",
    status: {
      AWAITING_PAYMENT: { title: "Falta pagar", body: "O pedido só segue para a cozinha depois de pago." },
      SENT: { title: "Enviado", body: "A aguardar confirmação do restaurante." },
      ACCEPTED: { title: "Confirmado", body: "O pedido chegou à cozinha. Bom apetite!" },
      IN_PREPARATION: { title: "Em preparação", body: "A cozinha já está a tratar do seu pedido." },
      SERVED: { title: "Servido", body: "Bom apetite!" },
      REJECTED: { title: "Não aceite", body: "O restaurante não pôde aceitar este pedido. Fale com um funcionário." },
      CANCELLED: { title: "Cancelado", body: "Este pedido foi cancelado. Fale com um funcionário se tiver dúvidas." },
      NEEDS_ATTENTION: { title: "Não conseguimos enviar", body: "O pedido não chegou à cozinha. Por favor chame um funcionário." },
    } satisfies Record<string, StatusCopy>,
  },
  pay: {
    offline: "Sem ligação. Tente de novo.",
    notConfigured: "Pagamento com cartão/MB WAY ainda em configuração. Chame um funcionário.",
    notConfirmed: "Não foi possível confirmar o pagamento.",
    declined: "O pagamento foi recusado. Pode tentar de novo.",
    sheetLabel: "Pagar a conta",
    payAmount: (amount: string) => `Pagar ${amount}`,
    testTitle: "Pagamento de teste.",
    testBody: "Nenhum dinheiro é movimentado. Com a Stripe ligada, aqui aparece o Apple Pay e o MB WAY verdadeiros.",
    simulated: "(simulado)",
    simulateDecline: "Simular pagamento recusado",
    waiting: "A confirmar o pagamento… Se pagou com MB WAY, aprove na app.",
  },
  bill: {
    title: "Conta da mesa",
    titlePayFirst: "Os meus pedidos",
    empty: "Ainda não há pedidos nesta mesa. Os pedidos feitos por qualquer pessoa da mesa aparecem aqui.",
    openedAt: (time: string) => `Aberta às ${time} · inclui os pedidos de todos os telemóveis desta mesa`,
    at: (time: string) => `às ${time}`,
    cancelled: "Cancelado",
    unpaid: "Por pagar",
    unpaidPay: "Por pagar — pagar",
    awaiting: "A aguardar confirmação",
    confirmed: "Confirmado",
    tableTotal: "Total da mesa",
    includesPending: "Inclui pedidos ainda à espera de confirmação do restaurante.",
    paymentInProgress: (amount: string) => `Há um pagamento de ${amount} em curso nesta mesa. Se outra pessoa já está a pagar, aguarde.`,
    alreadyPaid: (amount: string) => `Já pago: ${amount}`,
    due: (amount: string) => `Em falta: ${amount}`,
    paid: "✓ Conta paga",
    thanksJustPaid: "Pagamento recebido. Obrigado e até breve!",
    thanksPaid: "Esta conta já está paga. Obrigado!",
    waitConfirmation: "Há pedidos à espera de confirmação. Pode pagar assim que forem confirmados.",
    payBill: "Pagar a conta",
    methods: "Apple Pay, MB WAY ou cartão. Também pode pagar a um funcionário.",
    callStaffTitle: "Para pagar, chame um funcionário.",
    callStaffBody: "O pagamento é feito no restaurante.",
  },
  call: {
    askBill: "Pedir a conta",
    callWaiter: "Chamar empregado",
    billQuestion: "Como quer pagar?",
    card: "Cartão",
    cash: "Dinheiro",
    waiterQuestion: "Precisa de quê?",
    reasonOrder: "Pedir mais alguma coisa",
    reasonNapkins: "Guardanapos ou talheres",
    reasonClear: "Levantar a mesa",
    reasonOther: "Outra coisa",
    close: "Fechar",
    billSentCard: "Conta pedida (cartão). Um funcionário vem já com o terminal.",
    billSentCash: "Conta pedida (dinheiro). Um funcionário vem já.",
    waiterSent: "Chamámos um funcionário.",
    onTheWay: "A caminho da sua mesa.",
    failed: "Não foi possível chamar. Tente de novo ou faça sinal a um funcionário.",
  },
  notFound: {
    title: "Mesa não encontrada",
    body: "Este código já não é válido ou foi substituído. Volte a ler o QR Code da mesa ou peça ajuda a um funcionário.",
  },
};

export type Messages = typeof pt;

const en: Messages = {
  menu: {
    nav: "Menu",
    sections: "Sections",
    categories: "Categories",
    inOrder: (n) => `${n} in your order`,
    myOrders: "My orders",
    tableBill: "Table bill",
    payFirstTitle: "Here you pay when you order.",
    payFirstBody: "As soon as the payment is confirmed, your order goes to the kitchen and we bring it to you.",
    viewOnlyTitle: "Browse only, for now.",
    viewOnlyBody: "This restaurant does not take orders through the app yet.",
    vatIncluded: "Prices include VAT at the applicable rate.",
    payAtRestaurant: "Payment at the restaurant.",
    payInApp: "Payment in the app, when you order.",
    allergyNotice: "If you have an allergy or intolerance, please tell a member of staff.",
    poweredBy: "Digital ordering by",
    privacy: "Privacy",
    terms: "Terms",
    language: "Language",
  },
  product: {
    add: (name) => `Add ${name}`,
    withOptions: "with options",
    allergens: "Allergens:",
    from: "from",
    soldOut: "Sold out",
    close: "Close",
    required: "Required",
    optionalUpTo: (n) => `Optional · up to ${n}`,
    notes: "Notes",
    optional: "(optional)",
    notesPlaceholder: "E.g. no onion",
    quantity: "Quantity",
    less: "Less",
    more: "More",
    addButton: "Add",
  },
  cart: {
    viewOrder: "View order",
    yourOrder: "Your order",
    unavailableItem: "Item unavailable",
    quantityOf: (name) => `Quantity of ${name}`,
    noteForRestaurant: "Note for the restaurant",
    notePlaceholder: "E.g. bring the drinks first",
    removeUnavailable: "Remove the unavailable items to send your order.",
    sending: "Sending…",
    payAndOrder: "Pay and order",
    sendToKitchen: "Send order to the kitchen",
    payFirstNote: "Pay with Apple Pay, MB WAY or card before your order goes to the kitchen.",
    payLaterNote: "You pay at the restaurant at the end of your meal.",
    offline: "No connection. Check your network and try again — your order will not be duplicated.",
    sendFailed: "We couldn't send your order. Please try again.",
  },
  issue: {
    soldOut: (name) => `${name} is sold out.`,
    repeated: (name) => `Repeated option in ${name}.`,
    invalid: (name) => `Invalid option for ${name}.`,
    choose: (group, name) => `Choose ${group.toLowerCase()} for ${name}.`,
    max: (max, group) => `At most ${max} in ${group.toLowerCase()}.`,
    notOnMenu: "No longer on the menu.",
  },
  apiError: {
    PRICE_CHANGED: "Prices have changed in the meantime. Please review your order.",
    INVALID_ITEMS: "Some items are no longer available. Please review your order.",
    RATE_LIMITED: "Too many orders in a row. Please wait a moment and try again.",
    ORDERING_DISABLED: "This restaurant is not taking orders right now.",
    TABLE_NOT_FOUND: "This table code is no longer valid. Please scan the QR code again.",
    EXPIRED: "This order was cancelled because it wasn't paid in time.",
    ALREADY_PAID: "This table's bill has already been paid.",
    NOTHING_TO_PAY: "There's nothing to pay at this table yet.",
    PAYMENTS_DISABLED: "This restaurant doesn't take payments in the app yet. Please call a member of staff.",
    PENDING_ORDERS: "Some orders are awaiting confirmation. Please wait a moment to pay.",
    generic: "Something went wrong. Please try again.",
  },
  order: {
    orderNo: "Order no.",
    refresh: "Refresh",
    preparing: "Preparing…",
    payAndSend: "Pay and send the order",
    payNote: "Apple Pay, MB WAY or card. Without payment within 15 minutes, the order is cancelled.",
    summary: "Summary",
    total: "Total",
    note: "Note:",
    backToMenu: "Back to the menu",
    viewBill: "View the table bill",
    paidInAppBefore: "Paid in the app, before going to the kitchen.",
    paidInAppBring: "Paid in the app. We'll bring your order to you.",
    payAtEnd: "Payment at the restaurant, at the end of your meal.",
    status: {
      AWAITING_PAYMENT: { title: "Awaiting payment", body: "Your order only goes to the kitchen once it's paid." },
      SENT: { title: "Sent", body: "Waiting for the restaurant to confirm." },
      ACCEPTED: { title: "Confirmed", body: "Your order has reached the kitchen. Enjoy your meal!" },
      IN_PREPARATION: { title: "Being prepared", body: "The kitchen is working on your order." },
      SERVED: { title: "Served", body: "Enjoy your meal!" },
      REJECTED: { title: "Not accepted", body: "The restaurant couldn't accept this order. Please speak to a member of staff." },
      CANCELLED: { title: "Cancelled", body: "This order was cancelled. Please speak to a member of staff if you have questions." },
      NEEDS_ATTENTION: { title: "We couldn't send it", body: "Your order didn't reach the kitchen. Please call a member of staff." },
    },
  },
  pay: {
    offline: "No connection. Please try again.",
    notConfigured: "Card/MB WAY payment is still being set up. Please call a member of staff.",
    notConfirmed: "We couldn't confirm the payment.",
    declined: "The payment was declined. You can try again.",
    sheetLabel: "Pay the bill",
    payAmount: (amount) => `Pay ${amount}`,
    testTitle: "Test payment.",
    testBody: "No money is moved. With Stripe connected, the real Apple Pay and MB WAY appear here.",
    simulated: "(simulated)",
    simulateDecline: "Simulate a declined payment",
    waiting: "Confirming the payment… If you paid with MB WAY, approve it in the app.",
  },
  bill: {
    title: "Table bill",
    titlePayFirst: "My orders",
    empty: "No orders at this table yet. Orders made by anyone at the table appear here.",
    openedAt: (time) => `Opened at ${time} · includes orders from every phone at this table`,
    at: (time) => `at ${time}`,
    cancelled: "Cancelled",
    unpaid: "Unpaid",
    unpaidPay: "Unpaid — pay",
    awaiting: "Awaiting confirmation",
    confirmed: "Confirmed",
    tableTotal: "Table total",
    includesPending: "Includes orders still awaiting confirmation from the restaurant.",
    paymentInProgress: (amount) => `A payment of ${amount} is in progress at this table. If someone else is already paying, please wait.`,
    alreadyPaid: (amount) => `Already paid: ${amount}`,
    due: (amount) => `Left to pay: ${amount}`,
    paid: "✓ Bill paid",
    thanksJustPaid: "Payment received. Thank you and see you soon!",
    thanksPaid: "This bill has already been paid. Thank you!",
    waitConfirmation: "Some orders are awaiting confirmation. You can pay as soon as they're confirmed.",
    payBill: "Pay the bill",
    methods: "Apple Pay, MB WAY or card. You can also pay a member of staff.",
    callStaffTitle: "To pay, please call a member of staff.",
    callStaffBody: "Payment is made at the restaurant.",
  },
  call: {
    askBill: "Ask for the bill",
    callWaiter: "Call a waiter",
    billQuestion: "How would you like to pay?",
    card: "Card",
    cash: "Cash",
    waiterQuestion: "What do you need?",
    reasonOrder: "Order something else",
    reasonNapkins: "Napkins or cutlery",
    reasonClear: "Clear the table",
    reasonOther: "Something else",
    close: "Close",
    billSentCard: "Bill requested (card). A member of staff is coming with the card machine.",
    billSentCash: "Bill requested (cash). A member of staff is coming.",
    waiterSent: "We've called a member of staff.",
    onTheWay: "On the way to your table.",
    failed: "We couldn't call anyone. Please try again or wave to a member of staff.",
  },
  notFound: {
    title: "Table not found",
    body: "This code is no longer valid or has been replaced. Please scan the table's QR code again or ask a member of staff.",
  },
};

export const MESSAGES: Record<Locale, Messages> = { pt, en };

export const isLocale = (v: unknown): v is Locale => typeof v === "string" && (LOCALES as readonly string[]).includes(v);

/**
 * Língua a usar: a escolhida pelo cliente (cookie) ou, na primeira visita, a do telemóvel
 * (Accept-Language, por ordem de preferência). Telemóveis em português ficam em português;
 * em qualquer outra língua, inglês (é a que um turista lê melhor).
 */
export function pickLocale(cookieValue: string | undefined, acceptLanguage: string | null): Locale {
  if (isLocale(cookieValue)) return cookieValue;
  const wanted = (acceptLanguage ?? "")
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = Number(params.find((p) => p.trim().startsWith("q="))?.trim().slice(2) ?? 1);
      return { lang: tag.toLowerCase().split("-")[0], q: Number.isFinite(q) ? q : 0 };
    })
    .filter((x) => x.lang && x.q > 0)
    .sort((a, b) => b.q - a.q);
  if (wanted.length === 0) return DEFAULT_LOCALE;
  return wanted[0].lang === "pt" ? "pt" : "en";
}

/** Texto de um motivo de recusa do carrinho na língua do cliente. */
export function issueText(t: Messages, issue: SelectionIssue): string {
  switch (issue.kind) {
    case "soldOut":
      return t.issue.soldOut(issue.name);
    case "repeated":
      return t.issue.repeated(issue.name);
    case "invalid":
      return t.issue.invalid(issue.name);
    case "choose":
      return t.issue.choose(issue.group, issue.name);
    case "max":
      return t.issue.max(issue.max, issue.group);
    case "notOnMenu":
      return t.issue.notOnMenu;
  }
}

/** Mensagem de erro de uma resposta da API: a do servidor em português, senão traduzida pelo código. */
export function apiErrorText(t: Messages, locale: Locale, data: { code?: string; message?: string }, fallback: string): string {
  if (locale === "pt") return data.message ?? fallback;
  return (data.code && t.apiError[data.code]) || fallback;
}
