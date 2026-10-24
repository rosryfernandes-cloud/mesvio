# Deployment e variáveis de ambiente

## Topologia de produção (proposta)
| Componente | Serviço | Região |
|---|---|---|
| App Next.js | Vercel (ou Node em contentor) | UE (fra1/cdg1) |
| PostgreSQL + Auth | Supabase | eu-west (Irlanda) ou eu-central |
| Worker da fila (outbox) | Dentro da app Node (`instrumentation.ts`); em Vercel, cron a cada minuto para `/api/cron/outbox` | UE |
| Erros | Sentry (região UE) | UE |

Todos os dados na UE (RGPD).

## Variáveis de ambiente
Ver [`.env.example`](../.env.example).

| Variável | Onde | Fase | Notas |
|---|---|---|---|
| `NEXT_PUBLIC_APP_URL` | app | 1 | URL base dos QR/NFC — mudar quebra etiquetas impressas, escolher domínio definitivo cedo |
| `DATABASE_URL` | app, worker | 3 | Pooler de transações Supabase (6543), `prepare:false` |
| `DIRECT_DATABASE_URL` | CI/migrações | 3 | Ligação direta (5432) |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | app | 4 | Públicas por desenho |
| `SUPABASE_SERVICE_ROLE_KEY` | servidor | 4 | **Segredo** — nunca no browser |
| `OUTBOX_WORKER` | app | 3 | `off` em serverless (usar o cron); por omissão o worker corre no servidor |
| `CRON_SECRET` | app | 3 | **Segredo**. Ativa `/api/cron/outbox` (cabeçalho `Authorization: Bearer …`) |
| `PGLITE_DIR` | dev | 3 | Pasta da BD local sem `DATABASE_URL` (por omissão `.data/pglite`) |
| `POS_CREDENTIALS_KEY`, `POS_CREDENTIALS_KEY_ID` | app, worker | 3 | AES-256-GCM; rotação mantendo chaves antigas para desencriptar |
| `IP_HASH_SALT` | app | 3 | Pseudonimização de IP |
| `TRUSTED_PROXY` | app | 3 | `vercel` (omissão) \| `cloudflare` \| `none`: de que cabeçalho se lê o IP do cliente |
| `SESSION_SECRET` | app | 4 | **Segredo**. Assina cookies do painel (modo dev); obrigatório em produção |
| `DEFAULT_POS_PROVIDER` | app | 1 | `mock` até haver ZoneSoft |
| `SENTRY_DSN`, `LOG_LEVEL` | todos | 3 | Opcional |

## Pipeline
1. PR → CI: `npm ci`, `npm run typecheck`, `npm test`, `npm run build` (+ E2E a partir da Fase 2).
2. Merge em `main` → preview → produção com aprovação.
3. Migrações: `npm run db:migrate` com `DIRECT_DATABASE_URL` **antes** do deploy da app; migrações sempre compatíveis com a versão anterior (expand/contract).

## Execução local
```bash
npm install
cp .env.example .env.local   # só NEXT_PUBLIC_APP_URL é necessária na Fase 1
npm run dev                  # http://localhost:3000
```
Sem `DATABASE_URL`, a app usa **PGlite** (Postgres embutido) em `.data/pglite`: migra e cria a demo sozinha. Para recomeçar do zero, apague `.data/`.
Para testar contra um Postgres real: defina `DATABASE_URL` e corra `npm run db:migrate`.

## Configurar a Supabase Auth (antes do primeiro restaurante)
1. Criar o projeto na **região UE** e copiar para as variáveis: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (só servidor), `DATABASE_URL`/`DIRECT_DATABASE_URL`.
2. `npm run db:migrate` (cria tabelas, role `app_user`, funções `app.*` e políticas RLS).
3. **Authentication → Sign In / Providers → Email**: ativo; **desligar "Allow new users to sign up"** (só entra quem for convidado).
4. **Authentication → URL Configuration**: Site URL = domínio da app; Redirect URLs inclui `https://<domínio>/painel/auth/confirmar`.
5. **Authentication → Emails → Templates** (em português; modelos HTML com a marca MESVIO prontos a colar em [docs/emails/](emails/)):
   - *Magic Link* (é o usado para o código): incluir `{{ .Token }}` — ex.: «O seu código de entrada no painel é **{{ .Token }}**. Expira em 1 hora.»
   - *Invite user*: link `{{ .SiteURL }}/painel/auth/confirmar?token_hash={{ .TokenHash }}&type=invite`.
6. Configurar um SMTP próprio (o da Supabase tem limites baixos de envio).
7. Criar o primeiro dono: convidar o email em *Authentication → Users → Invite*, e inserir a associação (`memberships`, role `owner`, `establishment_id` nulo) e o perfil (`staff_profiles`). A partir daí, o dono convida o resto da equipa no painel.

## Configurar a Stripe Connect (pagamentos no telemóvel)

**Modelo:** cobranças diretas (*direct charges*) na conta Stripe de cada restaurante. O restaurante é o comerciante (aparece no extrato do cliente, emite a fatura, responde a disputas e paga as comissões da Stripe); a comissão MESVIO sai automaticamente como *application fee* (taxa do cliente no painel central; 1% por omissão). A MESVIO nunca guarda dinheiro nem vê dados de cartão.

### 1. Conta e Connect (modo de teste)
1. Criar a conta em **dashboard.stripe.com/register** com os dados da empresa MESVIO (país: **Portugal**). Trabalhar sempre em **modo de teste / Sandbox** até ao piloto.
2. **Connect → Começar**: escolher **plataforma**, em que *as contas ligadas recebem os pagamentos diretamente* (cobranças diretas) e têm o **dashboard Stripe completo**. Preencher o perfil da plataforma (é pedido antes de criar contas ligadas).
3. **Settings → Payment methods → (configuração para contas ligadas)**: ativar **Cartões**, **Apple Pay**, **Google Pay** e **MB WAY**. Multibanco e débito direto ficam excluídos pela app (não são imediatos).

### 2. Chaves (no `.env.local`, nunca no chat nem no código)
| Variável | Onde a encontrar |
|---|---|
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Developers → API keys → *Publishable key* (`pk_test_…`) |
| `STRIPE_SECRET_KEY` | Developers → API keys → *Secret key* (`sk_test_…`) — **secreta** |
| `STRIPE_WEBHOOK_SECRET` | em local: o `whsec_…` que o `stripe listen` mostra (passo 3); em produção: o *signing secret* do endpoint |

`STRIPE_DEMO_CONNECTED_ACCOUNT` já não é preciso: o dono liga a conta no painel. Com `STRIPE_SECRET_KEY` definida, o pagamento simulado desaparece e um restaurante sem conta ligada não cobra (as espreguiçadeiras não aceitam pedidos).

### 3. Webhook
- **Em local** (Stripe CLI: `brew install stripe/stripe-cli/stripe`, depois `stripe login`):
  ```bash
  stripe listen --forward-connect-to localhost:3000/api/pagamentos/stripe/webhook --events payment_intent.succeeded,payment_intent.processing,payment_intent.payment_failed,payment_intent.canceled,charge.refunded
  ```
  Copiar o `whsec_…` que aparece para `STRIPE_WEBHOOK_SECRET` e reiniciar o `npm run dev`.
- **Em produção**: Developers → Webhooks → *Add endpoint* → **"Eventos em contas ligadas"** (Connect) → `https://<domínio>/api/pagamentos/stripe/webhook` com os mesmos 5 eventos.
- Sem webhook os pagamentos confirmam-se na mesma (o telemóvel e a reconciliação a cada ~30 s perguntam à Stripe); o webhook torna-o imediato e apanha os reembolsos feitos no dashboard.

### 4. Ligar o restaurante e testar
1. Entrar no painel como **dono** → **Mesas** → **Ligar conta Stripe** → formulário da Stripe (em teste, usar os dados de teste que a própria Stripe propõe) → regresso ao painel.
2. Ligar **"Clientes podem pagar a conta no telemóvel"** (só fica disponível com a conta verificada).
3. Pagar uma mesa ou uma espreguiçadeira com o cartão de teste **4242 4242 4242 4242** (data futura, qualquer CVC). Recusas e 3-D Secure: cartões de teste em docs.stripe.com/testing. MB WAY em teste: ver docs.stripe.com/payments/mb-way.
4. **Apple Pay** só aparece em HTTPS, num domínio registado na conta do restaurante (a app regista-o sozinha no regresso do formulário). Não aparece em `localhost`; testar no staging ou com um túnel https.

### 5. Reembolsos
- **Pago a mais** (dois telemóveis pagaram a mesma conta): botão **Devolver ao cliente** na mesa (dono/gerente).
- Qualquer outro reembolso: no dashboard Stripe do restaurante; o webhook `charge.refunded` atualiza a conta na MESVIO. A comissão MESVIO é devolvida na mesma proporção.
