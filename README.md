# MESVIO — pedidos digitais por NFC e QR Code

Plataforma SaaS B2B de pedidos à mesa para restaurantes em Portugal, com integração ao POS (ZoneSoft ZS Rest, via adaptador abstrato) e modelo de comissão de 1% sobre o valor faturado.

**Estado:** Fase 3 em curso — o cliente lê o QR/NFC, escolhe na ementa e envia o pedido; o pedido fica gravado em Postgres e uma fila entrega-o ao POS (MockPOS), com reenvios e rate limit.

## Arrancar

Requisitos: Node.js ≥ 20.9. Não é preciso instalar Postgres: sem `DATABASE_URL`, a app usa PGlite em `.data/pglite` (apague a pasta para recomeçar).

```bash
npm install
npm run check      # typecheck + testes + build de produção
npm run dev        # http://localhost:3000
npm run demo:urls  # URLs das 10 mesas de demonstração
```

Abra `http://localhost:3000` (página comercial da MESVIO) ou `http://localhost:3000/demo` para escolher uma mesa de demonstração, ou vá diretamente a um URL de mesa (ex.: `/m/jG6WQHgwr4fQ5qQEOKtZJw`).

### Painel central (equipa MESVIO)
`/central`: todos os restaurantes, pedidos e comissões do mês (estimativa sobre o valor sem IVA dos pedidos confirmados), alertas (pedidos que não chegaram ao POS, POS com falhas ou por configurar, restaurantes sem dono ou sem mesas) e **Novo restaurante** (empresa, espaço, POS, comissão, mesas e espreguiçadeiras com QR Code, e convite ao dono). Cada restaurante tem a sua ficha, com mais lugares, outros donos e a folha de QR Codes para imprimir.
- **Acesso:** só administradores da plataforma (`platform_admins`), com **2FA obrigatório** (TOTP: Google Authenticator, 1Password…), configurado com um código de ativação de uso único dado pelo script (fora do email). Segredos cifrados com `PLATFORM_SECRET_KEY`; cada código só serve uma vez; 5 tentativas a cada 5 min; sessão verificada de 8 h. Quem não é administrador vê "não encontrado".
- **Criar/repor administradores:** `npm run admin:criar`, `admin:repor-2fa`, `admin:remover` (ver docs/14-PUBLICAR.md). Em desenvolvimento entra-se como "Paula (plataforma, demo)".

### Línguas da ementa
O cliente vê a ementa, o pedido e a conta em português ou inglês: telemóveis em português abrem em português, todos os outros em inglês, e há um seletor na ementa (a escolha fica num cookie). Botões, avisos, alergénios e etiquetas estão em `src/lib/i18n/`; pratos e categorias vêm da tabela `menu_translations` (por restaurante, com RLS). A demo tem inglês completo. O POS e o painel continuam em português.

### Publicar
Passo a passo (domínio, Supabase, GitHub, Vercel) em [docs/14-PUBLICAR.md](docs/14-PUBLICAR.md).

### Marca
Identidade, cores, logótipos e regras de uso em [docs/13-MARCA.md](docs/13-MARCA.md). Os nomes internos (pasta `restaurante-saas`, tabelas, chaves de armazenamento `mesa-digital:*`) mantêm-se para não quebrar dados existentes.

### Painel do restaurante
`/painel` (ou o link em `/demo`). Com a Supabase configurada, entra-se com um código de 6 dígitos enviado por email (só pessoas convidadas). Sem Supabase (desenvolvimento), escolhe-se um utilizador de demonstração: Ana (dona), Bruno (gerente) ou Carla (staff).
- **Perfis:** staff trata pedidos e esgotados; gerente também muda definições e gere a staff; dono gere tudo, incluindo gerentes e outros donos.
- **Equipa:** convidar por email, mudar perfil, remover (há sempre pelo menos um dono).
- **Pedidos** atualizados a cada 3 s, com alerta (faixa vermelha, som opcional, contador no título) para pedidos que precisam de atenção ou de aprovação.
- **Aprovar cada pedido antes de seguir para a cozinha** (opcional): os pedidos ficam à espera até o staff aprovar ou recusar.
- **Precisa de atenção** (o POS não recebeu): tentar de novo, "já lancei no POS" ou cancelar.
- **Fotos** (dono/gerente): uma a uma, **em massa** (escolher ou arrastar uma pasta; cada foto é associada ao prato pelo nome do ficheiro ou pela referência do POS, com confirmação antes de guardar) ou em **sessão de fotos** no telemóvel (a câmara abre prato a prato); reduzida no telemóvel (≤ 1200 px, sem metadados/GPS), guardada na BD (`menu_images`, RLS) e servida com cache permanente em `/api/imagens/<id>`. Tem prioridade sobre a foto do POS.
- **Aparência** (dono/gerente): cor principal e logótipo (URL https) do restaurante na ementa, no estado do pedido e na conta, com pré-visualização. Só aceita cores com contraste WCAG AA; a MESVIO fica só no rodapé.
- **Inglês** (dono/gerente): nomes e descrições da ementa em inglês, com contagem do que falta. O que não estiver traduzido aparece em português.
- **Esgotados**: tira artigos da ementa do cliente na hora (não consegue repor o que o POS dá como esgotado).
- **QR Codes** (dono/gerente, `/painel/qr`): imprimir e gerar um QR novo se um for fotografado e usado de fora (o antigo deixa logo de funcionar).
- **Mesas**: mesas livres e ocupadas, com a conta de cada uma; **Fechar mesa** quando os clientes pagam (avisa se houver pedidos por resolver). A mesa fica limpa para os clientes seguintes; uma conta esquecida fecha sozinha 6 h após o último pedido.

### Espreguiçadeiras (pagar ao pedir)
Cada lugar tem um modo: as **mesas** pagam a conta no fim; as **espreguiçadeiras** (zona "Praia" na demo) pagam cada pedido ao pedir. O botão do carrinho passa a "Pagar e pedir"; o pedido fica "por pagar" e só segue para a cozinha quando o pagamento é confirmado. Sem pagamento em 15 min, é cancelado. No painel, as mesas aparecem agrupadas por zona e os pedidos por pagar num grupo à parte.

### Conta da mesa (cliente)
`/m/[token]/conta` (botão "Conta da mesa" no topo da ementa): todos os pedidos da mesa desde que abriu, de todos os telemóveis, com o total. Com pagamentos ligados no painel (separador Mesas), o cliente paga o que falta com Apple Pay, MB WAY ou cartão; a mesa aparece "Paga" no painel. Sem chaves Stripe (desenvolvimento), o pagamento é **simulado**.

### Testar com o telemóvel
1. `npm run dev -- -H 0.0.0.0` (telemóvel e computador na mesma rede Wi-Fi).
2. No computador, abra `http://<IP-do-computador>:3000/qr` — os QR Codes passam a apontar para esse endereço.
3. Leia um QR com a câmara, peça, e veja o estado do pedido.

Para NFC: grave o URL da mesa (mostrado por baixo de cada QR) numa etiqueta NTAG213/215 como registo URI (ex.: app NFC Tools).

### Fluxo do pedido
`/m/[token]` (ementa + carrinho guardado no telemóvel) → `POST /api/orders` (cabeçalho `Idempotency-Key`; rate limit; o servidor recalcula preços e grava pedido + tarefa na mesma transação) → fila `outbox` (envio ao POS, até 8 tentativas em ~3 min) → `/m/[token]/pedido/[id]` (estado; "Confirmado" só com aceitação do POS).

## Estrutura

```
docs/                     PRD, arquitetura, BD, integração POS, riscos, plano, decisões, deployment
src/app/                  Next.js App Router
  page.tsx                Índice de demonstração (10 mesas)
  m/[token]/              Ementa do cliente + carrinho (token seguro da mesa)
  m/[token]/pedido/[id]/  Estado do pedido
  api/orders/             Criar pedido (POST) e consultar estado (GET)
  api/cron/outbox/        Processar a fila a partir de um cron (alojamento serverless)
  qr/                     Folha imprimível de QR Codes / URLs NFC
  painel/                 Painel do staff (entrada por email/código) + api/painel/*
  api/health/             Health check
src/components/menu/      Componentes da ementa
src/components/order/     Carrinho, detalhe de produto, estado do pedido
src/components/staff/     Painel do staff
src/lib/                  Utilitários (dinheiro, IVA, preço de variantes/extras)
src/server/               Domínio (só servidor)
  db/                     Schema Drizzle (multi-tenant) e cliente
  pos/                    PosAdapter, MockPOS, esqueleto ZoneSoft
  menu/                   Serviço de ementa por mesa
  orders/                 Criação de pedidos, idempotência, fila de envio ao POS (outbox)
  security/               Rate limit e pseudonimização de IP
  auth/                   Supabase Auth, modo dev, convites
  staff/                  Contexto e permissões do painel, ações do staff, equipa
  db/tenant.ts            withTenant: cada pedido corre com RLS no restaurante certo
  catalog/                Esgotados do painel aplicados ao catálogo do POS
  tables/                 Tokens de mesa
  commissions/            Motor de comissões
scripts/                  Utilitários de desenvolvimento
```

## Documentação
1. [PRD](docs/01-PRD.md)
2. [Arquitetura](docs/02-ARQUITETURA.md)
3. [Base de dados](docs/03-BASE-DE-DADOS.md)
4. [Integração POS](docs/04-INTEGRACAO-POS.md)
5. [Riscos](docs/05-RISCOS.md)
6. [Plano de execução](docs/06-PLANO-EXECUCAO.md)
7. [Decisões técnicas](docs/07-DECISOES-TECNICAS.md)
8. [Deployment e variáveis de ambiente](docs/08-DEPLOYMENT.md)
9. [Email ao fabricante do POS (pedido de acesso à API)](docs/09-EMAIL-FABRICANTE-POS.md)

## Regras do projeto
- Nunca inventar endpoints ou capacidades da API ZoneSoft.
- Preços sempre validados no servidor; dinheiro em cêntimos.
- Nenhum pedido é apresentado como aceite sem confirmação real do POS ou aceitação manual autorizada.
- Nenhuma funcionalidade é dada como concluída sem testes.
