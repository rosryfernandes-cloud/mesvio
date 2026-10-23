// Teste de carga "sábado de agosto" para a MESVIO.
//
// Pré-requisitos (ver docs/12-TESTE-DE-CARGA.md):
//   1. node scripts/bench/postgres.mjs                       (Postgres 17 local)
//   2. migrações + `next build` + `next start` com DATABASE_URL local e MESA_LOCAL_BENCH=1
//   3. node scripts/bench/carga-agosto.mjs [--base=http://localhost:3100] [--modo=novo|antigo] [--escala=1]
//
// Simula clientes reais: abrem a ementa, pedem 1–3 artigos, pagam (espreguiçadeiras), acompanham o
// estado como o telemóvel faz, alguns abrem a conta; 3 tablets do staff em polling. No fim verifica
// na base de dados que nenhum pedido se perdeu nem ficou preso.
import postgres from "postgres";
import { randomBytes, randomUUID } from "node:crypto";

const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1] ?? d;
const BASE = arg("base", "http://localhost:3100");
const MODO = arg("modo", "novo"); // "antigo" reproduz o polling de antes da correção
const ESCALA = Number(arg("escala", "1")); // multiplica a duração das fases (0.5 = metade)
const DB_URL = arg("db", "postgres://postgres:postgres@localhost:54329/mesa");
const MESAS = 40;
const ESPREGUICADEIRAS = 80;
const FASES = [
  { nome: "Pico (500 pedidos/h)", pedidosHora: 500, minutos: 4 },
  { nome: "Stress 3× (1500/h)", pedidosHora: 1500, minutos: 4 },
  { nome: "Extremo 6× (3000/h)", pedidosHora: 3000, minutos: 3 },
].map((f) => ({ ...f, minutos: f.minutos * ESCALA }));

const PRODUTOS = [
  { productRef: "D361" },
  { productRef: "D343" },
  { productRef: "F152" },
  { productRef: "F134" },
  { productRef: "F211" },
  { productRef: "X524", modifierRefs: ["GRP-MOJITO-1"] },
  { productRef: "F162", modifierRefs: ["GRP-BATATA-2"] },
  { productRef: "D308", modifierRefs: ["GRP-COCA-2"] },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const between = (a, b) => a + Math.random() * (b - a);

// ─── Métricas ────────────────────────────────────────────────
let faseAtual = "preparação";
const amostras = []; // { fase, rota, ms, status }
async function req(rota, url, init = {}) {
  const t0 = performance.now();
  let status = 0;
  let body = null;
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
    status = res.status;
    const text = await res.text();
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  } catch {
    status = -1; // erro de rede/timeout
  }
  amostras.push({ fase: faseAtual, rota, ms: performance.now() - t0, status });
  return { status, body };
}

// ─── Lugares de teste ────────────────────────────────────────
async function prepararLugares(sql) {
  const [est] = await sql`select id, organization_id from establishments where slug = 'swarabeach' limit 1`;
  if (!est) throw new Error("Sem dados de demonstração: arranque o servidor com SEED_DEMO=1 primeiro.");
  const existentes = await sql`select label, public_token, ordering_mode from dining_tables where label like 'Carga %'`;
  if (existentes.length < MESAS + ESPREGUICADEIRAS) {
    const novos = [];
    for (let i = 1; i <= MESAS; i++)
      novos.push({ label: `Carga Mesa ${i}`, ref: String(((i - 1) % 10) + 1), zone: "Esplanada", mode: "pay_later" });
    for (let i = 1; i <= ESPREGUICADEIRAS; i++)
      novos.push({ label: `Carga Espreguiçadeira ${i}`, ref: `E${((i - 1) % 6) + 1}`, zone: "Praia", mode: "pay_first" });
    for (const n of novos) {
      if (existentes.some((e) => e.label === n.label)) continue;
      await sql`insert into dining_tables (organization_id, establishment_id, label, pos_table_ref, public_token, zone, ordering_mode)
        values (${est.organization_id}, ${est.id}, ${n.label}, ${n.ref}, ${randomBytes(16).toString("base64url")}, ${n.zone}, ${n.mode})`;
    }
  }
  // Pagamentos ligados (mesas) e sem aprovação manual, como num dia normal.
  await sql`update establishments set payments_enabled = true, manual_acceptance = false where id = ${est.id}`;
  return sql`select label, public_token as token, ordering_mode as mode from dining_tables where label like 'Carga %'`;
}

// ─── Staff ───────────────────────────────────────────────────
async function entrarStaff() {
  const r = await fetch(`${BASE}/api/painel/auth/dev`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ userId: "00000000-0000-4000-8000-0000000002a3" }), // Carla (staff demo)
  });
  const cookie = r.headers.get("set-cookie")?.split(";")[0];
  if (!r.ok || !cookie) throw new Error(`Entrada do staff falhou (${r.status}); o servidor tem MESA_LOCAL_BENCH=1?`);
  return cookie;
}

function tablet(cookie, mesas, ativo) {
  return (async () => {
    let n = 0;
    while (ativo.value) {
      await req("painel: pedidos", `${BASE}/api/painel/pedidos`, { headers: { cookie } });
      if (mesas && n++ % 2 === 1) await req("painel: mesas", `${BASE}/api/painel/mesas`, { headers: { cookie } });
      await sleep(mesas ? 2_500 : 3_000);
    }
  })();
}

// ─── Cliente ─────────────────────────────────────────────────
const PENDENTES = new Set(["AWAITING_PAYMENT", "RECEIVED", "SUBMITTING", "FAILED_RETRYING", "SUBMITTED"]);
const resultados = { pedidosOk: 0, pedidosFalhados: 0, pagosOk: 0, ids: [] };

async function cliente(lugar) {
  const ip = `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
  const h = { "x-forwarded-for": ip };
  await req("ementa (página)", `${BASE}/m/${lugar.token}`, { headers: h });
  await sleep(between(2_000, 6_000)); // escolher
  await req("ementa (página)", `${BASE}/m/${lugar.token}`, { headers: h }); // volta à ementa / outro separador

  const linhas = Array.from({ length: 1 + Math.floor(Math.random() * 3) }, () => ({ ...pick(PRODUTOS), quantity: 1 + Math.floor(Math.random() * 2) }));
  const r = await req("criar pedido", `${BASE}/api/orders`, {
    method: "POST",
    headers: { ...h, "Content-Type": "application/json", "Idempotency-Key": randomUUID() },
    body: JSON.stringify({ tableToken: lugar.token, lines: linhas }),
  });
  if (r.status !== 201) {
    resultados.pedidosFalhados++;
    return;
  }
  resultados.pedidosOk++;
  const order = r.body.order;
  resultados.ids.push(order.id);
  await req("estado do pedido (página)", `${BASE}/m/${lugar.token}/pedido/${order.id}`, { headers: h });

  if (order.status === "AWAITING_PAYMENT") {
    const p = await req("iniciar pagamento", `${BASE}/api/mesa/${lugar.token}/pedidos/${order.id}/pagamento`, { method: "POST", headers: h });
    if (p.status === 200) {
      await sleep(between(3_000, 15_000)); // aprovar no MB WAY / Apple Pay
      const ok = await req("confirmar pagamento", `${BASE}/api/pagamentos/simulado/${p.body.paymentId}`, {
        method: "POST",
        headers: { ...h, "Content-Type": "application/json" },
        body: JSON.stringify({ token: lugar.token, method: "mb_way", approved: true }),
      });
      if (ok.status === 200 && ok.body?.status === "SUCCEEDED") resultados.pagosOk++;
    }
  }

  // Acompanhar o estado como o telemóvel faz.
  const inicio = Date.now();
  const visivelMs = between(60_000, 180_000); // página à vista, depois ecrã bloqueado
  let estado = order.status;
  while (Date.now() - inicio < visivelMs) {
    if (MODO === "novo" && !PENDENTES.has(estado)) break; // a correção: pára quando já não muda
    const passou = Date.now() - inicio;
    await sleep(MODO === "antigo" ? 3_000 : passou < 60_000 ? 3_000 : 10_000);
    const s = await req("estado do pedido (API)", `${BASE}/api/orders/${order.id}?mesa=${lugar.token}`, { headers: h });
    if (s.status === 200) estado = s.body.order.status;
  }

  // Um terço abre a conta e deixa-a aberta um bocado.
  if (Math.random() < 0.33) {
    await req("conta (página)", `${BASE}/m/${lugar.token}/conta`, { headers: h });
    const ate = Date.now() + between(30_000, 90_000);
    while (Date.now() < ate) {
      await sleep(10_000);
      await req("conta (API)", `${BASE}/api/mesa/${lugar.token}/conta`, { headers: h });
    }
  }
}

// ─── Execução ────────────────────────────────────────────────
function percentil(xs, p) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

function resumo(fase) {
  const xs = amostras.filter((a) => a.fase === fase.nome);
  const segundos = fase.minutos * 60;
  const porRota = new Map();
  for (const a of xs) (porRota.get(a.rota) ?? porRota.set(a.rota, []).get(a.rota)).push(a);
  const linhas = [...porRota.entries()].map(([rota, as]) => {
    const ms = as.map((a) => a.ms);
    return {
      rota,
      pedidos: as.length,
      "por seg": +(as.length / segundos).toFixed(1),
      p50: Math.round(percentil(ms, 50)),
      p95: Math.round(percentil(ms, 95)),
      p99: Math.round(percentil(ms, 99)),
      erros: as.filter((a) => a.status >= 500 || a.status === -1).length,
      "429": as.filter((a) => a.status === 429).length,
    };
  });
  return { total: xs.length, rps: +(xs.length / segundos).toFixed(1), linhas };
}

const sql = postgres(DB_URL, { max: 2 });
const lugares = await prepararLugares(sql);
const cookie = await entrarStaff();
const inicioTeste = new Date();
console.log(`Modo de polling: ${MODO} · ${lugares.length} lugares · servidor ${BASE}\n`);

const ativo = { value: true };
const tablets = [tablet(cookie, false, ativo), tablet(cookie, false, ativo), tablet(cookie, true, ativo)];
const clientes = [];
for (const fase of FASES) {
  faseAtual = fase.nome;
  const fim = Date.now() + fase.minutos * 60_000;
  const mediaEntreChegadasMs = 3_600_000 / fase.pedidosHora;
  console.log(`▶ ${fase.nome} durante ${fase.minutos} min…`);
  while (Date.now() < fim) {
    clientes.push(cliente(pick(lugares)).catch(() => resultados.pedidosFalhados++));
    await sleep(-Math.log(1 - Math.random()) * mediaEntreChegadasMs); // chegadas de Poisson
  }
}
faseAtual = "fim (a terminar clientes)";
await Promise.all(clientes);
ativo.value = false;
await Promise.all(tablets);
await sleep(8_000); // deixar o worker esvaziar a fila

for (const fase of FASES) {
  const r = resumo(fase);
  console.log(`\n=== ${fase.nome}: ${r.total} pedidos HTTP (${r.rps}/s) ===`);
  console.table(r.linhas);
}

// Verificação na base de dados: nada perdido, nada preso, nada duplicado.
const ids = resultados.ids;
const estados = ids.length ? await sql`select status, count(*)::int n from orders where id = any(${ids}) group by status order by status` : [];
const [{ emBD }] = await sql`select count(*)::int "emBD" from orders o join dining_tables t on t.id = o.table_id where t.label like 'Carga %' and o.created_at >= ${inicioTeste}`;
const [{ filaPresa }] = await sql`select count(*)::int "filaPresa" from outbox where status <> 'DONE' and created_at >= ${inicioTeste}`;
const [{ duplicados }] = await sql`select count(*)::int duplicados from (select payload->>'orderId' from outbox where created_at >= ${inicioTeste} group by 1 having count(*) > 1) d`;
const [{ pagPend }] = await sql`select count(*)::int "pagPend" from payments where status = 'PENDING' and created_at >= ${inicioTeste}`;
console.log("\n=== Integridade ===");
console.table({
  "pedidos aceites pela API (201)": resultados.pedidosOk,
  "pedidos recusados/falhados": resultados.pedidosFalhados,
  "pedidos na base de dados": emBD,
  "pagamentos confirmados": resultados.pagosOk,
  "tarefas da fila por terminar": filaPresa,
  "pedidos com tarefa duplicada": duplicados,
  "pagamentos ainda pendentes": pagPend,
});
console.table(Object.fromEntries(estados.map((e) => [e.status, e.n])));
await sql.end();
