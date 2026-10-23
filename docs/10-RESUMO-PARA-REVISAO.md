# MESVIO — resumo para revisão externa

> Documento para quem vai rever o projeto (pessoa ou outra IA). Lê isto primeiro; o resto do código está organizado como descrito abaixo.

## O que é
SaaS B2B para restaurantes em Portugal: o cliente lê o **QR Code ou a etiqueta NFC** da mesa, vê a ementa no telemóvel (sem instalar app), faz o pedido, e o pedido **entra diretamente no POS** do restaurante (alvo: ZoneSoft ZS Rest, via adaptador abstrato). O cliente vê a conta da mesa e pode pagá-la no telemóvel (Apple Pay / MB WAY / cartão). Modelo de negócio: **1% de comissão sobre o valor sem IVA** do que a plataforma origina.

Restaurante de demonstração: Swara Beach ClubHouse (Fonte da Telha), ementa real com 199 artigos.

## Estado atual (honesto)
| Área | Estado |
|---|---|
| Ementa por mesa (QR/NFC), separadores Comida / Bebidas / Bar, variantes e extras, alergénios | ✅ feito e testado |
| Carrinho, envio de pedido, ecrã de estado, conta da mesa | ✅ |
| Pedidos em Postgres, fila de envio ao POS com reenvios, idempotência, rate limit | ✅ |
| Painel do staff: pedidos em tempo real, alertas, aprovação manual, esgotados, mesas (fechar conta), equipa | ✅ |
| Contas individuais com perfis dono/gerente/staff (Supabase Auth, código de 6 dígitos por email) | ✅ código feito; **não testado contra um projeto Supabase real** (testado em modo dev) |
| Isolamento entre restaurantes com RLS do Postgres | ✅ testado com 2 organizações |
| Pagamentos na mesa | ✅ fluxo completo com fornecedor **simulado**; **Stripe Connect ainda por ligar** (faltam chaves de teste) |
| Integração real com o POS ZoneSoft | ❌ à espera de documentação/acesso do fabricante (só existe o MockPOS) |
| Horários (esconder artigos fora de horas), fotos dos pratos, dividir a conta, relatórios | ❌ por fazer |
| Deploy em produção, monitorização, backups | ❌ por fazer (desenho em docs/08) |

**Testes:** 94 testes automáticos (Vitest) a passar, contra Postgres real em memória (PGlite). `npm run check` = typecheck + testes + build de produção.

## Stack
- **Next.js 16** (App Router, React 19, Turbopack) + **TypeScript** estrito + **Tailwind v4**
- **PostgreSQL** com **Drizzle ORM**; Supabase em produção, **PGlite** (Postgres em WASM) em dev/testes — mesmas migrações
- **Supabase Auth** (painel), **Zod** (validação), **Vitest** (testes)
- Fila de envio ao POS e rate limit **no próprio Postgres** (sem Redis) — ver docs/07 D15

## Arquitetura em 6 pontos
1. **POS abstrato** (`src/server/pos/`): interface `PosAdapter` com capacidades declaradas; `MockPosAdapter` funcional; esqueleto ZoneSoft que não finge funcionar.
2. **Preços sempre no servidor**: o telemóvel envia só referências e quantidades; o servidor recalcula a partir do catálogo do POS e recusa se o total mudou.
3. **Nenhum pedido se perde**: pedido + linhas + tarefa de envio gravados na mesma transação (transactional outbox); worker com `FOR UPDATE SKIP LOCKED`, lease, backoff exponencial, `NEEDS_ATTENTION` ao fim de 8 tentativas; idempotência na BD e no POS.
4. **Multi-tenant com RLS**: cada pedido HTTP corre como role `app_user` dentro de `withTenant` (`set local role` + `set_config('app.current_org')`); políticas em todas as tabelas com `organization_id`; teste que falha se surgir tabela sem RLS.
5. **Sessões de mesa**: o primeiro pedido abre a conta da mesa; o staff fecha-a; fecho automático 6 h após o último pedido; tratamento da corrida "fechar mesa vs. pedido a entrar".
6. **Pagamentos**: interface `PaymentProvider` (simulado agora, Stripe Connect a seguir); valor sempre calculado no servidor; comissão de 1% (sem IVA) registada como application fee; tentativas idempotentes.

## Onde está cada coisa
```
src/app/m/[token]/          Ementa do cliente, estado do pedido, conta da mesa
src/app/painel/             Painel do staff (+ src/app/api/painel/*)
src/app/api/                API pública (pedidos, conta, pagamentos) e cron do worker
src/components/order|staff  Interface do cliente e do painel
src/server/orders/          Criar pedidos, fila de envio ao POS (outbox-worker.ts)
src/server/tables/          Tokens de mesa, QR, sessões de mesa (conta)
src/server/payments/        Fornecedores de pagamento e pagamento da conta
src/server/staff|auth/      Contexto, perfis e permissões, Supabase Auth, equipa
src/server/db/              Schema Drizzle, cliente, withTenant (RLS), seed demo
src/server/pos/             PosAdapter, MockPOS, dados da ementa de demonstração
drizzle/                    Migrações SQL (0003_rls.sql = políticas RLS)
docs/                       PRD, arquitetura, BD, POS, riscos, plano, decisões (ADR), deployment
```

## Como correr
```bash
npm install
npm run dev     # http://localhost:3000 — sem configurar nada (PGlite + utilizadores demo)
npm run check   # typecheck + 94 testes + build
```
Páginas: `/` (mesas de demo), `/m/<token>` (ementa), `/painel` (painel; em dev escolhe-se Ana/dona, Bruno/gerente ou Carla/staff), `/qr` (QR Codes para imprimir).

## Perguntas para a revisão
1. **Segurança**: vês alguma forma de um cliente pagar menos, fazer pedidos noutra mesa/restaurante, ou de um funcionário ver dados de outro restaurante? (ver `place-order.ts`, `tenant.ts`, `0003_rls.sql`, `staff/http.ts`)
2. **Fiabilidade**: a fila de envio ao POS (`outbox-worker.ts`) e as sessões de mesa (`table-sessions.ts`) têm corridas ou casos que percam/dupliquem pedidos?
3. **Produto**: o que falta para um restaurante de praia como o Swara usar isto num sábado de agosto cheio?
4. **Negócio/legal em Portugal**: faturação certificada (AT), pagamentos via Stripe Connect, RGPD (alergias nas observações), modelo de 1% — algum risco que não esteja em `docs/05-RISCOS.md`?
5. **Prioridades**: o que farias a seguir, por ordem?

---

## Texto pronto a colar no chat
> Estou a construir um SaaS para restaurantes em Portugal: ementa digital por QR/NFC, pedidos que entram diretamente no POS, painel para o staff e pagamento da conta no telemóvel. Em anexo está o código (Next.js 16 + TypeScript + Postgres/Drizzle). Começa pelo ficheiro `docs/10-RESUMO-PARA-REVISAO.md`. Quero uma revisão honesta e crítica: (1) falhas de segurança, (2) bugs ou corridas que possam perder ou duplicar pedidos ou pagamentos, (3) o que falta para um restaurante usar isto em hora de ponta, (4) riscos legais/negócio em Portugal, (5) as 5 próximas prioridades por ordem. Aponta ficheiros e linhas sempre que possível.
