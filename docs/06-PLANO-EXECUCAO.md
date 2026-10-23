# Plano de execução

Estimativas para 1 engenheiro full-stack sénior. Cada fase termina com relatório (implementado, ficheiros, como testar, testes e resultados, pendente, dependências externas) e **só avança com aprovação**.

| Fase | Entregáveis | Critério de aceitação | Estimativa |
|---|---|---|---|
| **1 — Planeamento e arquitetura** (em validação) | PRD, arquitetura, schema, estrutura, POS e riscos, plano; Next.js executável; ementa por mesa sobre MockPOS | Documentos revistos; `npm run check` verde; ementa abre nas 10 mesas | 1 semana |
| **2 — Aplicação do cliente** | Detalhe de produto, variantes/extras com validação, observações, carrinho persistente, confirmação, ecrã de estado, horário/esgotados | Testes de componentes e E2E (Playwright) do fluxo completo em telemóvel | 2 semanas |
| **3 — Backend e MockPOS** | Supabase Postgres + migrações + RLS, API de pedidos idempotente, recálculo de preços, outbox + BullMQ + worker, máquina de estados, rate limit, auditoria | Testes de integração com Postgres/Redis reais; teste de isolamento entre tenants; zero perdas em teste de falhas | 3 semanas |
| **4 — Painel do restaurante** | Supabase Auth, perfis owner/manager/staff, mesas + QR/NFC (PDF imprimível), pedidos em tempo real, aceitação manual, estado POS, indisponibilidades, relatórios CSV | Testes de permissões por perfil; E2E do painel | 3 semanas |
| **5 — Comissões e administração** | Importação de vendas, reconciliação, razão de comissões, extratos mensais, painel admin (restaurantes, planos, métricas, erros, utilizadores) | Reconciliação de um mês simulado bate ao cêntimo; auditoria completa | 3 semanas |
| **6 — Integração ZoneSoft** | Adaptador oficial, testes de contrato, piloto num restaurante | Piloto 4 semanas sem perdas; reconciliação mensal fechada | depende da ZoneSoft |

## Estado da Fase 2 (22/10/2026)
Feito: detalhe de produto com variantes/extras validados, observações, carrinho persistente (por mesa), envio de pedidos com recálculo de preços no servidor, idempotência, tentativas de reenvio, ecrã de estado, folha de QR/NFC imprimível (antecipada da Fase 4, sem autenticação — só dados de demonstração).
Fase 3 (núcleo, 22/10/2026): pedidos em Postgres, fila de envio ao POS (outbox + worker, reenvios com backoff, lease), rate limit, números de pedido do dia. Falta na Fase 3: catálogo sincronizado na BD, políticas RLS e teste de isolamento entre tenants, testes contra o Postgres do Supabase.
Em falta: horário de funcionamento, testes de componentes e E2E (Playwright).

Fase 4 (parcial, 22/10/2026): painel do staff em `/painel` — pedidos em tempo real (3 s), alertas (banner, som, título), aprovação manual opcional, confirmar pedidos que o POS só recebeu, tratar "precisa de atenção" (tentar de novo / já lancei no POS / cancelar), esgotados. Contas individuais (Supabase Auth, código por email) com perfis dono/gerente/staff e gestão de equipa no painel; RLS e testes de isolamento (fecha a Fase 3). Falta: validar contra um projeto Supabase real, gestão de mesas/QR no painel com revogação de tokens, relatórios CSV, E2E do painel.

Sessões de mesa (22/10/2026): conta da mesa para o cliente, separador Mesas no painel com fecho de mesa, fecho automático após 6 h sem pedidos. Falta: pagamento na mesa (depende de fornecedor de pagamentos e da integração com o POS para fechar a conta/faturar), dividir a conta.

## Próximos passos imediatos
1. **Contactar a ZoneSoft** com as perguntas do doc 04 §5 (bloqueante mais longo — começar já).
2. Criar projeto Supabase (região UE) e Redis gerido (UE).
3. Validar com um restaurante piloto o fluxo de aceitação (automático vs. manual).
4. Aprovar a Fase 1 → iniciar Fase 2.
