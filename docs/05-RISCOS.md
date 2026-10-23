# Riscos

Escala: Probabilidade (P) e Impacto (I) de 1 a 5.

| # | Risco | P | I | Mitigação |
|---|---|---|---|---|
| R1 | ZoneSoft não disponibiliza API ou não suporta criar pedidos à mesa | 3 | 5 | Contacto imediato; arquitetura agnóstica de POS; plano B (doc 04 §6); considerar outros POS do mercado PT |
| R2 | API sem ligação venda ↔ pedido torna a comissão difícil de provar | 3 | 5 | Exigir referência externa; atribuição por regras + revisão; cláusula contratual de reconciliação |
| R3 | Pedidos perdidos ou duplicados | 2 | 5 | **Implementado:** pedido + tarefa na mesma transação, fila com reenvios e lease, idempotência em BD (UNIQUE) e no POS, `NEEDS_ATTENTION` após 8 tentativas, com alerta (banner, som) no painel |
| R4 | Abuso de QR (pedidos falsos de fora do restaurante) | 3 | 3 | **Implementado:** rate limit por telemóvel (10/5 min) e por mesa (30/15 min), limites por pedido. Aprovação manual no painel implementada. Falta: revogação de token no painel, sessões de mesa |
| R5 | Fuga de dados entre restaurantes | 1 | 5 | **Implementado:** RLS com role `app_user` em todas as tabelas de tenant, `withTenant` em cada pedido, testes com uma segunda organização e teste que falha se surgir tabela sem RLS |
| R6 | Divergência de preços POS vs. ementa | 3 | 3 | Sincronização periódica; servidor recalcula; POS rejeita divergências; snapshot nas linhas |
| R7 | Dados de saúde (alergias) em observações | 3 | 3 | Sem identificação do cliente; retenção curta; DPA; avisos na interface |
| R8 | Faturação da nossa comissão exige software certificado AT | 4 | 3 | Preparar dados; emitir em software certificado (ex.: integração futura); nunca emitir faturas não certificadas |
| R9 | Rede fraca no restaurante / telemóvel do cliente | 4 | 2 | Páginas leves, carrinho local, reenvio idempotente automático |
| R10 | Dependência de um único POS limita mercado | 3 | 4 | Interface `PosAdapter`; roadmap de adaptadores adicionais |
| R11 | Disputas sobre o valor da comissão | 2 | 4 | Razão auditável, relatórios por pedido/documento, extrato aprovado antes de faturar |
| R12 | Picos ao almoço/jantar | 3 | 3 | Ementa em cache, API sem estado, filas por estabelecimento |
| R13 | Restrições de rede deste ambiente de desenvolvimento (npm bloqueado) | — | 2 | Instalar e testar localmente; documentado no README |
