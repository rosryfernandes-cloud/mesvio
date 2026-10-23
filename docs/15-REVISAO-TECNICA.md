# Revisão técnica de 24/10/2026 — estado das correções

Revisão feita sobre o código real (sem elogios genéricos). As 10 prioridades e o que já está resolvido.

| # | Prioridade | Estado |
|---|---|---|
| 1 | Stripe Connect real (webhooks, reembolsos) | ❌ por fazer — bloqueia espreguiçadeiras e a cobrança da comissão |
| 2 | Limite por IP bloqueava clientes no mesmo Wi-Fi | ✅ corrigido |
| 3 | Pedido HTTP esperava até 20 s pelo POS | ✅ corrigido |
| 4 | Catálogo só em memória (ementa cai com POS em baixo + instância nova) | ❌ por fazer |
| 5 | ZoneSoft e mapeamento das mesas ao POS | ❌ à espera do fabricante |
| 6 | Validar em staging (Supabase + Vercel reais) | ❌ por fazer |
| 7 | Monitorização e alertas (Sentry, uptime, avisos ao restaurante) | ❌ por fazer |
| 8 | Endurecimento de segurança | ✅ parcial (ver abaixo) |
| 9 | Comissões a sério (motor + faturas) e reembolsos | ❌ por fazer |
| 10 | Rede instável (offline) e operação da equipa | ❌ por fazer |

## 2. Limite por IP (corrigido)
Todos os clientes no Wi-Fi do bar (ou atrás do mesmo operador móvel) têm o mesmo IP. O limite de 10 pedidos/5 min por IP bloqueava o 11.º pedido de *todo o espaço*; nos pagamentos era 20/15 min.
- Pedidos: por IP 120/5 min (só contra ataques em massa); a proteção real é por mesa, 30/15 min (`src/server/security/rate-limit.ts`).
- Pagamentos: por IP 300/15 min + por mesa 20/15 min (`hitPaymentLimits`).
- Teste: 40 pedidos do mesmo IP em 10 mesas passam (`place-order.test.ts`).

## 3. Envio ao POS dentro do pedido (corrigido)
A resposta esperava pela 1.ª tentativa de envio (prazo do POS: 20 s); numa função serverless o cliente podia ver erro com o pedido gravado. Encurtar o prazo do POS NÃO servia (cortar a meio torna o resultado ambíguo → "precisa de atenção").
- `dispatchWithinDeadline` (`src/server/orders/outbox-worker.ts`): a resposta espera no máximo 4 s; o envio continua em fundo até ao fim, mantido vivo com `after()` do Next (`src/server/runtime/keep-alive.ts`); se falhar, o worker reenvia.
- Aplicado aos 4 sítios: criar pedido, aprovar no painel, confirmação de pagamento (conta e pedido). Rotas com `maxDuration = 30`.
- Testes: POS com 400 ms e espera de 50 ms → resposta "Enviado", envio acaba em fundo, 1 só tarefa concluída; POS rápido → "Confirmado" sem trabalho em fundo.

## 8. Segurança (parcial)
Feito:
- **CSP** e **HSTS** (`next.config.ts`): só scripts e ligações do próprio site; imagens https; sem iframes de terceiros, `<object>` ou formulários para fora. HSTS e `upgrade-insecure-requests` só com `NEXT_PUBLIC_APP_URL` em https. Os cabeçalhos fixam-se **no build**: a variável tem de existir na Vercel antes do deploy (confirmado: com `https://…` no build, sai `Strict-Transport-Security: max-age=63072000; includeSubDomains`).
- **2FA com código de ativação** (`src/server/platform/activation.ts`, migração 0014): `admin:criar` e `admin:repor-2fa` geram um código de uso único (48 h, só o hash na BD) a entregar fora do email. Sem ele não se configura o 2FA, por isso roubar o email de um administrador ainda sem 2FA já não chega. No modo de desenvolvimento dispensa-se.
- **Rodar e desativar QR Codes**: o dono/gerente gera um QR novo em `/painel/qr` (o antigo dá 404 de imediato; a conta aberta mantém-se); o painel central também desativa e reativa lugares. Registo na auditoria. Testes em `src/server/tables/table-admin.test.ts`.

Por fazer:
- CSP com nonces (tirar `'unsafe-inline'` dos scripts) — obriga a render dinâmico de todas as páginas.
- Ligação à BD separada para operações de sistema, com um utilizador da BD sem BYPASSRLS para os pedidos dos restaurantes (precisa de um 2.º utilizador na Supabase: fazer no staging, prioridade 6).
- Logótipos alojados pela MESVIO em vez de URL externo (precisa de armazenamento de ficheiros).
