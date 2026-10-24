# Publicar a MESVIO (GitHub + Vercel + Supabase)

O que já está preparado no projeto: repositório git local, `vercel.json` (região Frankfurt e cron da fila a cada minuto), `npm run db:migrate:producao` e `npm run demo:supabase`.
O que tem de ser feito por si: criar as contas, comprar o domínio e pôr as chaves. **Nunca cole chaves no chat nem no código**: vão para as definições da Vercel e para `.env.production.local` (ignorado pelo git).

> Plano da Vercel: o plano grátis (Hobby) é só para uso pessoal **não comercial** e só aceita crons diários, por isso o deploy com `vercel.json` falha nesse plano. Para a MESVIO use o **Pro** (cerca de 20 $/mês por membro). Para experimentar no Hobby, apague temporariamente o bloco `crons` do `vercel.json`: os pedidos seguem na mesma para o POS, mas os reenvios e as limpezas automáticas deixam de correr.

## 1. Domínio
1. Confirme que o nome está livre como marca (INPI: servicosonline.inpi.justica.gov.pt).
2. Compre o domínio (ex.: `mesvio.pt` ou `mesvio.com`). Escolha-o já: os QR Codes impressos apontam para ele.

## 2. Supabase (base de dados + entradas da equipa)
1. supabase.com → **New project**, região **Central EU (Frankfurt)**, password forte para a base (guarde-a num gestor de passwords).
2. **Project Settings → Database → Connection string**:
   - *Transaction pooler* (porta 6543) → será o `DATABASE_URL` da Vercel.
   - *Session pooler* ou *Direct* (porta 5432) → será o `DIRECT_DATABASE_URL` (migrações e script da demo).
3. **Project Settings → API**: copie `Project URL`, `anon public` e `service_role` (este último é secreto).
4. No seu computador, crie o ficheiro `restaurante-saas/.env.production.local` (fica só na sua máquina):
   ```
   DIRECT_DATABASE_URL=<ligação 5432>
   NEXT_PUBLIC_APP_URL=https://<o-seu-dominio>
   ```
5. Crie as tabelas, as regras de isolamento (RLS) e as funções:
   ```bash
   npm run db:migrate:producao
   ```
6. Siga a secção **Configurar a Supabase Auth** de [08-DEPLOYMENT.md](08-DEPLOYMENT.md): desligar registos livres, URLs de redirecionamento e os modelos de email em [emails/](emails/).
7. Convide-se a si próprio: **Authentication → Users → Invite user**.
8. Crie a demo e torne-se dono dela:
   ```bash
   npm run demo:supabase -- --confirmar --dono=<o-seu-email>
   ```
9. Dê-se acesso ao **painel central** (gestão de todos os restaurantes):
   ```bash
   npm run admin:criar -- --email=<o-seu-email> --nome="O seu nome" --confirmar
   ```
   O comando mostra um **código de ativação** (uso único, 48 h). Na primeira entrada em `/central/entrar`: código por email → código de ativação → app de autenticação (2FA). Para outra pessoa da equipa, entregue-lhe o código por telefone ou pessoalmente, **nunca por email**. Telemóvel perdido: `npm run admin:repor-2fa -- --email=… --confirmar` (gera um código novo).

## 3. GitHub
1. github.com → **New repository** → nome `mesvio`, **Private**, sem README.
2. No terminal, dentro de `restaurante-saas` (o primeiro commit já está feito):
   ```bash
   git remote add origin https://github.com/<utilizador>/mesvio.git
   git push -u origin main
   ```

## 4. Vercel
1. vercel.com → **Add New → Project** → importe o repositório `mesvio`. Framework: Next.js (detetado sozinho).
2. **Environment Variables** (ambiente *Production*):

| Variável | Valor |
|---|---|
| `NEXT_PUBLIC_APP_URL` | `https://<o-seu-dominio>` |
| `DATABASE_URL` | ligação *Transaction pooler* (6543) |
| `DB_POOL_MAX` | `3` |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | chave `anon public` |
| `SUPABASE_SERVICE_ROLE_KEY` | chave `service_role` (secreta) |
| `OUTBOX_WORKER` | `off` |
| `CRON_SECRET` | gerar: `openssl rand -base64 32` |
| `SESSION_SECRET` | gerar: `openssl rand -base64 48` |
| `IP_HASH_SALT` | gerar: `openssl rand -base64 32` |
| `POS_CREDENTIALS_KEY` | gerar: `openssl rand -base64 32` |
| `POS_CREDENTIALS_KEY_ID` | `k1` |
| `PLATFORM_SECRET_KEY` | gerar: `openssl rand -base64 32` (cifra o 2FA do painel central; não mudar depois) |
| `TRUSTED_PROXY` | `vercel` |
| `DEFAULT_POS_PROVIDER` | `mock` |
| `RESEND_API_KEY` | chave da Resend (opcional, ver secção 6) |
| `DEMO_REQUESTS_TO` | o seu email (quem recebe os pedidos de demonstração) |
| `DEMO_REQUESTS_FROM` | ex.: `MESVIO <ola@o-seu-dominio>` |

   **Pagamentos (Stripe):** `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET` (endpoint de produção em "eventos em contas ligadas"). Passo a passo em [08-DEPLOYMENT.md](08-DEPLOYMENT.md#configurar-a-stripe-connect-pagamentos-no-telemóvel). Use chaves de **teste** até o piloto estar validado.
3. **Deploy**.
4. **Settings → Domains** → adicione o domínio e copie os registos DNS indicados para o sítio onde o comprou.
5. Na Supabase, **Authentication → URL Configuration**: *Site URL* = `https://<o-seu-dominio>`; *Redirect URLs* inclui `https://<o-seu-dominio>/painel/auth/confirmar`.

## 5. Verificar
- `https://<o-seu-dominio>` → landing MESVIO.
- `https://<o-seu-dominio>/demo` → escolher a Mesa 1, fazer um pedido.
- `https://<o-seu-dominio>/painel/entrar` → entrar com o código enviado por email e ver o pedido.
- `https://<o-seu-dominio>/central/entrar` → entrar, configurar o 2FA e ver a visão geral.
- `https://<o-seu-dominio>/api/health` → estado da app.
- Vercel → **Settings → Cron Jobs**: `/api/cron/outbox` a correr a cada minuto.

## 6. Pedidos de demonstração (formulário da landing)
O botão "Pedir demonstração" abre um formulário no fim da página. Cada pedido fica guardado na tabela **demo_requests** (Supabase → *Table Editor*), sem acesso pela API pública.
Para o receber também por email:
1. Conta grátis em resend.com → **Domains** → adicione o seu domínio e copie os registos DNS indicados.
2. **API Keys** → crie uma chave só com permissão de envio.
3. Na Vercel, defina `RESEND_API_KEY`, `DEMO_REQUESTS_TO` e `DEMO_REQUESTS_FROM` e faça *Redeploy*.
A resposta ao email vai diretamente para quem pediu a demonstração. Se o envio falhar, o pedido não se perde: fica na tabela com `notified_at` vazio.

## O que ainda não funciona online
- **Pagamentos no telemóvel**: só depois de configurar a Stripe e de cada dono ligar a conta dele. Até lá as mesas pagam ao balcão e as **espreguiçadeiras não aceitam pedidos**.
- **POS real**: a demo usa o MockPOS; a ZoneSoft aguarda documentação.
- **Logótipo por ficheiro**: só por endereço https.
- Antes de restaurantes reais: pontos em aberto da auditoria (reembolsos, conciliação de comissões, monitorização, RGPD).

## Atualizar o site depois
Cada `git push` para `main` publica uma nova versão. Se houver migrações novas em `drizzle/`, corra `npm run db:migrate:producao` **antes** do push.
