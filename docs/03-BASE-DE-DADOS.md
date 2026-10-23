# Base de dados

Fonte de verdade: [`src/server/db/schema.ts`](../src/server/db/schema.ts) (Drizzle ORM, PostgreSQL/Supabase). Migrações geradas com `npm run db:generate` e aplicadas com `npm run db:migrate` (a partir da Fase 3).

## Convenções
- Chaves `uuid` (`gen_random_uuid()`).
- **Dinheiro em cêntimos (`integer`)**; taxas em **pontos base** (1% = 100; IVA 23% = 2300).
- `organization_id` em todas as tabelas de tenant, primeiro campo dos índices compostos.
- Datas `timestamptz`; o fuso do estabelecimento (`Europe/Lisbon`) aplica-se só na apresentação e nos fechos de período.
- Tabelas **append-only**: `order_events`, `commission_ledger`, `audit_logs`. Correções = novos registos.

## Diagrama (resumido)

```
organizations 1─┬─N establishments 1─┬─N dining_tables 1─N table_sessions
                │                     ├─1 pos_integrations
                │                     ├─N categories 1─N products N─N modifier_groups 1─N modifiers
                │                     ├─N orders 1─┬─N order_items
                │                     │            ├─N order_events
                │                     │            └─0..N pos_sales 1─N commission_ledger N─1 billing_statements
                ├─N memberships (user_id → auth.users)
                ├─N commission_rules
                └─N billing_statements
outbox (fila transacional) · audit_logs · platform_admins
```

## Tabelas

| Tabela | Finalidade | Notas |
|---|---|---|
| `organizations` | Tenant = empresa (NIF) | `status`: onboarding / active / suspended |
| `establishments` | Restaurantes de uma organização | horário em JSON, `manual_acceptance` |
| `memberships` | Utilizador ↔ organização, perfil | `establishment_id` null = todos |
| `platform_admins` | Equipa interna | MFA obrigatório (Supabase) |
| `dining_tables` | Mesas | `public_token` único e regenerável; `pos_table_ref` |
| `table_sessions` | Refeição numa mesa | expiração para limitar abuso de QR |
| `pos_integrations` | Ligação POS por estabelecimento | credenciais AES-256-GCM, estado, último erro |
| `categories`, `products`, `modifier_groups`, `modifiers`, `product_modifier_groups` | Catálogo sincronizado do POS | `locally_unavailable` só pode **restringir** |
| `orders` | Pedido | `UNIQUE(establishment_id, idempotency_key)` |
| `order_items` | Linhas com **snapshot** de nome/preço/IVA/extras | |
| `order_events` | Histórico de estados | fonte: customer/system/pos/staff/admin |
| `outbox` | Tarefas a publicar no BullMQ | mesma transação do pedido |
| `pos_sales` | Documentos faturados pelo POS atribuíveis à plataforma | `UNIQUE(establishment_id, pos_document_ref)` |
| `commission_rules` | Taxa e base com vigência | nunca editar regra passada; criar nova |
| `commission_ledger` | Razão de comissões | `UNIQUE(pos_sale_id, type)` → idempotente |
| `billing_statements` | Extrato mensal → fatura de serviço | DRAFT → APPROVED → INVOICED → PAID |
| `audit_logs` | Auditoria | antes/depois em JSON |

## Row Level Security (implementado — `drizzle/0003_rls.sql`)

- Todas as tabelas com `organization_id` têm RLS ativo e a política `tenant_isolation` para o role **`app_user`** (sem `BYPASSRLS`). Um teste falha se aparecer uma tabela com `organization_id` sem RLS.
- O servidor faz o trabalho de cada pedido dentro de `withTenant` (`src/server/db/tenant.ts`): `set local role app_user` + `set_config('app.current_org', …)` + `set_config('app.current_user', …)`. Sem contexto, `app_user` não vê nenhuma linha (falha fechada).
- Antes de haver contexto, só há duas portas, ambas funções `SECURITY DEFINER` no schema `app` (não exposto pela API REST da Supabase), que devolvem só ids:
  - `app.resolve_table(token)` — QR/NFC → organização/estabelecimento/mesa;
  - `app.user_memberships(user_id)` — painel → restaurantes a que o utilizador tem acesso.
- `staff_profiles`: o próprio utilizador e os colegas da organização atual.
- `platform_admins`: RLS sem políticas (ninguém acede pela app).
- Fora de `withTenant` (dono das tabelas): só o worker da fila, o seed de demonstração e as migrações.
- Na Supabase, os roles `anon`/`authenticated` da API REST não têm políticas → não leem nada destas tabelas.

## Retenção (RGPD)
- `orders.notes` e `order_items.notes`: anonimizar após 90 dias (tarefa agendada).
- `orders.client_ip_hash`: apagar após 30 dias.
- Dados financeiros (`pos_sales`, `commission_ledger`, `billing_statements`): 10 anos (obrigação fiscal).
