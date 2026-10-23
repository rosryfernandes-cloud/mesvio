# Integração POS

## 1. Princípios
1. **Não inventamos a API da ZoneSoft.** Nenhum endpoint, credencial ou capacidade é assumido sem documentação oficial escrita.
2. A aplicação fala com uma interface única, `PosAdapter` ([`src/server/pos/types.ts`](../src/server/pos/types.ts)).
3. Cada adaptador **declara capacidades**; a aplicação degrada de forma controlada quando uma capacidade não existe.
4. O cliente só vê "Confirmado" com confirmação real do POS (`orderAcknowledgement`) ou aceitação manual autorizada no painel.

## 2. Contrato `PosAdapter`

| Método | Uso | Capacidade |
|---|---|---|
| `healthCheck()` | Estado da integração no painel | — |
| `fetchCatalog()` | Sincronizar categorias, artigos, preços, IVA, extras | `catalogSync` |
| `fetchTables()` | Mapear mesas do POS → `dining_tables.pos_table_ref` | `tableSync` |
| `submitOrder()` | Enviar pedido à mesa | `createOrder` (+ `orderAcknowledgement`, `externalIdempotencyKey`) |
| `fetchSalesDocuments()` | Reconciliação de faturação, cancelamentos e notas de crédito | `salesReconciliation`, `refundsAndCancellations` |

Resultados de `submitOrder`: `accepted` · `submitted` (recebido sem aceitação) · `rejected` (definitivo) · `retryable_error` (tentar de novo).

## 3. Adaptadores

### MockPOS (implementado)
[`src/server/pos/mock/mock-pos-adapter.ts`](../src/server/pos/mock/mock-pos-adapter.ts) — em memória, com a ementa e as 10 mesas de demonstração. Simula: latência, aceitação ou só receção, falhas transitórias, esgotados, validação de preços e extras, idempotência pelo id externo, faturação e notas de crédito. Coberto por testes.

### ZoneSoft (esqueleto)
[`src/server/pos/zonesoft/zonesoft-adapter.ts`](../src/server/pos/zonesoft/zonesoft-adapter.ts) — todas as capacidades a `false`, todos os métodos lançam `ZoneSoftNotAvailableError`. Um teste garante que o esqueleto não "finge" funcionar.

## 4. Matriz de capacidades ZoneSoft — a preencher com a documentação oficial

| Capacidade | Necessária para | Estado | Fonte (doc/secção) |
|---|---|---|---|
| Autenticação e modelo de credenciais | tudo | ❓ desconhecido | — |
| Ler artigos, preços, IVA | ementa | ❓ | — |
| Ler famílias/categorias | ementa | ❓ | — |
| Ler extras/complementos e variantes | ementa e pedidos | ❓ | — |
| Ler mesas/zonas | mapeamento de mesas | ❓ | — |
| Criar pedido associado a mesa | pedidos | ❓ | — |
| Encaminhar para impressoras de cozinha/bar | operação | ❓ | — |
| Referência externa / idempotência | anti-duplicação | ❓ | — |
| Confirmação de receção/aceitação | estado ao cliente | ❓ | — |
| Estados posteriores (preparação, servido) | estado ao cliente | ❓ | — |
| Webhooks vs. polling | arquitetura do worker | ❓ | — |
| Documentos faturados com ligação ao pedido | comissões | ❓ | — |
| Anulações e notas de crédito | comissões | ❓ | — |
| Disponibilidade/esgotados | ementa | ❓ | — |
| Limites de pedidos (rate limits) | escala | ❓ | — |
| Ambiente de testes (sandbox) | desenvolvimento | ❓ | — |
| Instalação local vs. cloud do ZS Rest | conectividade | ❓ | — |

## 5. Perguntas a enviar à ZoneSoft
1. Existe API oficial (ou programa de parceiros) para o ZS Rest? Qual o processo de acesso e os termos comerciais?
2. O ZS Rest dos clientes corre localmente, na cloud, ou ambos? Como chega uma integração externa a uma instalação local?
3. É possível criar um pedido numa mesa aberta, com extras e observações, e que siga para as impressoras de cozinha/bar?
4. Aceitam um identificador externo e garantem que não duplicam pedidos com o mesmo identificador?
5. Devolvem confirmação síncrona? Há webhooks de estado?
6. Como obter documentos de venda e relacionar as linhas com o nosso pedido (para comissão só sobre o que originámos)?
7. Como são reportadas anulações, devoluções e notas de crédito?
8. Existe sandbox e limites de utilização?

## 6. Plano B se a API não suportar tudo
| Lacuna | Alternativa |
|---|---|
| Sem confirmação de aceitação | Aceitação manual no painel (tablet do restaurante) |
| Sem criação de pedidos via API | Impressão direta na cozinha/bar + lançamento manual no POS (reduz valor; reavaliar) |
| Sem ligação venda ↔ pedido | Atribuição por mesa + janela temporal + artigos, com revisão manual; ou declaração mensal do restaurante |
| Sem documentos faturados | Base de comissão = pedidos aceites menos cancelamentos registados no painel (exige alteração contratual) |

## 7. Testes de contrato
Quando houver sandbox: suite `pos-contract` executada contra **qualquer** adaptador (Mock e ZoneSoft) para garantir comportamento equivalente (idempotência, rejeição de preços errados, mesa inexistente, falhas transitórias).
