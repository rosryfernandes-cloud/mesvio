# Arquitetura

## 1. Visão geral

**Monólito modular** em Next.js (App Router) + **worker** separado para tarefas assíncronas. Começar como monólito reduz custo operacional e acelera a entrega; os limites entre módulos (`src/server/*`) permitem extrair serviços mais tarde sem reescrever.

```
                ┌───────────────────────────── Vercel / Node ─────────────────────────────┐
 Telemóvel ───► │  Next.js App Router                                                      │
 (QR / NFC)     │   ├─ /m/[token]          Ementa do cliente (RSC, cache por tenant)       │
                │   ├─ /painel/*           Painel do restaurante (Supabase Auth)           │
 Restaurante ─► │   ├─ /admin/*            Painel da plataforma (admins, MFA)             │
                │   └─ /api/*              Route handlers (validação Zod, rate limit)      │
                │            │                                                             │
                │   src/server/  (domínio)                                                 │
                │   ├─ menu/  orders/  tables/  commissions/  billing/  audit/             │
                │   └─ pos/   PosAdapter ──► MockPosAdapter | ZoneSoftAdapter (pendente)   │
                └───────────────┬───────────────────────────────┬─────────────────────────┘
                                │ SQL (Drizzle)                  │ enqueue (outbox → BullMQ)
                        ┌───────▼────────┐               ┌──────▼───────┐
                        │ PostgreSQL     │◄──────────────│ Worker Node  │──► API do POS
                        │ (Supabase, RLS)│   resultados  │ BullMQ       │
                        └────────────────┘               └──────▲───────┘
                                                                 │
                                                          ┌──────┴───────┐
                                                          │ Redis        │
                                                          └──────────────┘
```

## 2. Módulos de domínio (`src/server`)

| Módulo | Responsabilidade |
|---|---|
| `tables` | Tokens públicos de mesa, resolução token → mesa → estabelecimento, revogação |
| `menu` | Ementa servida ao cliente (catálogo POS + overrides locais + horário) |
| `orders` | Criação idempotente, recálculo de preços no servidor, máquina de estados |
| `pos` | Interface `PosAdapter`, registo de adaptadores, MockPOS, ZoneSoft (pendente) |
| `commissions` | Motor de cálculo puro + razão (ledger) append-only |
| `billing` | Extratos mensais e preparação da fatura de serviço |
| `audit` | Registo de auditoria |
| `db` | Schema Drizzle, cliente, contexto de tenant |

Regra: **a UI nunca acede à base de dados diretamente**; chama serviços de domínio, que recebem sempre um `TenantContext` explícito.

## 3. Multi-tenancy

- **Base de dados partilhada, schema partilhado**, coluna `organization_id` em todas as tabelas de tenant.
- Duas camadas de isolamento:
  1. **Aplicação:** todos os repositórios exigem `organizationId`; nenhuma query de tenant sem ele.
  2. **Postgres RLS (defesa em profundidade):** cada transação do servidor executa `set_config('app.current_org', $1, true)`; as políticas comparam `organization_id = current_setting('app.current_org')::uuid`. Os admins da plataforma usam um papel próprio, sempre auditado.
- Rotas públicas (ementa) resolvem o tenant **a partir do token da mesa**, nunca de parâmetros do cliente.

## 4. Fluxo de um pedido (sem perda, sem duplicação)

```
Cliente      API /api/orders           Postgres                     Worker              POS
  │  POST + Idempotency-Key │                 │                          │                   │
  │────────────────────────►│ valida token, recalcula preços            │                   │
  │                         │ BEGIN                                     │                   │
  │                         │ INSERT order (status=RECEIVED)            │                   │
  │                         │ INSERT outbox(job=submit_order)           │                   │
  │                         │ COMMIT ─────────►│                          │                   │
  │◄── 202 {orderId, RECEIVED}                 │  relay outbox → BullMQ ─►│                   │
  │                         │                  │                          │ submitOrder ─────►│
  │                         │                  │◄─ status=SUBMITTED ──────│                   │
  │                         │                  │                          │◄── ack/accepted ──│
  │                         │                  │◄─ status=ACCEPTED ───────│                   │
  │  GET /api/orders/:id (polling 3 s / SSE)   │                          │                   │
```

- **Idempotência:** `UNIQUE (establishment_id, idempotency_key)`; um segundo POST com a mesma chave devolve o pedido existente.
- **Transactional outbox:** o pedido e a tarefa de envio são gravados na mesma transação; um relay publica no BullMQ. Se o Redis cair, nada se perde.
- **Tentativas:** backoff exponencial com jitter (ex.: 5 tentativas em ~2 min); depois `NEEDS_ATTENTION` + alerta no painel.
- **Idempotência no POS:** o nosso `orderId` é enviado como referência externa sempre que o POS o suportar (a confirmar na documentação ZoneSoft).

### Máquina de estados

```
RECEIVED ─► SUBMITTING ─► SUBMITTED ─► ACCEPTED ─► IN_PREPARATION ─► SERVED
    │            │             │            │
    │            └─► FAILED_RETRYING ─► NEEDS_ATTENTION
    │                          └─► REJECTED
    └─► CANCELLED (antes de aceitação)                 INVOICED / CANCELLED via reconciliação
```

Texto ao cliente: `RECEIVED/SUBMITTING/SUBMITTED` → "Enviado — a aguardar confirmação do restaurante". Só `ACCEPTED` mostra "Confirmado".

## 5. Camada de integração POS

Ver `04-INTEGRACAO-POS.md`. Resumo: `PosAdapter` com **capacidades declaradas** (`capabilities`). A aplicação adapta-se ao que o adaptador declara (ex.: sem `orderStatusUpdates` → não mostra "Em preparação").

## 6. Segurança

| Ameaça | Mitigação |
|---|---|
| Adulteração de preços | Cliente envia só IDs + quantidades + escolhas; servidor recalcula tudo a partir do catálogo |
| Acesso cruzado entre tenants | Contexto de tenant obrigatório + RLS + testes de isolamento |
| Enumeração de mesas | Tokens aleatórios de 128 bits (base64url), não sequenciais; rate limit por IP e por token |
| Abuso de QR (pedidos remotos/falsos) | Rate limit; limites por pedido; sessões de mesa com expiração; aceitação manual opcional; revogação de token; deteção de anomalias |
| Duplicados | Chave de idempotência + UNIQUE na BD |
| Credenciais POS expostas | Encriptação AES-256-GCM em aplicação (chave em KMS/variável de ambiente, com rotação por `key_id`) |
| Ações administrativas abusivas | Auditoria imutável, MFA obrigatório para admins |
| Injeção/XSS | React escapa por defeito; CSP estrita; Zod em todas as entradas |

## 7. RGPD
- Cliente final anónimo; não recolhemos nome, email nem telefone por defeito.
- Observações e restrições alimentares podem conter **dados de saúde** (alergias): guardadas apenas para o pedido, sem ligação a uma pessoa, com retenção limitada (proposta: anonimizar texto livre após 90 dias).
- IP guardado em forma pseudonimizada (hash com salt rotativo) só para anti-abuso.
- DPA com cada restaurante (nós somos subcontratante para os dados de pedidos).

## 8. Observabilidade
Logs estruturados (pino) com `requestId`, `organizationId`, `orderId`; Sentry para erros; métricas de fila (BullMQ) e de integração por estabelecimento; endpoint `/api/health`.

## 9. Escalabilidade
- Ementa pública cacheável por estabelecimento (revalidação por tag ao sincronizar o catálogo).
- API sem estado, escala horizontalmente; worker escala por concorrência de filas, com fila/limite por estabelecimento para respeitar limites do POS.
- Índices em todas as FKs com `organization_id` à cabeça; particionamento de `orders`/`order_events` por mês quando o volume o justificar.
