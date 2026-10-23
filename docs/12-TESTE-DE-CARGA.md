# Teste de carga — "sábado de agosto"

Simula o pico de um beach club: **40 mesas** (pagam no fim) + **80 espreguiçadeiras** (pagam ao pedir), **3 tablets** do staff, e clientes que abrem a ementa, pedem 1–3 artigos, pagam (espreguiçadeiras), acompanham o estado como o telemóvel real faz e às vezes abrem a conta.

Fases: **Pico** 500 pedidos/h (4 min) → **Stress 3×** 1500/h (4 min) → **Extremo 6×** 3000/h (3 min). No fim verifica na BD que nenhum pedido se perdeu, ficou preso ou foi duplicado.

## Como correr
```bash
# 1. Postgres 17 local (fica a correr)
node scripts/bench/postgres.mjs

# 2. Migrações e build de produção
DIRECT_DATABASE_URL=postgres://postgres:postgres@localhost:54329/mesa npx drizzle-kit migrate
npm run build

# 3. Servidor como em produção (worker incluído)
DATABASE_URL=postgres://postgres:postgres@localhost:54329/mesa MESA_LOCAL_BENCH=1 SEED_DEMO=1 npx next start -p 3100

# 4. Carga (≈16 min). --modo=antigo reproduz o polling de antes da correção; --escala=0.5 encurta as fases
node scripts/bench/carga-agosto.mjs --modo=novo
```

`MESA_LOCAL_BENCH=1` só tem efeito com `DATABASE_URL` em localhost: permite a entrada de demonstração e o pagamento simulado num build de produção. Contra a Supabase real (staging), correr o mesmo script com `--base=<url de staging>` e `--db=<DIRECT_DATABASE_URL>` e um utilizador de teste.

## Limites deste teste
- Corre tudo numa máquina (servidor, Postgres e gerador de carga a competir pelo mesmo CPU): os tempos são **piores** do que com servidor e BD separados, mas a rede é local (não há latência de internet nem da Supabase).
- POS e pagamentos são simulados (MockPOS, fornecedor simulado): não mede a ZoneSoft nem a Stripe.
- Não mede a rede móvel na praia, que continua a ser o maior risco real (ver resposta em docs/05-RISCOS.md, R9).

## Resultados (2026-10-23, MacBook local, build de produção + Postgres 17)

**Modo novo** (polling com backoff e pausa) — fases completas (11 min):

| Fase | Pedidos HTTP/s | p95 pior rota | p99 pior rota | Erros | 429 |
|---|---|---|---|---|---|
| Pico 500/h | 2,6 | 34 ms | 149 ms | 0 | 0 |
| Stress 1500/h | 4,2 | 33 ms | 102 ms | 0 | 0 |
| Extremo 3000/h | 7,8 | 42 ms | 83 ms | 0 | 0 |

Integridade: 287 pedidos aceites = 287 na BD, todos ACCEPTED; 178 pagamentos confirmados; 0 tarefas por terminar, 0 duplicadas, 0 pagamentos pendentes.

**Modo antigo** (cada telemóvel pergunta a cada 3 s para sempre) — fases a metade (`--escala=0.5`, 5,5 min):

| Fase | Pedidos HTTP/s | p95 pior rota | p99 pior rota | Erros | 429 |
|---|---|---|---|---|---|
| Pico 500/h | 3,0 | 53 ms | 95 ms | 0 | 0 |
| Stress 1500/h | 11,7 | 48 ms | 58 ms | 0 | 0 |
| Extremo 3000/h | 24,3 | **3 054 ms** | **5 168 ms** | 0 | 0 |

Integridade: 133 = 133, sem perdas nem duplicados.

**Leitura:**
- Perguntas de estado do pedido: **2 799 em 5,5 min** no modo antigo contra **167 em 11 min** no novo (≈ 33× menos por minuto). No antigo crescem sem parar, porque cada cliente que já recebeu o pedido continua a perguntar.
- No extremo, o modo antigo faz 3× mais pedidos/s e o servidor engasga: **criar pedido** chega a 3–5 s e a ementa a 1,4 s. No novo fica tudo abaixo de 50 ms (p95).
- O modo antigo correu metade do tempo; com fases completas acumularia o dobro dos telemóveis a perguntar, portanto a diferença real é maior.
- Em nenhum dos modos se perdeu, duplicou ou prendeu um pedido: a fila e as transações aguentam; o que cai com o polling antigo é a velocidade.
