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

## Configurar a Stripe Connect (pagamentos na mesa)
1. Criar conta em dashboard.stripe.com (país: Portugal) e trabalhar em **modo de teste / Sandbox**.
2. **Developers → API keys**: copiar a *Publishable key* (`pk_test_…`) para `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` e a *Secret key* (`sk_test_…`) para `STRIPE_SECRET_KEY`.
3. **Connect**: ativar a Connect na conta (modelo de plataforma/marketplace). Em teste, criar uma conta ligada para o restaurante de demonstração e copiar o id (`acct_…`) para `STRIPE_DEMO_CONNECTED_ACCOUNT`.
4. **Settings → Payment methods**: ativar **Apple Pay**, **Google Pay**, **MB WAY** e cartões (para a plataforma e para as contas ligadas).
5. **Apple Pay** só aparece em HTTPS e num domínio registado (**Settings → Payment method domains**): não aparece em `localhost`. O MB WAY testa-se em local com os números de teste da Stripe.
6. **Webhooks** (produção): endpoint `https://<domínio>/api/pagamentos/stripe/webhook` com os eventos `payment_intent.succeeded` e `payment_intent.payment_failed`; copiar o *signing secret* para `STRIPE_WEBHOOK_SECRET`.
7. Comissão: cada pagamento leva uma *application fee* de 1% do valor sem IVA, retida automaticamente pela Stripe para a plataforma.
