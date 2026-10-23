# PRD — Plataforma de Pedidos NFC/QR para Restaurantes

> Versão 0.1 · Fase 1 · Outubro 2026
> Estado: rascunho para validação do fundador

## 1. Problema

Em restaurantes com serviço à mesa, o cliente espera para ser atendido, para pedir e para voltar a pedir. Os empregados gastam tempo a anotar pedidos e a introduzi-los no POS, com erros de transcrição (extras, alergias, mesas trocadas). Os restaurantes já têm um POS (em Portugal, frequentemente o ZS Rest da ZoneSoft) e **não querem trocar de sistema** nem pagar mais uma mensalidade fixa.

## 2. Proposta de valor

- **Cliente:** aproxima o telemóvel (NFC) ou lê o QR da mesa, vê a ementa com fotografias e preços, pede e volta a pedir sem esperar, sem criar conta e sem instalar nada.
- **Restaurante:** pedidos entram diretamente no POS que já usa, associados à mesa certa, com extras e observações estruturados. Paga apenas **1% do valor efetivamente faturado** dos pedidos originados na plataforma. Sem mensalidade.
- **Plataforma (nós):** receita variável alinhada com o valor gerado, auditável e reconciliada com a faturação real do POS.

## 3. Personas

| Persona | Objetivo | Restrições |
|---|---|---|
| Cliente à mesa | Pedir rápido e sem erros | Sem conta, rede móvel fraca, pouca paciência |
| Proprietário | Mais rotação, menos erros, controlo de custos | Pouco tempo, não técnico |
| Gerente | Operação do dia: mesas, indisponibilidades, pedidos | Precisa de agir em segundos |
| Funcionário | Ver e acompanhar pedidos | Permissões limitadas |
| Admin da plataforma (nós) | Onboarding, suporte, comissões, faturação | Acesso a todos os tenants, sempre auditado |

## 4. Âmbito

### 4.1 Dentro do âmbito (MVP comercial)
1. Ementa digital por mesa (NFC + QR), PT-PT, mobile-first.
2. Produtos com fotografia, descrição, preço, variantes, extras, observações e restrições alimentares/alergénios.
3. Carrinho, confirmação sem login, novos pedidos durante a refeição.
4. Envio de pedidos para o POS através de uma **camada de integração abstrata** (MockPOS agora; ZoneSoft quando houver documentação oficial).
5. Estado do pedido visível ao cliente, **nunca "aceite" sem confirmação real do POS** ou de um fluxo de aceitação autorizado (ex.: aceitação manual no painel).
6. Painel do restaurante com 3 níveis de acesso (proprietário, gerente, funcionário).
7. Motor de comissões (1%, base configurável, por defeito sem IVA), reconciliação com vendas faturadas, histórico auditável e preparação da fatura mensal de serviço.
8. Painel administrativo multi-tenant.

### 4.2 Fora do âmbito (nesta fase)
- Pagamentos online, gorjetas, divisão de conta.
- Movimentação de dinheiro do cliente final para a plataforma.
- Programas de fidelização, contas de cliente, marketing.
- Emissão de faturas certificadas AT a partir da nossa plataforma (preparamos os dados; a emissão será feita num software certificado — ver riscos).
- Takeaway/delivery.

## 5. Requisitos funcionais

### 5.1 Aplicação do cliente
| ID | Requisito | Prioridade |
|---|---|---|
| C-01 | Abrir a ementa da mesa a partir de URL com token seguro (QR/NFC) | Must |
| C-02 | Navegar por categorias; ver produtos indisponíveis como esgotados | Must |
| C-03 | Detalhe do produto: fotografia, descrição, alergénios, preço | Must |
| C-04 | Variantes (escolha única) e extras (escolha múltipla, com mín./máx.) | Must |
| C-05 | Observações livres por linha (limite de caracteres) | Must |
| C-06 | Carrinho persistente no dispositivo durante a refeição | Must |
| C-07 | Submeter pedido com chave de idempotência; repetir envio não duplica | Must |
| C-08 | Ecrã de estado: "Enviado", "Confirmado pelo restaurante", "Rejeitado", "Em preparação" (se o POS informar) | Must |
| C-09 | Fazer novos pedidos na mesma mesa | Must |
| C-10 | Respeitar horário do estabelecimento e indisponibilidades | Must |
| C-11 | Acessibilidade WCAG 2.2 AA (contraste, foco, leitores de ecrã) | Must |

### 5.2 Painel do restaurante
| ID | Requisito | Perfil mínimo |
|---|---|---|
| R-01 | Login (Supabase Auth, email + palavra-passe / magic link) | Funcionário |
| R-02 | Gerir estabelecimentos (dados, NIF, horário) | Proprietário |
| R-03 | Listar mesas, gerar/regenerar QR e URL NFC (revoga o anterior) | Gerente |
| R-04 | Ver pedidos em tempo real e o seu estado POS | Funcionário |
| R-05 | Aceitar/rejeitar manualmente, quando o fluxo manual estiver ativo | Gerente |
| R-06 | Estado da integração POS (última sincronização, erros) | Gerente |
| R-07 | Indisponibilidade de produtos (respeitando a origem da verdade do POS) | Gerente |
| R-08 | Faturação atribuível à plataforma e comissões | Proprietário |
| R-09 | Exportar relatórios (CSV) | Proprietário |
| R-10 | Gerir utilizadores e perfis do seu restaurante | Proprietário |

### 5.3 Painel administrativo da plataforma
A-01 lista de restaurantes · A-02 ativar/suspender · A-03 comissões por período · A-04 planos e percentagens (com data de efeito, nunca retroativos sem ajuste auditado) · A-05 problemas de integração · A-06 métricas de utilização · A-07 erros · A-08 utilizadores e permissões · A-09 faturação e estado de pagamento dos restaurantes.

### 5.4 Comissões
- Taxa por defeito: **1% (100 pontos base)**, configurável por organização/estabelecimento com data de efeito.
- Base configurável: `NET` (sem IVA, **por defeito**) ou `GROSS` (com IVA).
- Só contam vendas **faturadas no POS** e atribuídas a pedidos originados na plataforma.
- Cancelamentos excluídos; devoluções/notas de crédito geram estorno.
- Cada cálculo gera lançamentos **append-only** num razão (ledger) com regra, taxa, base e versão do algoritmo.
- Fecho mensal → extrato (statement) em rascunho → validação → dados prontos para emissão da fatura de serviço.

## 6. Requisitos não funcionais

| Área | Requisito |
|---|---|
| Desempenho | Ementa com LCP < 2,0 s em 4G; API de pedidos p95 < 300 ms (excluindo POS) |
| Disponibilidade | 99,9% mensal para ementa e receção de pedidos |
| Fiabilidade | Zero pedidos perdidos: persistência antes do envio ao POS + outbox + tentativas com backoff |
| Escala | Milhares de restaurantes, dezenas de milhares de mesas, picos ao almoço/jantar |
| Segurança | Isolamento por tenant (app + RLS), preços validados no servidor, credenciais POS encriptadas |
| Privacidade | RGPD: sem dados pessoais do cliente final por defeito; IP pseudonimizado; retenção definida |
| Idioma | PT-PT em todas as interfaces; preparado para i18n futura |
| Auditoria | Ações administrativas e financeiras registadas com ator, antes/depois e data |

## 7. Métricas de sucesso (piloto)
- ≥ 30% dos pedidos das mesas piloto feitos pela plataforma após 4 semanas.
- 0 pedidos perdidos; < 0,5% de pedidos com intervenção manual.
- Diferença de reconciliação comissões vs. faturação POS = 0 € no fecho mensal.
- Tempo de onboarding de um restaurante < 1 dia (excluindo instalação física NFC).

## 8. Dependências externas
- **Documentação oficial e credenciais da API ZoneSoft (ZS Rest)** — bloqueante para a Fase 6.
- Projeto Supabase (Auth + Postgres), Redis gerido, alojamento (Vercel + worker).
- Software certificado para emissão das nossas faturas de serviço.
- Etiquetas NFC NTAG213/215 e suportes de mesa.
- Validação jurídica: termos de serviço B2B, DPA (RGPD), política de privacidade.

## 9. Questões em aberto
1. A ZoneSoft permite criar pedidos associados a mesa e devolver confirmação? Expõe vendas faturadas para reconciliação? (Não assumimos nada até termos a documentação.)
2. Fluxo de aceitação manual: aceitável como alternativa quando o POS não confirma?
3. Base de comissão: valor sem IVA após descontos de linha? E descontos de conta inteira aplicados no POS — como ratear?
4. Quem é o tenant: a empresa (NIF) ou o estabelecimento? (Decisão: **organização = empresa**, com N estabelecimentos.)
