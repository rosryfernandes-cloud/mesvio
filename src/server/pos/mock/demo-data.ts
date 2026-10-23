/**
 * Dados de demonstração: Swara Beach ClubHouse (Fonte da Telha), com 10 mesas na esplanada
 * (pagam no fim) e 6 espreguiçadeiras na praia (pagam ao pedir).
 * Ementa, preços e alergénios transcritos das ementas públicas v1.8 em
 * https://www.swarabeach.com/menu/ (comida 12h–15h/19h–22h, 15h–19h e bebidas; 22/10/2026).
 * Alergénios copiados tal como publicados (Reg. UE 1169/2011).
 * As taxas de IVA são ilustrativas (restauração 13%; refrigerantes, sumos, águas com gás,
 * bebidas alcoólicas e snacks 23%). Não usar como referência fiscal.
 *
 * Horários: a ementa do Swara muda ao longo do dia; os artigos levam uma etiqueta com o horário,
 * mas a app ainda não esconde artigos fora de horas (funcionalidade de horários por fazer).
 */
import type { PosCategory, PosModifierGroup, PosProduct, PosTable } from "../types";

export const DEMO_ORGANIZATION = {
  id: "00000000-0000-4000-8000-000000000001",
  legalName: "Swara Beach ClubHouse (DEMO)",
  nif: "999999990",
} as const;

export const DEMO_ESTABLISHMENT = {
  id: "00000000-0000-4000-8000-000000000010",
  organizationId: DEMO_ORGANIZATION.id,
  name: "Swara Beach ClubHouse",
  slug: "swarabeach",
  address: "Praia Oh Ti João — 2825-486 Fonte da Telha, Costa da Caparica",
  timezone: "Europe/Lisbon",
} as const;

/** Tokens aleatórios de 128 bits (base64url). Em produção vivem na tabela dining_tables. */
const TABLE_TOKENS = [
  "jG6WQHgwr4fQ5qQEOKtZJw",
  "chQmVciKf1xECVWTY_HyTw",
  "Wiv6lIAY9L54AVxPz2f6Nw",
  "W2Z8RDg5Nf-Krc-al1u2wQ",
  "g7uL8VpsSatG0D68xhmzng",
  "3k0tBsuHajA3gYk9gNTldg",
  "UCqBXU4pg_fUJ61Ac70btw",
  "xfXKXnfqFici8UgZ0HS3Gw",
  "symSpFT9zsoy5cetnXOSuQ",
  "M8Aa-9m3-mTP-9DDwJWHsA",
] as const;

/** Espreguiçadeiras da praia: o cliente paga ao pedir e o staff leva o pedido à espreguiçadeira. */
const SUNBED_TOKENS = [
  "z2cP7nLMXTuZFjIInl3npg",
  "0QtIi4qZzllRQpj4RCiRMw",
  "PlVmDTGo4dBNGMqQHFBmqg",
  "3-82k1adQA5PFmKK3ReFAQ",
  "PoCoiE1vAzJn9_k4bZdQ-A",
  "MzNix8Cip2POSOcesDmpNA",
] as const;

export interface DemoTable extends PosTable {
  id: string;
  publicToken: string;
  active: boolean;
  zone: string;
  orderingMode: "pay_later" | "pay_first";
}

export const DEMO_TABLES: DemoTable[] = [
  ...TABLE_TOKENS.map((token, i) => ({
    id: `00000000-0000-4000-8000-0000000001${String(i + 1).padStart(2, "0")}`,
    posTableRef: String(i + 1),
    label: `Mesa ${i + 1}`,
    publicToken: token,
    active: true,
    zone: "Esplanada",
    orderingMode: "pay_later" as const,
  })),
  ...SUNBED_TOKENS.map((token, i) => ({
    id: `00000000-0000-4000-8000-0000000003${String(i + 1).padStart(2, "0")}`,
    posTableRef: `E${i + 1}`,
    label: `Cama ${i + 1}`,
    publicToken: token,
    active: true,
    zone: "Praia",
    orderingMode: "pay_first" as const,
  })),
];

const VAT_FOOD = 1300;
const VAT_STANDARD = 2300;

/** Códigos de alergénios da ementa do Swara → nomes mostrados ao cliente. */
const ALLERGENS: Record<string, string> = {
  G: "glúten",
  C: "crustáceos",
  O: "ovos",
  P: "peixe",
  AM: "amendoim",
  L: "leite",
  FR: "frutos de casca rija",
  M: "mostarda",
  SS: "sésamo",
  AP: "aipo",
  S: "soja",
  SF: "sulfitos",
  T: "tremoço",
  MU: "moluscos",
};
const al = (codes: string) => codes.split(",").map((c) => ALLERGENS[c.trim()]);

/** Grupo de escolha única obrigatória; refs dos modificadores: `<grupo>-1`, `<grupo>-2`, … */
function variant(posGroupRef: string, name: string, options: string[]): PosModifierGroup {
  return {
    posGroupRef,
    name,
    kind: "variant",
    minSelect: 1,
    maxSelect: 1,
    modifiers: options.map((o, i) => ({ posModifierRef: `${posGroupRef}-${i + 1}`, name: o, priceDeltaCents: 0, available: true })),
  };
}

/** Grupo opcional de extras com preço; refs: `<grupo>-1`, `<grupo>-2`, … */
function extras(posGroupRef: string, name: string, options: [string, number][]): PosModifierGroup {
  return {
    posGroupRef,
    name,
    kind: "extra",
    minSelect: 0,
    maxSelect: options.length,
    modifiers: options.map(([o, cents], i) => ({ posModifierRef: `${posGroupRef}-${i + 1}`, name: o, priceDeltaCents: cents, available: true })),
  };
}

const batata = () => variant("GRP-BATATA", "Batata", ["Mediterrânea", "Palito", "Doce"]);
const extrasHamburguer = extras("GRP-EXTRAS-HAMB", "Extras", [
  ["Bacon", 100],
  ["Queijo", 100],
  ["Ovo estrelado", 150],
  ["Mix de cogumelos", 150],
  ["Hambúrguer duplo", 600],
]);
const sabor3 = (ref: string) => variant(ref, "Sabor", ["Clássico", "Morango", "Maracujá"]);

const ALMOCO_JANTAR = "12h–15h · 19h–22h";
const LANCHE = "15h–19h";

type ProductOpts = Partial<Omit<PosProduct, "posProductRef" | "posCategoryRef" | "name" | "priceCents">>;
type ProductDraft = Omit<PosProduct, "posCategoryRef" | "vatRateBps"> & { vatRateBps?: number };

function p(ref: string, name: string, priceCents: number, opts: ProductOpts = {}): ProductDraft {
  return {
    posProductRef: ref,
    name,
    priceCents,
    vatRateBps: opts.vatRateBps,
    description: opts.description,
    imageUrl: opts.imageUrl,
    available: opts.available ?? true,
    allergens: opts.allergens ?? [],
    tags: opts.tags ?? [],
    modifierGroups: opts.modifierGroups ?? [],
  };
}

const categories: PosCategory[] = [];
const products: PosProduct[] = [];

/** Regista uma categoria e os seus artigos; `vat` é a taxa por omissão da categoria. */
function c(ref: string, section: string, name: string, vat: number, items: ProductDraft[]): void {
  categories.push({ posCategoryRef: ref, name, section, sortOrder: categories.length + 1 });
  for (const item of items) products.push({ ...item, posCategoryRef: ref, vatRateBps: item.vatRateBps ?? vat });
}

// ─── Comida ────────────────────────────────────────────────────
const F = "Comida";
c("F-COUVERT", F, "Couvert", VAT_FOOD, [
  p("F101", "Couvert", 700, {
    description: "Pão rústico e bolo do caco de azeitona, azeitonas marinadas, azeite com vinagre balsâmico e manteiga.",
    allergens: al("G, L"),
    tags: [ALMOCO_JANTAR],
  }),
  p("F102", "Cesto de Pão Torrado", 500, { tags: [ALMOCO_JANTAR] }),
  p("F103", "Sopa do Dia", 500, { description: "Pergunte ao nosso staff qual é a sugestão de hoje.", tags: [ALMOCO_JANTAR] }),
  p("F104", "Sopa do Mar", 700, {
    description: "Preparada no momento, com peixe e/ou marisco do dia.",
    allergens: al("P"),
    tags: [ALMOCO_JANTAR],
  }),
]);
c("F-ENTRADAS", F, "Entradas", VAT_FOOD, [
  p("F111", "Tempura de Legumes", 600, {
    description: "Courgete, cenoura, pimento vermelho e feijão verde em tempura crocante com molho de iogurte e ervas.",
    allergens: al("G, O, L"),
    tags: ["vegetariano"],
  }),
  p("F112", "Bolinhas de Alheira (5 un.)", 700, { description: "Bolinhas de alheira com maionese sweet chilli.", allergens: al("G, O, S, SF") }),
  p("F113", "Palitos de Mozzarella (7 un.)", 800, {
    description: "Palitos de mozzarella crocante com maionese de limão e alho.",
    allergens: al("O, S"),
    tags: ["vegetariano"],
  }),
  p("F114", "Camarão Panko (5 un.)", 900, { description: "Camarões panados com maionese de limão e alho.", allergens: al("G, O, S, MU") }),
  p("F115", "Gyozas (5 un.)", 1000, { description: "Gyozas de frango com maionese kimuchi.", allergens: al("G, S, SS") }),
  p("F116", "Carpaccio de Novilho Maturado (100 g)", 2800, {
    description: "Novilho maturado com queijo parmesão, rúcula, alcaparras com azeite e vinagre.",
    allergens: al("L"),
  }),
  p("F117", "Carpaccio de Polvo (100 g)", 2800, { description: "Polvo com molho vinagrete, cebola roxa e salsa.", allergens: al("P") }),
  p("F118", "Prato de Queijos", 1900, { description: "Queijos de cabra DOP, São Jorge e ovelha merina.", allergens: al("L") }),
  p("F119", "Prato de Enchidos", 1900, { description: "Salame, chouriço e presunto ibéricos." }),
]);
c("F-PARTILHAR", F, "Para Partilhar", VAT_FOOD, [
  p("F121", "Tábua de Queijos e Enchidos (2 pax)", 3000, {
    description:
      "Queijos de cabra DOP, São Jorge, ovelha merina, salame, chouriço e presunto ibéricos, uvas pretas, azeitonas marinadas, manteiga de trufa e pão torrado.",
    allergens: al("G, L"),
    tags: ["para 2"],
  }),
  p("F122", "Tábua do Mar (2 pax)", 3200, {
    description:
      "Salmão fumado, carpaccio de polvo, filete de cavala com limão e alcaparras, abacaxi, framboesas, alface do mar, manteiga de lagosta, pasta de abacate e pão torrado.",
    allergens: al("L, P, SF, MU"),
    tags: ["para 2"],
  }),
]);
c("F-MAR", F, "Do Mar", VAT_FOOD, [
  p("F131", "Ostras ao Natural (1 un.)", 375, { description: "Ostras da Ria de Aveiro.", allergens: al("MU") }),
  p("F132", "Filete de Robalo / Dourada", 2300, {
    description: "Filete selado com manteiga de ervas e bivalves, puré de batata trufado e legumes grelhados.",
    allergens: al("P, L, MU"),
    tags: [ALMOCO_JANTAR],
    modifierGroups: [variant("GRP-PEIXE", "Peixe", ["Robalo", "Dourada"])],
  }),
  p("F133", "Filete de Peixe Seleção Swara", 3000, {
    description: "Filete de peixe selado com especiarias, puré de batata trufado e legumes grelhados.",
    allergens: al("P, L"),
    tags: [ALMOCO_JANTAR, "da casa"],
  }),
  p("F134", "Ceviche de Robalo", 1700, { description: "Robalo com lima, pimenta malagueta, cebola roxa e abacate.", allergens: al("P") }),
  p("F135", "Camarão Pil Pil", 1800, {
    description: "Camarão de Moçambique com molho de alho, malagueta, gengibre e conhaque.",
    allergens: al("L, SF, MU"),
  }),
  p("F136", "Camarão Tigre (3 un.)", 3100, {
    description: "Camarão black tiger com molho de limão e malagueta e batata palito.",
    allergens: al("L, SF, MU"),
    tags: [ALMOCO_JANTAR],
  }),
  p("F137", "Amêijoas à Bulhão Pato", 2400, {
    description: "Amêijoas, azeite, alho, vinho branco e coentros. Acompanha com pão torrado.",
    allergens: al("G, L, MU"),
  }),
  p("F138", "Mexilhões ao Vapor", 2000, {
    description: "Mexilhões com alho, limão, louro, regados com vinho branco. Acompanha com pão torrado.",
    allergens: al("SF, MU"),
  }),
]);
c("F-TERRA", F, "Da Terra", VAT_FOOD, [
  p("F141", "Preguinho do Lombo (60 g)", 1050, {
    description: "Bife do lombo Angus no pão. Pode ser servido com fatia de queijo, basta pedir ao nosso staff.",
    allergens: al("G, L, M"),
  }),
  p("F142", "Ribeye (350 g)", 2900, {
    description: "Ribeye Angus (origem: Portugal) com molho de cogumelos e batata palito.",
    allergens: al("L"),
    tags: [ALMOCO_JANTAR],
  }),
  p("F143", "Posta Acém Angus (300 g)", 2500, {
    description: "Posta do acém Angus (origem: Portugal) com molho de cervejeira e batata palito.",
    tags: [ALMOCO_JANTAR],
  }),
  p("F144", "Medalhões do Lombo (250 g)", 3100, {
    description: "Medalhões do lombo Angus (origem: Portugal) com molho de pimenta rosa e batata palito.",
    allergens: al("L"),
    tags: [ALMOCO_JANTAR],
  }),
  p("F145", "Pica-Pau do Lombo", 2400, {
    description: "Lombo de novilho, pickles e salsa. Acompanha com pão torrado.",
    allergens: al("G, M, SF"),
    tags: ["para partilhar"],
  }),
  p("F146", "Tártaro de Novilho", 2300, {
    description:
      "Carne de novilho, alcaparras, chalota, salsa, tabasco, vinagre, sumo de limão, gema de ovo e molho holandês. Acompanha com pão torrado.",
    allergens: al("G, O, M, S, SF"),
  }),
]);
c("F-ACOMP", F, "Acompanhamentos", VAT_FOOD, [
  p("F151", "Batata Doce Palito", 600),
  p("F152", "Batata Palito", 600),
  p("F153", "Batata Mediterrânea", 600, { allergens: al("G") }),
  p("F154", "Arroz Basmati", 600, { tags: [ALMOCO_JANTAR] }),
  p("F155", "Cogumelos Salteados", 300, { tags: [ALMOCO_JANTAR] }),
  p("F156", "Puré de Batata Trufado", 600, { allergens: al("L"), tags: [ALMOCO_JANTAR] }),
  p("F157", "Salada Verde", 300, { tags: [ALMOCO_JANTAR] }),
  p("F158", "Salada de Tomate e Cebola", 300, { tags: [ALMOCO_JANTAR] }),
]);
c("F-HAMBURGUERES", F, "Hambúrgueres", VAT_FOOD, [
  p("F161", "Hambúrguer de Frango (110 g)", 1600, {
    description:
      "Pão brioche, carne de frango, queijo cheddar, cebola frita, tomate, salada e maionese kimuchi. Com batata e maionese sweet chilli.",
    allergens: al("G, O, P, L, SS, S, C, MU"),
    modifierGroups: [batata(), extrasHamburguer],
  }),
  p("F162", "Hambúrguer Swara (180 g)", 1800, {
    description:
      "Pão brioche, carne de novilho, queijo cheddar, bacon, couve roxa, cebola caramelizada, tomate, salada e maionese de limão. Com batata e maionese sweet chilli.",
    allergens: al("G, O, L, SS, S"),
    tags: ["da casa"],
    modifierGroups: [batata(), extrasHamburguer],
  }),
]);
c("F-TOSTAS", F, "Tostas", VAT_FOOD, [
  p("F171", "Torrada", 900, {
    description: "Com manteiga, mel ou doce.",
    allergens: al("G"),
    tags: [LANCHE],
    modifierGroups: [variant("GRP-TORRADA", "Com", ["Manteiga", "Mel", "Doce"])],
  }),
  p("F172", "Tosta Mista", 1400, {
    description: "Pão rústico com queijo mozzarella e peito de peru. Com batata e maionese sweet chilli.",
    allergens: al("G, O, L, S"),
    tags: [LANCHE],
    modifierGroups: [batata()],
  }),
  p("F173", "Tosta de Atum", 1600, {
    description:
      "Pão rústico com atum, ovo cozido, pickles, azeitona, maionese, tomate, cebola roxa e ervas. Com batata e maionese sweet chilli.",
    allergens: al("G, O, P, L, SF"),
    tags: [LANCHE],
    modifierGroups: [batata()],
  }),
  p("F174", "Tosta de Frango", 1600, {
    description: "Pão rústico com frango fumado desfiado, maionese, queijo mozzarella e salsa. Com batata e maionese sweet chilli.",
    allergens: al("G, O, L, S"),
    tags: [LANCHE],
    modifierGroups: [batata()],
  }),
]);
c("F-WRAPS", F, "Wraps", VAT_FOOD, [
  p("F181", "Wrap de Camarão", 1700, {
    description: "Tortilha de trigo, camarão, abacate, tomate cherry, queijo filadélfia, cebola frita crocante e cebolinho. Com batata.",
    allergens: al("C, L"),
    tags: [LANCHE],
    modifierGroups: [batata()],
  }),
  p("F182", "Wrap de Frango", 1450, {
    description: "Tortilha de trigo, frango crocante, queijo cheddar, mix de alfaces, tomate cherry, bacon e maionese sriracha. Com batata.",
    allergens: al("G, O, L, S, SF"),
    tags: [LANCHE],
    modifierGroups: [batata()],
  }),
]);
c("F-MASSAS", F, "Massas", VAT_FOOD, [
  p("F191", "Fusilli ao Alho", 1500, {
    description: "Massa fusilli sem glúten com bacon e cogumelos, tomate cherry, queijo parmesão, molho pesto e cebolinho.",
    allergens: al("L, FR, SF"),
    tags: [ALMOCO_JANTAR, "sem glúten"],
  }),
  p("F192", "Linguini do Mar", 1800, {
    description: "Massa linguini sem glúten com camarão e lavagante, edamame, pimento vermelho, cebolinho, alho e molho teriyaki.",
    tags: [ALMOCO_JANTAR, "sem glúten"],
  }),
]);
c("F-KIDS", F, "Menu Kids", VAT_FOOD, [
  p("F201", "Nuggets (5 un.)", 800, { description: "Nuggets de frango com batata palito.", tags: [ALMOCO_JANTAR] }),
  p("F202", "No Prato", 1000, {
    description: "No prato com batata palito.",
    tags: [ALMOCO_JANTAR],
    modifierGroups: [variant("GRP-KIDS", "Escolha", ["Hambúrguer de novilho", "Hambúrguer de frango", "Panado de frango"])],
  }),
]);
c("F-SOBREMESAS", F, "Sobremesas", VAT_FOOD, [
  p("F211", "Prato de Fruta", 600, { description: "Fruta do dia." }),
  p("F212", "Brioche com Frutos Secos", 900, {
    description: "Fatia de brioche com caramelo, gelado de baunilha bourbon e frutos secos.",
    allergens: al("G, O, L, FR"),
  }),
  p("F213", "Pão de Ló de Chocolate", 900, {
    description: "Pão de ló de chocolate com gelado de framboesa e baunilha de bourbon.",
    allergens: al("G, O, L"),
  }),
  p("F214", "Brownie de Lima", 900, {
    description: "Brownie de chocolate aromatizado com lima, sorvete de limão e gelado de baunilha bourbon com flor de sal.",
  }),
  p("F215", "Toucinho do Céu", 950, {
    description: "Toucinho do céu com sorvete de maçã verde e tangerina.",
    allergens: al("G, O, L, FR"),
  }),
  p("F216", "Taça de Açaí", 1600, {
    description: "Açaí com mix de frutas, granola com frutos secos e topping à escolha.",
    modifierGroups: [variant("GRP-ACAI", "Topping", ["Leite condensado", "Mel"])],
  }),
]);
c("F-APERITIVOS", F, "Aperitivos", VAT_STANDARD, [
  p("F221", "Amendoim com Sal", 200, { allergens: al("FR") }),
  p("F222", "Caju com Sal", 300, { allergens: al("FR") }),
]);

// ─── Bebidas ───────────────────────────────────────────────────
const D = "Bebidas";
c("D-AGUAS", D, "Águas e Refrigerantes", VAT_STANDARD, [
  p("D301", "Água sem Gás 0,5 L", 275, { vatRateBps: VAT_FOOD }),
  p("D302", "Água sem Gás 1,5 L", 550, { vatRateBps: VAT_FOOD }),
  p("D303", "Água das Pedras 0,33 L", 300),
  p("D304", "Água Castelo 0,33 L", 300),
  p("D305", "Água Tónica Fever Tree", 450),
  p("D306", "Frize 0,33 L", 300, { modifierGroups: [variant("GRP-FRIZE", "Sabor", ["Limão", "Groselha"])] }),
  p("D307", "7UP", 350),
  p("D308", "Coca-Cola", 350, { modifierGroups: [variant("GRP-COCA", "Escolha", ["Coca-Cola", "Coca-Cola Zero"])] }),
  p("D309", "Guaraná Antártica", 350),
  p("D310", "Ice Tea", 350, { modifierGroups: [variant("GRP-ICETEA", "Sabor", ["Pêssego", "Manga"])] }),
  p("D311", "Ginger Ale Fever Tree", 450),
  p("D312", "Ginger Beer Fever Tree", 450),
]);
c("D-CAFETARIA", D, "Cafetaria", VAT_FOOD, [
  p("D321", "Café", 250),
  p("D322", "Descafeinado", 250),
  p("D323", "Abatanado", 300),
  p("D324", "Carioca", 250),
  p("D325", "Garoto", 250, { allergens: al("L") }),
  p("D326", "Galão", 400, { allergens: al("L") }),
  p("D327", "Café com Natas", 300, { allergens: al("L") }),
  p("D328", "Cappuccino", 500),
  p("D329", "Chocolate Quente", 500, {
    allergens: al("L"),
    modifierGroups: [variant("GRP-LEITE", "Leite", ["Normal", "Sem lactose", "Bebida de amêndoa", "Bebida de aveia"])],
  }),
  p("D330", "Mazagran", 475, { description: "Café, limão, açúcar, pau de canela e gelo." }),
]);
c("D-SUMOS", D, "Sumos e Batidos", VAT_STANDARD, [
  p("D341", "Limonada", 700, { description: "Limão e açúcar." }),
  p("D342", "Limonada de Morango", 900, { description: "Limão, morango e açúcar." }),
  p("D343", "Sumo Swara", 950, { description: "Goiaba, manga, morango e açúcar.", tags: ["da casa"] }),
  p("D344", "Sumo Antiox", 950, { description: "Açaí, banana, laranja e aveia." }),
  p("D345", "Sumo Fonte da Telha", 950, { description: "Maracujá, limão, morango e açúcar." }),
  p("D346", "Batido de Fruta", 900, {
    description: "Leite, leite condensado e fruta à escolha.",
    allergens: al("L"),
    vatRateBps: VAT_FOOD,
    modifierGroups: [variant("GRP-BATIDO", "Fruta", ["Abacaxi", "Manga", "Maracujá", "Morango"])],
  }),
]);
c("D-CHAS", D, "Chás", VAT_FOOD, [
  p("D351", "Chá", 350, {
    description: "Pode ser adoçado com mel.",
    modifierGroups: [
      variant("GRP-CHA-TEMP", "Quente ou frio", ["Quente", "Frio"]),
      variant("GRP-CHA", "Chá", ["Camomila", "Cidreira", "Lúcia-lima", "Limão", "Verde", "Preto", "Menta", "Frutos vermelhos"]),
      extras("GRP-CHA-MEL", "Extras", [["Adoçado com mel", 0]]),
    ],
  }),
  p("D352", "Carioca de Limão", 200),
]);
c("D-CERVEJAS", D, "Cervejas e Sidras", VAT_STANDARD, [
  p("D361", "Imperial 0,2 L", 250, { allergens: al("L") }),
  p("D362", "Caneca 0,5 L", 500, { allergens: al("L") }),
  p("D363", "IPA Imperial 0,2 L", 250, { allergens: al("L") }),
  p("D364", "IPA Caneca 0,5 L", 500, { allergens: al("L") }),
  p("D365", "San Miguel Fresca", 420, { allergens: al("L") }),
  p("D366", "San Miguel Fresca — Balde (5 un.)", 1800, { allergens: al("L"), tags: ["para partilhar"] }),
  p("D367", "Corona", 550, { allergens: al("L") }),
  p("D368", "Corona — Balde (5 un.)", 2200, { allergens: al("L"), tags: ["para partilhar"] }),
  p("D369", "Panaché / Tango 0,2 L", 300, { allergens: al("L"), modifierGroups: [variant("GRP-PANACHE-S", "Escolha", ["Panaché", "Tango"])] }),
  p("D370", "Panaché / Tango 0,5 L", 550, { allergens: al("L"), modifierGroups: [variant("GRP-PANACHE-L", "Escolha", ["Panaché", "Tango"])] }),
  p("D371", "Cerveja Preta (garrafa 0,33 L)", 350, { allergens: al("L") }),
  p("D372", "Mahou IPA", 450, { allergens: al("L") }),
  p("D373", "San Miguel sem Álcool 0,25 L", 400, { allergens: al("L") }),
  p("D374", "San Miguel sem Glúten 0,33 L", 400),
  p("D375", "Somersby 0,33 L", 450, { modifierGroups: [variant("GRP-SOMERSBY", "Sabor", ["Maçã", "Frutos vermelhos"])] }),
]);
c("D-TINTOS", D, "Vinhos Tintos", VAT_STANDARD, [
  p("D401", "Pacheca Colheita tinto (copo)", 650, { description: "Douro. Notas de frutas vermelhas, frescas, leve e refrescante." }),
  p("D402", "Pacheca Colheita tinto (garrafa)", 2000, { description: "Douro. Notas de frutas vermelhas, frescas, leve e refrescante." }),
  p("D403", "ZIP tinto (copo)", 650, {
    description: "Douro. Notas de frutos maduros, chocolate amargo e um toque de especiarias. Elegante e aveludado.",
  }),
  p("D404", "ZIP tinto (garrafa)", 2000, {
    description: "Douro. Notas de frutos maduros, chocolate amargo e um toque de especiarias. Elegante e aveludado.",
  }),
  p("D405", "Convés tinto (copo)", 700, {
    description: "Alentejo. Notas de frutas vermelhas, toques florais, acidez viva que proporciona uma sensação de frescura.",
  }),
  p("D406", "Convés tinto (garrafa)", 2100, {
    description: "Alentejo. Notas de frutas vermelhas, toques florais, acidez viva que proporciona uma sensação de frescura.",
  }),
  p("D407", "Papa Figos tinto", 2200, {
    description: "Douro. Notas de frutas vermelhas, suaves nuances cítricas e acidez bem equilibrada.",
  }),
  p("D408", "Club Nosso Pacto Reserva", 2900, {
    description: "Douro. Notas de fruta preta com especiarias, violeta e cacau, taninos aveludados e redondos, final longo e persistente.",
  }),
]);
c("D-BRANCOS", D, "Vinhos Brancos", VAT_STANDARD, [
  p("D411", "Pacheca Colheita branco (copo)", 650, { description: "Douro. Notas frescas de frutas cítricas e tropicais, leve, fresco e equilibrado." }),
  p("D412", "Pacheca Colheita branco (garrafa)", 2000, { description: "Douro. Notas frescas de frutas cítricas e tropicais, leve, fresco e equilibrado." }),
  p("D413", "ZIP branco (copo)", 650, { description: "Douro. Notas refrescantes de frutas tropicais, pêssego maduro e sabores cítricos." }),
  p("D414", "ZIP branco (garrafa)", 2000, { description: "Douro. Notas refrescantes de frutas tropicais, pêssego maduro e sabores cítricos." }),
  p("D415", "Convés branco (copo)", 700, { description: "Alentejo. Notas cítricas, leve toque de menta e suave no paladar." }),
  p("D416", "Convés branco (garrafa)", 2100, { description: "Alentejo. Notas cítricas, leve toque de menta e suave no paladar." }),
  p("D417", "Melange a Trois", 2200, { description: "Dão. Notas tropicais, toques florais e acidez equilibrada." }),
  p("D418", "Papa Figos branco", 2200, { description: "Douro. Notas de frutas cítricas e tropicais e acidez marcante." }),
  p("D419", "Club Nosso Sauvignon Blanc", 2700, {
    description: "Douro. Aroma exuberante, resultante das notas de ananás, toranja e goiaba, com notas mais maduras de pêssego e marmelo.",
  }),
]);
c("D-VERDES", D, "Vinhos Verdes", VAT_STANDARD, [
  p("D421", "Soalheiro Allo", 1950, { description: "Notas de frutos cítricos e tropicais, toque floral e acidez refrescante." }),
  p("D422", "Azevedo Alvarinho", 2100, {
    description: "Notas florais de rosas e flor de laranjeira conjugadas com nuances cítricas e minerais. Aroma intenso, fresco e com acidez vibrante.",
  }),
]);
c("D-ROSES", D, "Vinhos Rosés", VAT_STANDARD, [
  p("D431", "Club Nosso Rosé", 2100, { description: "Douro. Notas de frutas vermelhas, frescas, leve e refrescante." }),
  p("D432", "ZIP rosé (copo)", 650, { description: "Douro. Notas de frutos vermelhos, boa frescura e cremoso na boca." }),
  p("D433", "ZIP rosé (garrafa)", 2000, { description: "Douro. Notas de frutos vermelhos, boa frescura e cremoso na boca." }),
  p("D434", "Pacheca Rosé (copo)", 650, {
    description: "Douro. Notas de fruta vermelha no aroma, como a framboesa, com uma acidez notável que lhe confere frescura.",
  }),
  p("D435", "Pacheca Rosé (garrafa)", 2000, {
    description: "Douro. Notas de fruta vermelha no aroma, como a framboesa, com uma acidez notável que lhe confere frescura.",
  }),
  p("D436", "Papa Figos Rosé", 2200, {
    description: "Douro. Notas de frutos vermelhos maduros, bom volume, acidez refrescante e com um final muito elegante.",
  }),
  p("D437", "Château Pigoudet Classic", 2100, {
    description: "França. Notas florais e frutadas de pêssego de vinha, lichia e flores brancas. Expressivo e fresco.",
  }),
]);
c("D-ESPUMANTES", D, "Champanhe e Espumantes", VAT_STANDARD, [
  p("D441", "Moët & Chandon Bruto", 9000),
  p("D442", "Mumm Bruto", 7500),
  p("D443", "Kylie Minogue Rosé", 2300),
  p("D444", "Borlido Baga Brut", 2300, { description: "Bairrada." }),
  p("D445", "Rivarose Brut Prestige", 2300),
]);

// ─── Bar & Cocktails ───────────────────────────────────────────
const X = "Bar & Cocktails";
c("X-MOCKTAILS", X, "Mocktails", VAT_STANDARD, [
  p("X501", "Piña Colada sem Álcool", 900, { allergens: al("L"), tags: ["sem álcool"] }),
  p("X502", "Mojito sem Álcool", 900, { tags: ["sem álcool"] }),
  p("X503", "Ginger No-Jito", 900, {
    description: "Sumo de lima, ginger beer Fever Tree, xarope de açúcar, hortelã e água com gás.",
    tags: ["sem álcool"],
  }),
  p("X504", "Lemonade Spritz", 900, { description: "Limão, hortelã e água com gás.", tags: ["sem álcool"] }),
]);
c("X-SWARA", X, "Cocktails Swara", VAT_STANDARD, [
  p("X511", "Cocktail da Semana", 1000, { description: "Pergunte ao nosso staff e experimente algo especial.", tags: ["da casa"] }),
  p("X512", "French Flavour by Ricardo Cardoso", 1100, { description: "Vinho aromatizado, sumo de laranja e de limão, água com gás." }),
  p("X513", "Aurora by Ricardo Cardoso", 1100, {
    description: "Gin, infusão de frutos vermelhos, xarope de canela, flor de sabugueiro e clara de ovo.",
    allergens: al("O"),
  }),
]);
c("X-CLASSICOS", X, "Cocktails Clássicos", VAT_STANDARD, [
  p("X521", "Mimosa", 900, { description: "Espumante e sumo de laranja." }),
  p("X522", "Caipirinha", 950, { description: "Velho Barreiro, lima e xarope de açúcar.", modifierGroups: [sabor3("GRP-CAIPIRINHA")] }),
  p("X523", "Caipiroska", 950, { description: "Vodka Absolut, lima e xarope de açúcar.", modifierGroups: [sabor3("GRP-CAIPIROSKA")] }),
  p("X524", "Mojito", 950, {
    description: "Rum Havana 3 anos, sumo de lima, xarope de açúcar, hortelã e água com gás.",
    modifierGroups: [sabor3("GRP-MOJITO")],
  }),
  p("X525", "Daiquiri", 1000, { description: "Rum, lima, fruta e xarope de açúcar.", modifierGroups: [sabor3("GRP-DAIQUIRI")] }),
  p("X526", "Margarita", 1000, { description: "Tequila, lima e triple sec.", modifierGroups: [sabor3("GRP-MARGARITA")] }),
  p("X527", "Spritz", 1000, {
    description: "Espumante, rodela de laranja e água com gás.",
    modifierGroups: [variant("GRP-SPRITZ", "Escolha", ["Aperol", "Campari", "St. Germain"])],
  }),
  p("X528", "Espresso Martini", 1100, { description: "Vodka, café, licor de café e xarope de açúcar." }),
  p("X529", "Old Fashioned", 1300, { description: "Whiskey, xarope de açúcar, bitters e casca de laranja." }),
  p("X530", "Rum Punch", 1100, {
    description: "Rum Havana 3 anos, puré de maracujá, sumo de limão e laranja, groselha e xarope de açúcar.",
  }),
  p("X531", "Sex on the Beach", 1200, { description: "Vodka Absolut, sumo de laranja, licor de pêssego e groselha." }),
  p("X532", "Sour", 1200, {
    description: "Limão e clara de ovo, com a bebida à escolha.",
    allergens: al("O"),
    modifierGroups: [variant("GRP-SOUR", "Base", ["Amaretto", "Whiskey", "Vodka", "Tequila", "Gin", "Rum"])],
  }),
  p("X533", "Basil Smash", 1200, { description: "Gin, manjericão e xarope de açúcar." }),
  p("X534", "Moscow Mule", 1300, { description: "Vodka Absolut, sumo de limão, ginger beer Fever Tree e espuma de gengibre." }),
  p("X535", "Pain Killer", 1300, { description: "Rum Dark Plantation, ananás, sumo de laranja, leite de coco e xarope de açúcar." }),
  p("X536", "Negroni", 1300, { description: "Gin, vermouth e Campari." }),
]);
c("X-SANGRIAS", X, "Sangrias", VAT_STANDARD, [
  p("X541", "Sangria Branca", 3000, {
    description: "Vinho branco, vodka, licor Beirão, licor de laranja, mix de frutas, hortelã e 7UP.",
    allergens: al("SF"),
    tags: ["para partilhar"],
  }),
  p("X542", "Sangria Tinta", 3000, {
    description: "Vinho tinto, vodka, licor Beirão, licor de laranja, mix de frutas, canela e 7UP.",
    allergens: al("SF"),
    tags: ["para partilhar"],
  }),
  p("X543", "Sangria Rosé", 3000, {
    description: "Vinho rosé, vodka, licor Beirão, licor de laranja, mix de frutas, hortelã e 7UP.",
    allergens: al("SF"),
    tags: ["para partilhar"],
  }),
  p("X544", "Sangria de Espumante", 4000, {
    description: "Espumante, vodka, licor Beirão, licor de laranja, morangos, hortelã, canela e 7UP.",
    tags: ["para partilhar"],
  }),
  p("X545", "Sangria Swara", 4000, {
    description: "Espumante, whiskey, licor Beirão, licor de laranja, maracujá, mix de frutas, hortelã e 7UP.",
    tags: ["para partilhar", "da casa"],
  }),
]);
c("X-APERITIVOS", X, "Aperitivos", VAT_STANDARD, [
  p("X551", "Moscatel", 600),
  p("X552", "Martini Rosso", 500),
  p("X553", "Martini Bianco", 600),
  p("X554", "Martini Dry", 700),
  p("X555", "Campari", 700),
]);
c("X-DIGESTIVOS", X, "Digestivos", VAT_STANDARD, [
  p("X561", "Licor Beirão", 800),
  p("X562", "Baileys", 800),
  p("X563", "Amêndoa Amarga", 800),
  p("X564", "Amaretto", 900),
  p("X565", "Aguardente Velha CRF", 1100),
  p("X566", "Vinho do Porto Portal Tawny", 1100),
  p("X567", "Cognac Courvoisier V.S.", 1500),
]);
c("X-GINS", X, "Gins", VAT_STANDARD, [
  p("X571", "Beefeater", 1400, { description: "Com laranja." }),
  p("X572", "Bombay Sapphire", 1500, { description: "Com limão." }),
  p("X573", "Bulldog", 1800, { description: "Com laranja." }),
  p("X574", "Hendrick's", 1800, { description: "Com pepino." }),
  p("X575", "Pink Paulo Battista", 1800, { description: "Com mix de frutos vermelhos." }),
  p("X576", "Martin Miller", 1500, { description: "Com lima." }),
]);
c("X-ESPIRITUOSAS", X, "Whiskey, Vodka e Rum", VAT_STANDARD, [
  ...(
    [
      ["X581", "Ballantine's", 900, 6000],
      ["X583", "Red Label", 900, 6150],
      ["X585", "Black Label", 1100, 9650],
      ["X587", "Jack Daniel's", 1000, 7150],
      ["X589", "Jameson", 1000, 7150],
      ["X591", "Vodka Wyborowa", 900, 6000],
      ["X593", "Vodka Absolut", 1000, 7150],
      ["X595", "Rum Havana 3 Anos", 900, 6000],
    ] as const
  ).flatMap(([ref, name, dose, bottle]) => [
    p(ref, `${name} (dose)`, dose),
    p(`X${Number(ref.slice(1)) + 1}`, `${name} (garrafa)`, bottle, { tags: ["para partilhar"] }),
  ]),
]);
c("X-SHOTS", X, "Shots", VAT_STANDARD, [
  p("X601", "Tequila José Cuervo", 500),
  p("X602", "Tequila Patrón Silver", 700),
  p("X603", "Limoncello", 700),
  p("X604", "B52", 700, { description: "Licor de café, Baileys e rum." }),
]);

export const DEMO_CATEGORIES: PosCategory[] = categories;
export const DEMO_PRODUCTS: PosProduct[] = products;
