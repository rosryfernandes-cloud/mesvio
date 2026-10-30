/**
 * Schema da base de dados (PostgreSQL / Supabase) — fonte de verdade.
 * Convenções:
 *  - Dinheiro em cêntimos (integer). Taxas em pontos base (1% = 100 bps).
 *  - Todas as tabelas de tenant têm `organization_id` (isolamento + RLS).
 *  - Tabelas financeiras e de auditoria são append-only.
 * Documentação: docs/03-BASE-DE-DADOS.md
 */
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  date,
  uniqueIndex,
  index,
  primaryKey,
  bigint,
  check,
  customType,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const id = () => uuid("id").primaryKey().defaultRandom();
const orgId = () => uuid("organization_id").notNull().references(() => organizations.id);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

// ───────────────────────── Enums ─────────────────────────
export const memberRole = pgEnum("member_role", ["owner", "manager", "staff"]);
export const orgStatus = pgEnum("org_status", ["active", "suspended", "onboarding"]);
/** "mesvio": sem POS — a ementa vive na MESVIO e é editada no painel; os pedidos imprimem-se na cozinha. */
export const posProvider = pgEnum("pos_provider", ["mock", "zonesoft", "mesvio"]);
export const integrationStatus = pgEnum("integration_status", ["not_configured", "healthy", "degraded", "failing", "disabled"]);
export const orderStatus = pgEnum("order_status", [
  /** Lugares "pagar ao pedir" (ex.: espreguiçadeiras): criado, mas só segue para o POS depois de pago. */
  "AWAITING_PAYMENT",
  "RECEIVED",
  "SUBMITTING",
  "SUBMITTED",
  "FAILED_RETRYING",
  "NEEDS_ATTENTION",
  "ACCEPTED",
  "REJECTED",
  "IN_PREPARATION",
  "SERVED",
  "CANCELLED",
]);
export const commissionBasis = pgEnum("commission_basis", ["NET", "GROSS"]);
/** "pay_later": paga a conta no fim (mesas). "pay_first": paga cada pedido ao pedir (espreguiçadeiras, balcão). */
export const orderingMode = pgEnum("ordering_mode", ["pay_later", "pay_first"]);
export const ledgerEntryType = pgEnum("ledger_entry_type", ["ACCRUAL", "REVERSAL", "ADJUSTMENT"]);
export const saleDocStatus = pgEnum("sale_doc_status", ["INVOICED", "CANCELLED", "CREDITED"]);
export const statementStatus = pgEnum("statement_status", ["DRAFT", "APPROVED", "INVOICED", "PAID", "VOID"]);
export const outboxStatus = pgEnum("outbox_status", ["PENDING", "DISPATCHED", "DONE", "DEAD"]);
export const paymentStatus = pgEnum("payment_status", ["PENDING", "SUCCEEDED", "FAILED", "CANCELLED"]);
export const paymentProvider = pgEnum("payment_provider", ["mock", "stripe"]);

// ───────────────────────── Tenancy ─────────────────────────
export const organizations = pgTable("organizations", {
  id: id(),
  legalName: text("legal_name").notNull(),
  nif: text("nif").notNull().unique(),
  status: orgStatus("status").notNull().default("onboarding"),
  billingEmail: text("billing_email"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const establishments = pgTable(
  "establishments",
  {
    id: id(),
    organizationId: orgId(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    address: text("address"),
    timezone: text("timezone").notNull().default("Europe/Lisbon"),
    /** Horário semanal: { mon: [["12:00","15:00"],["19:00","23:00"]], ... } */
    openingHours: jsonb("opening_hours").$type<Record<string, [string, string][]>>(),
    orderingEnabled: boolean("ordering_enabled").notNull().default(true),
    /** Plano contratado (src/lib/plan.ts): o que a app deixa fazer neste restaurante. */
    plan: text("plan", { enum: ["menu", "orders", "payments"] }).notNull().default("payments"),
    /**
     * Quando true, cada pedido fica à espera de aprovação no painel antes de seguir para o POS
     * (proteção contra pedidos falsos). Pedidos que o POS só "recebe" sem confirmar também
     * são confirmados no painel.
     */
    manualAcceptance: boolean("manual_acceptance").notNull().default(false),
    /**
     * Opcional: pedidos acima deste valor (cêntimos) esperam aprovação do staff (proteção contra
     * pedidos falsos, auditoria S3). Desligado por omissão (null) para não quebrar o ritmo do
     * serviço; o dono/gerente liga-o no painel se precisar.
     */
    approvalThresholdCents: integer("approval_threshold_cents"),
    /** Clientes podem pagar a conta da mesa no telemóvel. */
    paymentsEnabled: boolean("payments_enabled").notNull().default(false),
    /** Conta Stripe Connect do restaurante (acct_…): o dinheiro vai diretamente para ela. */
    stripeAccountId: text("stripe_account_id"),
    /** Subscrição da MESVIO (mensalidade do plano), cobrada na conta Stripe da plataforma. */
    billingCustomerId: text("billing_customer_id"),
    billingSubscriptionId: text("billing_subscription_id"),
    /** Estado na Stripe (active, past_due, canceled…); null = ainda sem subscrição. */
    billingStatus: text("billing_status"),
    billingPeriodEnd: timestamp("billing_period_end", { withTimezone: true }),
    /**
     * Fatura por email aos clientes: conta do restaurante num programa certificado (InvoiceXpress).
     * A chave da API fica cifrada (secret-box), nunca em claro.
     */
    invoicingAccount: text("invoicing_account"),
    invoicingApiKeyCiphertext: text("invoicing_api_key_ciphertext"),
    /** Avaliações no fim da conta (em teste: desligado por defeito). */
    reviewsEnabled: boolean("reviews_enabled").notNull().default(false),
    /** Link "escrever avaliação" do Google do restaurante (https); null = sem botão do Google. */
    googleReviewUrl: text("google_review_url"),
    /** Mesas por empregado (em teste): cada mesa tem um responsável e fechar com valor em falta pede como foi pago. */
    tableAssignmentsEnabled: boolean("table_assignments_enabled").notNull().default(false),
    /** Cor própria na ementa (#rrggbb, validada para contraste AA em src/lib/brand-color.ts); null = verde MESVIO. */
    brandColor: text("brand_color"),
    /** Logótipo do restaurante na ementa (URL https); null = só o nome. */
    brandLogoUrl: text("brand_logo_url"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("establishments_org_slug_uq").on(t.organizationId, t.slug),
    check("establishments_brand_color_hex", sql`${t.brandColor} ~ '^#[0-9a-f]{6}$'`),
    check("establishments_brand_logo_https", sql`${t.brandLogoUrl} ~ '^https://' and length(${t.brandLogoUrl}) <= 500`),
  ],
);

/** user_id referencia auth.users (Supabase). */
export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    organizationId: orgId(),
    userId: uuid("user_id").notNull(),
    role: memberRole("role").notNull(),
    /** null = todos os estabelecimentos da organização */
    establishmentId: uuid("establishment_id").references(() => establishments.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("memberships_user_org_est_uq").on(t.userId, t.organizationId, t.establishmentId)],
);

/** Dados de apresentação de cada utilizador (o login vive na Supabase Auth: auth.users). */
export const staffProfiles = pgTable("staff_profiles", {
  userId: uuid("user_id").primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name"),
  createdAt: createdAt(),
});

/**
 * Equipa da MESVIO com acesso ao painel central (todos os restaurantes). Sem políticas RLS: só o
 * servidor lê esta tabela. O 2FA (TOTP) é obrigatório; os segredos ficam cifrados (AES-256-GCM).
 */
export const platformAdmins = pgTable("platform_admins", {
  userId: uuid("user_id").primaryKey(),
  email: text("email"),
  displayName: text("display_name"),
  /** Segredo TOTP ativo (cifrado). null = 2FA ainda por configurar. */
  totpSecretCiphertext: text("totp_secret_ciphertext"),
  /** Segredo a meio da configuração (cifrado), até o primeiro código ser confirmado. */
  totpPendingCiphertext: text("totp_pending_ciphertext"),
  totpEnabledAt: timestamp("totp_enabled_at", { withTimezone: true }),
  /** Último intervalo de 30 s aceite: impede reutilizar o mesmo código. */
  totpLastStep: bigint("totp_last_step", { mode: "number" }),
  /**
   * Código de ativação de uso único (só o resumo SHA-256), gerado pelo script admin:criar /
   * admin:repor-2fa e entregue por outro canal. Sem ele não se configura o 2FA: quem roubar só o
   * email de um administrador ainda sem 2FA não consegue ligá-lo à app dele (revisão 24/10).
   */
  enrollmentCodeHash: text("enrollment_code_hash"),
  enrollmentCodeExpiresAt: timestamp("enrollment_code_expires_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/**
 * Chaves de acesso (Face ID / Touch ID / chave de segurança) dos administradores: segundo passo
 * da entrada no painel central, em alternativa ao código da app. Só a chave pública fica aqui.
 */
export const platformPasskeys = pgTable("platform_passkeys", {
  id: id(),
  userId: uuid("user_id")
    .notNull()
    .references(() => platformAdmins.userId, { onDelete: "cascade" }),
  /** Identificador da credencial (base64url), único. */
  credentialId: text("credential_id").notNull().unique(),
  /** Chave pública COSE (base64url). */
  publicKey: text("public_key").notNull(),
  counter: bigint("counter", { mode: "number" }).notNull().default(0),
  transports: text("transports").array().notNull().default([]),
  name: text("name").notNull(),
  createdAt: createdAt(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
});

/** Códigos de recuperação do painel central (uso único; só o resumo SHA-256). */
export const platformRecoveryCodes = pgTable("platform_recovery_codes", {
  id: id(),
  userId: uuid("user_id")
    .notNull()
    .references(() => platformAdmins.userId, { onDelete: "cascade" }),
  codeHash: text("code_hash").notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: createdAt(),
});

// ───────────────────────── Mesas ─────────────────────────
export const diningTables = pgTable(
  "dining_tables",
  {
    id: id(),
    organizationId: orgId(),
    establishmentId: uuid("establishment_id").notNull().references(() => establishments.id),
    label: text("label").notNull(),
    /** Referência da mesa no POS (ex.: número de mesa ZS Rest). */
    posTableRef: text("pos_table_ref"),
    /** Token aleatório de 128 bits usado no URL do QR/NFC. Regenerável. */
    publicToken: text("public_token").notNull().unique(),
    tokenRotatedAt: timestamp("token_rotated_at", { withTimezone: true }),
    active: boolean("active").notNull().default(true),
    /** Zona do restaurante para o staff saber onde levar (ex.: "Esplanada", "Praia"). */
    zone: text("zone"),
    orderingMode: orderingMode("ordering_mode").notNull().default("pay_later"),
    /** Empregado responsável (mesas por empregado, em teste); null = de todos. Fica até alguém a mudar. */
    assignedUserId: uuid("assigned_user_id"),
    createdAt: createdAt(),
  },
  (t) => [index("dining_tables_est_idx").on(t.organizationId, t.establishmentId)],
);

/** Sessão de mesa: agrupa os pedidos de uma refeição e limita abuso de QR. */
export const tableSessions = pgTable(
  "table_sessions",
  {
    id: id(),
    organizationId: orgId(),
    tableId: uuid("table_id").notNull().references(() => diningTables.id),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("table_sessions_table_idx").on(t.tableId, t.openedAt)],
);

/**
 * Chamadas do cliente ao staff, a partir da ementa: pedir a conta (com o meio de pagamento) ou
 * chamar um empregado (com o motivo). Ficam abertas até o staff as dar por feitas ou fechar a mesa.
 */
/** "paid" = aviso ao painel de que a mesa pagou a conta pelo telemóvel (não é pedido pelo cliente). */
export const serviceRequestKind = pgEnum("service_request_kind", ["bill", "waiter", "paid"]);
export const serviceRequests = pgTable(
  "service_requests",
  {
    id: id(),
    organizationId: orgId(),
    establishmentId: uuid("establishment_id").notNull().references(() => establishments.id),
    tableId: uuid("table_id").notNull().references(() => diningTables.id),
    kind: serviceRequestKind("kind").notNull(),
    /** Conta: "card" | "cash". Empregado: "order" | "napkins" | "clear" | "other". */
    detail: text("detail"),
    createdAt: createdAt(),
    /** O staff carregou em "A caminho" (o cliente vê-o no telemóvel). */
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [index("service_requests_open_idx").on(t.establishmentId, t.resolvedAt), index("service_requests_table_idx").on(t.tableId, t.createdAt)],
);

/**
 * Avaliação deixada no telemóvel depois de pagar a conta (1–5 estrelas e comentário opcional).
 * Só o restaurante as vê no painel; o cliente pode, além disso, avaliar no Google.
 */
export const reviews = pgTable(
  "reviews",
  {
    id: id(),
    organizationId: orgId(),
    establishmentId: uuid("establishment_id").notNull().references(() => establishments.id),
    tableId: uuid("table_id").notNull().references(() => diningTables.id),
    tableSessionId: uuid("table_session_id").notNull().references(() => tableSessions.id),
    stars: integer("stars").notNull(),
    comment: text("comment"),
    createdAt: createdAt(),
  },
  (t) => [index("reviews_establishment_idx").on(t.establishmentId, t.createdAt), check("reviews_stars_range", sql`${t.stars} between 1 and 5`)],
);

/**
 * Aparelhos da equipa com notificações ligadas (web push): cada telemóvel ou computador onde
 * alguém carregou em "Ativar notificações". Apagados quando o serviço de push diz que já não existem.
 */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: id(),
    organizationId: orgId(),
    establishmentId: uuid("establishment_id").notNull().references(() => establishments.id),
    userId: uuid("user_id").notNull(),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("push_subscriptions_est_idx").on(t.establishmentId, t.userId)],
);

// ───────────────────────── Integração POS ─────────────────────────
export const posIntegrations = pgTable("pos_integrations", {
  id: id(),
  organizationId: orgId(),
  establishmentId: uuid("establishment_id").notNull().unique().references(() => establishments.id),
  provider: posProvider("provider").notNull(),
  status: integrationStatus("status").notNull().default("not_configured"),
  /** AES-256-GCM: base64(iv|tag|ciphertext). Nunca devolvido ao frontend. */
  credentialsCiphertext: text("credentials_ciphertext"),
  credentialsKeyId: text("credentials_key_id"),
  lastCatalogSyncAt: timestamp("last_catalog_sync_at", { withTimezone: true }),
  lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
  lastError: text("last_error"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ───────────────────────── Catálogo ─────────────────────────
export const categories = pgTable(
  "categories",
  {
    id: id(),
    organizationId: orgId(),
    establishmentId: uuid("establishment_id").notNull().references(() => establishments.id),
    posCategoryRef: text("pos_category_ref"),
    name: text("name").notNull(),
    /** Separador da ementa acima da categoria (ex.: "Comida", "Bebidas"). */
    section: text("section"),
    /** Posto que prepara os artigos desta categoria: sai no talão da cozinha ou no do bar. */
    station: text("station", { enum: ["kitchen", "bar"] }).notNull().default("kitchen"),
    sortOrder: integer("sort_order").notNull().default(0),
    visible: boolean("visible").notNull().default(true),
  },
  (t) => [index("categories_est_idx").on(t.organizationId, t.establishmentId)],
);

export const products = pgTable(
  "products",
  {
    id: id(),
    organizationId: orgId(),
    establishmentId: uuid("establishment_id").notNull().references(() => establishments.id),
    categoryId: uuid("category_id").notNull().references(() => categories.id),
    /** Referência do artigo no POS — obrigatória para enviar pedidos reais. */
    posProductRef: text("pos_product_ref").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    imageUrl: text("image_url"),
    /** Preço de venda com IVA, em cêntimos (origem: POS). */
    priceCents: integer("price_cents").notNull(),
    /** Taxa de IVA em pontos base (13% = 1300). */
    vatRateBps: integer("vat_rate_bps").notNull(),
    allergens: text("allergens").array().notNull().default([]),
    tags: text("tags").array().notNull().default([]),
    /** Disponibilidade vinda do POS. */
    posAvailable: boolean("pos_available").notNull().default(true),
    /** Override local (painel). Só pode tornar indisponível, nunca disponível contra o POS. */
    locallyUnavailable: boolean("locally_unavailable").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    syncedAt: timestamp("synced_at", { withTimezone: true }),
  },
  (t) => [
    index("products_est_idx").on(t.organizationId, t.establishmentId),
    uniqueIndex("products_est_posref_uq").on(t.establishmentId, t.posProductRef),
  ],
);

export const modifierGroups = pgTable("modifier_groups", {
  id: id(),
  organizationId: orgId(),
  establishmentId: uuid("establishment_id").notNull().references(() => establishments.id),
  posGroupRef: text("pos_group_ref"),
  name: text("name").notNull(),
  /** "variant" = escolha única obrigatória; "extra" = múltipla opcional */
  kind: text("kind", { enum: ["variant", "extra"] }).notNull(),
  minSelect: integer("min_select").notNull().default(0),
  maxSelect: integer("max_select").notNull().default(1),
});

export const modifiers = pgTable("modifiers", {
  id: id(),
  organizationId: orgId(),
  groupId: uuid("group_id").notNull().references(() => modifierGroups.id),
  posModifierRef: text("pos_modifier_ref").notNull(),
  name: text("name").notNull(),
  priceDeltaCents: integer("price_delta_cents").notNull().default(0),
  available: boolean("available").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const productModifierGroups = pgTable(
  "product_modifier_groups",
  {
    productId: uuid("product_id").notNull().references(() => products.id),
    groupId: uuid("group_id").notNull().references(() => modifierGroups.id),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.productId, t.groupId] })],
);

// ───────────────────────── Pedidos ─────────────────────────
export const orders = pgTable(
  "orders",
  {
    id: id(),
    organizationId: orgId(),
    establishmentId: uuid("establishment_id").notNull().references(() => establishments.id),
    tableId: uuid("table_id").notNull().references(() => diningTables.id),
    tableSessionId: uuid("table_session_id").references(() => tableSessions.id),
    /** Gerada no dispositivo do cliente; garante que reenvios não duplicam. */
    idempotencyKey: text("idempotency_key").notNull(),
    /** Número curto legível (por estabelecimento/dia) para a cozinha. */
    shortCode: text("short_code").notNull(),
    status: orderStatus("status").notNull().default("RECEIVED"),
    posOrderRef: text("pos_order_ref"),
    totalGrossCents: integer("total_gross_cents").notNull(),
    totalNetCents: integer("total_net_cents").notNull(),
    notes: text("notes"),
    clientIpHash: text("client_ip_hash"),
    submitAttempts: integer("submit_attempts").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("orders_est_idem_uq").on(t.establishmentId, t.idempotencyKey),
    index("orders_org_est_created_idx").on(t.organizationId, t.establishmentId, t.createdAt),
    index("orders_status_idx").on(t.status),
  ],
);

export const orderItems = pgTable("order_items", {
  id: id(),
  organizationId: orgId(),
  orderId: uuid("order_id").notNull().references(() => orders.id),
  /** Preenchido quando o catálogo estiver sincronizado na BD; até lá vale o snapshot `posProductRef`. */
  productId: uuid("product_id").references(() => products.id),
  /** Ordem da linha no pedido (como o cliente a montou). */
  lineNo: integer("line_no").notNull(),
  /** Snapshots: o pedido não muda se o catálogo mudar depois. */
  posProductRef: text("pos_product_ref").notNull(),
  name: text("name").notNull(),
  unitPriceCents: integer("unit_price_cents").notNull(),
  vatRateBps: integer("vat_rate_bps").notNull(),
  quantity: integer("quantity").notNull(),
  lineGrossCents: integer("line_gross_cents").notNull(),
  notes: text("notes"),
  modifiers: jsonb("modifiers")
    .$type<{ posModifierRef: string; name: string; priceDeltaCents: number }[]>()
    .notNull()
    .default([]),
});

/** Histórico de estados (append-only). */
export const orderEvents = pgTable(
  "order_events",
  {
    id: id(),
    organizationId: orgId(),
    orderId: uuid("order_id").notNull().references(() => orders.id),
    fromStatus: orderStatus("from_status"),
    toStatus: orderStatus("to_status").notNull(),
    source: text("source", { enum: ["customer", "system", "pos", "staff", "admin"] }).notNull(),
    detail: jsonb("detail"),
    createdAt: createdAt(),
  },
  (t) => [index("order_events_order_idx").on(t.orderId, t.createdAt)],
);

/**
 * Esgotados marcados no painel. Só podem tornar um artigo indisponível, nunca disponível
 * contra o POS. Chave = referência do POS (o catálogo ainda não vive na BD).
 */
export const productAvailabilityOverrides = pgTable(
  "product_availability_overrides",
  {
    organizationId: orgId(),
    establishmentId: uuid("establishment_id").notNull().references(() => establishments.id),
    posProductRef: text("pos_product_ref").notNull(),
    unavailable: boolean("unavailable").notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.establishmentId, t.posProductRef] })],
);

/** O que se pode traduzir na ementa: secção (ref = nome original), categoria, artigo, grupo de opções, opção. */
export const menuTranslationKind = pgEnum("menu_translation_kind", ["section", "category", "product", "group", "modifier"]);

/**
 * Traduções da ementa para inglês feitas pelo restaurante (o POS só tem português). Chave:
 * referência do POS; o que não estiver traduzido aparece no original.
 */
export const menuTranslations = pgTable(
  "menu_translations",
  {
    organizationId: orgId(),
    establishmentId: uuid("establishment_id").notNull().references(() => establishments.id),
    locale: text("locale").notNull(),
    kind: menuTranslationKind("kind").notNull(),
    ref: text("ref").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.establishmentId, t.locale, t.kind, t.ref] }),
    check("menu_translations_locale", sql`${t.locale} = 'en'`),
  ],
);

const bytea = customType<{ data: Buffer; driverData: Buffer | Uint8Array }>({
  dataType: () => "bytea",
  fromDriver: (v) => (Buffer.isBuffer(v) ? v : Buffer.from(v)),
});

/**
 * Fotografias dos pratos enviadas pelo restaurante no painel (uma por artigo do POS). Ficam na
 * própria BD: sem serviço de ficheiros extra, isoladas por RLS. Reduzidas no telemóvel antes do
 * envio (~150 KB) e servidas com cache permanente (o URL muda quando a foto muda).
 */
export const menuImages = pgTable(
  "menu_images",
  {
    id: id(),
    organizationId: orgId(),
    establishmentId: uuid("establishment_id").notNull().references(() => establishments.id),
    posProductRef: text("pos_product_ref").notNull(),
    contentType: text("content_type").notNull(),
    bytes: bytea("bytes").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    /** SHA-256 (hex) do conteúdo: versão no URL, para a cache nunca servir uma foto antiga. */
    sha256: text("sha256").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("menu_images_est_product_uq").on(t.establishmentId, t.posProductRef),
    check("menu_images_type", sql`${t.contentType} in ('image/jpeg', 'image/png', 'image/webp')`),
    check("menu_images_size", sql`${t.sizeBytes} <= 1048576`),
  ],
);

/** Transactional outbox: gravado na mesma transação do pedido. */
export const outbox = pgTable(
  "outbox",
  {
    id: id(),
    organizationId: orgId(),
    topic: text("topic").notNull(),
    payload: jsonb("payload").notNull(),
    status: outboxStatus("status").notNull().default("PENDING"),
    attempts: integer("attempts").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    lastError: text("last_error"),
    createdAt: createdAt(),
  },
  (t) => [index("outbox_pending_idx").on(t.status, t.availableAt)],
);

/**
 * Pagamentos da conta de uma mesa. O dinheiro vai para a conta do restaurante no fornecedor;
 * aqui fica o registo (valor, comissão da plataforma, estado) para o painel e a reconciliação.
 */
export const payments = pgTable(
  "payments",
  {
    id: id(),
    organizationId: orgId(),
    establishmentId: uuid("establishment_id").notNull().references(() => establishments.id),
    tableSessionId: uuid("table_session_id").notNull().references(() => tableSessions.id),
    /** Pagamento de UM pedido (lugares "pagar ao pedir"); null = pagamento da conta da mesa. */
    orderId: uuid("order_id").references(() => orders.id),
    provider: paymentProvider("provider").notNull(),
    /** Referência no fornecedor (ex.: PaymentIntent pi_…). */
    providerRef: text("provider_ref").notNull(),
    amountCents: integer("amount_cents").notNull(),
    /** Gorjeta incluída em `amountCents` (vai toda para o restaurante; não abate à conta nem paga comissão). */
    tipCents: integer("tip_cents").notNull().default(0),
    /** Comissão da plataforma retida no pagamento (Stripe application fee). */
    applicationFeeCents: integer("application_fee_cents").notNull(),
    status: paymentStatus("status").notNull().default("PENDING"),
    /** Método usado (apple_pay, mb_way, card…), quando o fornecedor o indica. */
    method: text("method"),
    /** Já devolvido ao cliente (reembolsos no painel ou no dashboard da Stripe). */
    refundedCents: integer("refunded_cents").notNull().default(0),
    /** Fatura pedida pelo cliente (NIF opcional, email obrigatório) e o estado da emissão. */
    invoiceNif: text("invoice_nif"),
    invoiceEmail: text("invoice_email"),
    /** pending → issued (ou failed / manual, para o restaurante tratar à mão). */
    invoiceStatus: text("invoice_status", { enum: ["pending", "issued", "failed", "manual"] }),
    invoiceRef: text("invoice_ref"),
    invoiceError: text("invoice_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("payments_provider_ref_uq").on(t.provider, t.providerRef),
    index("payments_session_idx").on(t.tableSessionId),
  ],
);

/**
 * Rate limit em janela fixa (sem Redis): uma linha por chave e janela, incrementada com upsert.
 * Linhas antigas são apagadas pelo worker.
 */
export const rateLimitBuckets = pgTable(
  "rate_limit_buckets",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] }), index("rate_limit_window_idx").on(t.windowStart)],
);

/**
 * Pedidos de demonstração da landing page (potenciais clientes da MESVIO, não clientes de
 * restaurantes). Dados pessoais mínimos (RGPD), só para os contactar; sem acesso pela API pública.
 */
export const demoRequests = pgTable(
  "demo_requests",
  {
    id: id(),
    name: text("name").notNull(),
    business: text("business").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    venueType: text("venue_type"),
    message: text("message"),
    ipHash: text("ip_hash"),
    /** Quando o aviso por email foi enviado à equipa (null = ainda não / email não configurado). */
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    /** Quando a pessoa recebeu o email "recebemos o teu pedido". */
    confirmationSentAt: timestamp("confirmation_sent_at", { withTimezone: true }),
    /** Seguimento no painel central: novo → contactado → demo marcada → cliente (ou sem interesse). */
    status: text("status", { enum: ["new", "contacted", "demo", "client", "lost"] }).notNull().default("new"),
    /** Notas da equipa MESVIO (ex.: "ligar 3.ª de manhã"). */
    notes: text("notes"),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("demo_requests_created_idx").on(t.createdAt), check("demo_requests_status_check", sql`${t.status} in ('new', 'contacted', 'demo', 'client', 'lost')`)],
);

// ───────────────────────── Reconciliação e comissões ─────────────────────────
/** Documentos de venda reportados pelo POS e ligados a pedidos da plataforma. */
export const posSales = pgTable(
  "pos_sales",
  {
    id: id(),
    organizationId: orgId(),
    establishmentId: uuid("establishment_id").notNull().references(() => establishments.id),
    orderId: uuid("order_id").references(() => orders.id),
    posDocumentRef: text("pos_document_ref").notNull(),
    status: saleDocStatus("status").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(),
    /** Valor atribuível à plataforma (só linhas originadas por nós). */
    attributableGrossCents: integer("attributable_gross_cents").notNull(),
    attributableNetCents: integer("attributable_net_cents").notNull(),
    raw: jsonb("raw"),
    importedAt: createdAt(),
  },
  (t) => [uniqueIndex("pos_sales_est_doc_uq").on(t.establishmentId, t.posDocumentRef)],
);

export const commissionRules = pgTable("commission_rules", {
  id: id(),
  organizationId: orgId(),
  /** null = aplica-se a todos os estabelecimentos da organização */
  establishmentId: uuid("establishment_id").references(() => establishments.id),
  rateBps: integer("rate_bps").notNull().default(100),
  basis: commissionBasis("basis").notNull().default("NET"),
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  createdBy: uuid("created_by"),
  createdAt: createdAt(),
});

/** Razão de comissões — append-only; correções são novos lançamentos. */
export const commissionLedger = pgTable(
  "commission_ledger",
  {
    id: id(),
    organizationId: orgId(),
    establishmentId: uuid("establishment_id").notNull().references(() => establishments.id),
    posSaleId: uuid("pos_sale_id").references(() => posSales.id),
    ruleId: uuid("rule_id").references(() => commissionRules.id),
    type: ledgerEntryType("type").notNull(),
    basis: commissionBasis("basis").notNull(),
    baseCents: integer("base_cents").notNull(),
    rateBps: integer("rate_bps").notNull(),
    /** Comissão em unidades de 1/10 000 de cêntimo (base × bps), arredondada só no extrato. */
    amountMicroCents: bigint("amount_micro_cents", { mode: "number" }).notNull(),
    algorithmVersion: text("algorithm_version").notNull(),
    reason: text("reason"),
    statementId: uuid("statement_id"),
    createdAt: createdAt(),
  },
  (t) => [
    index("commission_ledger_org_est_idx").on(t.organizationId, t.establishmentId, t.createdAt),
    uniqueIndex("commission_ledger_sale_type_uq").on(t.posSaleId, t.type),
  ],
);

export const billingStatements = pgTable(
  "billing_statements",
  {
    id: id(),
    organizationId: orgId(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    status: statementStatus("status").notNull().default("DRAFT"),
    baseTotalCents: integer("base_total_cents").notNull(),
    commissionCents: integer("commission_cents").notNull(),
    vatOnServiceCents: integer("vat_on_service_cents").notNull(),
    externalInvoiceRef: text("external_invoice_ref"),
    approvedBy: uuid("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("billing_statements_org_period_uq").on(t.organizationId, t.periodStart)],
);

// ───────────────────────── Auditoria ─────────────────────────
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    organizationId: uuid("organization_id"),
    actorType: text("actor_type", { enum: ["user", "admin", "system", "pos"] }).notNull(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    requestId: text("request_id"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_logs_org_created_idx").on(t.organizationId, t.createdAt)],
);
