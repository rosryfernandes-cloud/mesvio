# MESVIO — resumo para revisão externa

> Documento para quem vai rever o projeto (pessoa ou outra IA). Lê isto primeiro. Atualizado a 24/10/2026.

## O que é
SaaS B2B para restaurantes, bares de praia, hotéis e piscinas em Portugal. O cliente lê o **QR Code ou a etiqueta NFC** do lugar (mesa ou espreguiçadeira), vê a ementa no telemóvel sem instalar nada, pede, e o pedido **entra diretamente no POS** do restaurante (alvo: ZoneSoft, via adaptador abstrato). Mesas pagam no fim (conta da mesa); espreguiçadeiras pagam ao pedir. Modelo de negócio: **1% sobre o valor sem IVA** dos pedidos originados na plataforma.

Marca: **MESVIO** ("O empregado que não sabias que precisavas."). Restaurante de demonstração: Swara Beach ClubHouse, ementa real com 199 artigos.

## Estado atual (honesto)
| Área | Estado |
|---|---|
| Landing page, marca, logótipo SVG, formulário "Pedir demonstração" (BD + email Resend opcional) | ✅ |
| Política de privacidade e termos | ✅ base escrita; **faltam dados da empresa** (`src/lib/legal.ts`) e revisão por jurista |
| Ementa por QR/NFC: separadores, variantes, extras, alergénios, carrinho, estado do pedido, conta da mesa | ✅ |
| Ementa em **português e inglês** (automático pela língua do telemóvel + seletor); traduções dos pratos por restaurante no painel | ✅ demo com inglês completo |
| Cor e logótipo próprios de cada restaurante na ementa (contraste WCAG AA validado) | ✅ logótipo só por URL https |
| Pedidos em Postgres, fila transacional (outbox) para o POS, idempotência, rate limit | ✅ teste de carga "sábado de agosto" sem perdas nem duplicados |
| Painel do restaurante: pedidos em tempo real, aprovação opcional, esgotados, mesas, equipa, aparência, inglês | ✅ |
| Contas com perfis dono/gerente/staff (Supabase Auth, código por email) + isolamento RLS entre restaurantes | ✅ RLS testado em Postgres real; **Supabase real ainda não ligada** |
| **Painel central** da equipa MESVIO: 2FA TOTP obrigatório, visão geral (pedidos, volume, comissão estimada, alertas), criar restaurante com mesas/QR e convite ao dono | ✅ novo |
| Pagamentos no telemóvel | ⚠️ fluxo completo com fornecedor **simulado**; **Stripe Connect por ligar** |
| Integração real ZoneSoft | ❌ à espera do fabricante (só MockPOS) |
| Publicação (Vercel + Supabase + domínio) | ⚠️ preparada (`vercel.json`, scripts, guia em docs/14), **ainda não publicada** |
| Reembolsos, conciliação de comissões com faturas do POS, monitorização/alertas, backups | ❌ por fazer |

**Testes:** 160 testes automáticos (Vitest) contra Postgres em memória (PGlite). `npm run check` = typecheck + testes + build de produção. Teste de carga em docs/12.

## Stack
Next.js 16 (App Router, React 19) · TypeScript estrito · Tailwind v4 · PostgreSQL + Drizzle ORM (Supabase em produção, PGlite em dev/testes, mesmas migrações) · Supabase Auth · Zod · Vitest. Fila e rate limit no próprio Postgres (sem Redis).

## Arquitetura em 8 pontos
1. **POS abstrato** (`src/server/pos/`): `PosAdapter` com capacidades declaradas; MockPOS funcional; esqueleto ZoneSoft que não finge funcionar.
2. **Preços sempre no servidor**: o telemóvel envia referências e quantidades; o servidor recalcula a partir do catálogo e recusa se o total mudou.
3. **Nenhum pedido se perde**: pedido + linhas + tarefa de envio na mesma transação (outbox); worker com `FOR UPDATE SKIP LOCKED`, lease, backoff; resultado ambíguo do POS só se repete com chave de idempotência externa.
4. **Multi-tenant com RLS**: pedidos HTTP correm como role `app_user` dentro de `withTenant`; políticas em todas as tabelas com `organization_id`; um teste falha se surgir tabela sem RLS.
5. **Sessões de mesa**: primeiro pedido abre a conta; staff fecha; fecho automático 6 h depois; fecho bloqueado com pagamento a decorrer.
6. **Pagamentos**: `PaymentProvider` (simulado; Stripe a seguir), valor calculado no servidor, um pagamento ativo por conta, reconciliação periódica, comissão como application fee.
7. **Línguas**: dicionário PT/EN para a interface (`src/lib/i18n/`), tabela `menu_translations` (RLS) para pratos; o POS recebe sempre os nomes originais.
8. **Painel central** (`src/server/platform/`): `platform_admins` sem políticas RLS (só servidor); TOTP RFC 6238 próprio, segredos AES-256-GCM, códigos de uso único com gravação condicional, 5 tentativas/5 min, cookie assinado de 8 h; quem não é admin recebe 404. Consultas entre restaurantes só depois desta guarda.

## Onde está cada coisa
```
src/app/page.tsx, privacidade/, termos/  Landing e textos legais
src/app/m/[token]/          Ementa do cliente, estado do pedido, conta (com cor/logo e língua)
src/app/painel/             Painel do restaurante (+ src/app/api/painel/*)
src/app/central/            Painel central (+ src/app/api/central/*)
src/server/orders/          Criar pedidos, fila de envio ao POS (outbox-worker.ts)
src/server/tables/          Tokens, QR, sessões de mesa
src/server/payments/        Fornecedores de pagamento, pagamento da conta e por pedido
src/server/staff|auth/      Perfis e permissões, Supabase Auth, equipa, traduções, aparência
src/server/platform/        Admins, 2FA (totp.ts, admin-auth.ts), serviço do painel central
src/server/db/              Schema, cliente, withTenant (RLS), seed demo
src/lib/i18n/               Textos PT/EN, alergénios e etiquetas
drizzle/                    Migrações SQL (0003_rls.sql = políticas RLS)
docs/                       PRD, arquitetura, riscos, decisões, deployment, carga, marca, publicar
```

## Como correr
```bash
npm install
npm run dev     # http://localhost:3000, sem configurar nada (PGlite + utilizadores demo)
npm run check   # typecheck + 160 testes + build
```
Páginas: `/` (landing), `/demo` (mesas de demonstração), `/m/<token>` (ementa), `/painel/entrar` (em dev: Ana/dona, Bruno/gerente, Carla/staff), `/central/entrar` (em dev: Paula/plataforma; configura 2FA no primeiro acesso).

## Perguntas para a revisão
1. **Segurança**: alguma forma de pagar menos, pedir noutro restaurante, ver dados de outro restaurante, ou entrar no painel central sem 2FA? (`place-order.ts`, `tenant.ts`, `0003_rls.sql`, `staff/http.ts`, `platform/admin-auth.ts`)
2. **Fiabilidade**: a fila (`outbox-worker.ts`), as sessões de mesa (`table-sessions.ts`) e os pagamentos (`payments/`) têm corridas que percam ou dupliquem pedidos ou dinheiro?
3. **Produto**: o que falta para um beach club usar isto num sábado de agosto?
4. **Negócio/legal em Portugal**: faturação certificada (AT), Stripe Connect, RGPD, textos legais, modelo de 1%.
5. **Prioridades**: as 5 próximas coisas a fazer, por ordem, antes do primeiro cliente real.

---

## Texto pronto a colar no chat
> Estou a construir a MESVIO, um SaaS para restaurantes e bares de praia em Portugal: ementa digital por QR/NFC (português e inglês), pedidos que entram diretamente no POS, painel para o restaurante, pagamento no telemóvel e um painel central com 2FA para eu gerir os clientes. Em anexo está o código (Next.js 16 + TypeScript + Postgres/Drizzle). Começa pelo ficheiro `docs/10-RESUMO-PARA-REVISAO.md`. Quero uma revisão honesta e crítica: (1) falhas de segurança, (2) bugs ou corridas que possam perder ou duplicar pedidos ou pagamentos, (3) o que falta para um restaurante usar isto em hora de ponta, (4) riscos legais e de negócio em Portugal, (5) as 5 próximas prioridades por ordem. Aponta ficheiros e linhas sempre que possível.
