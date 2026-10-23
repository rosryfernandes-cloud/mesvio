import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { DemoRequestForm } from "@/components/landing/demo-request-form";
import {
  IconArrow,
  IconCheck,
  IconClock,
  IconGrid,
  IconMenu,
  IconNoApp,
  IconPlug,
  IconPulse,
  IconScan,
  IconSend,
  IconSmile,
  IconTray,
} from "@/components/brand/icons";

export const metadata: Metadata = {
  title: { absolute: "MESVIO — O empregado que não sabias que precisavas." },
  alternates: { canonical: "/" },
};

/** Todos os botões "Pedir demonstração" levam ao formulário de contacto no fim da página. */
const DEMO_HREF = "#contacto";

const STEPS = [
  { icon: IconScan, title: "Aproxima ou lê", text: "O cliente aproxima o telemóvel do NFC ou lê o QR Code da mesa." },
  { icon: IconMenu, title: "Escolhe e pede", text: "Consulta a ementa digital e faz o pedido, sem instalar nada." },
  { icon: IconSend, title: "Chega ao sistema", text: "O pedido é enviado para o sistema do restaurante." },
  { icon: IconTray, title: "A equipa entrega", text: "A equipa prepara e entrega, focada no serviço." },
];

const BENEFITS = [
  { icon: IconNoApp, title: "Pedidos sem aplicação", text: "Abre no navegador do telemóvel, em segundos." },
  { icon: IconClock, title: "Menos tempo a recolher pedidos", text: "A equipa deixa de andar de mesa em mesa só para anotar." },
  { icon: IconGrid, title: "Gestão centralizada", text: "Pedidos, mesas, esgotados e equipa num só painel." },
  { icon: IconPlug, title: "Integração com POS compatíveis", text: "Os pedidos seguem para o sistema que o espaço já usa." },
  { icon: IconPulse, title: "Acompanhamento de pedidos", text: "O cliente vê o estado do pedido; a equipa vê tudo em tempo real." },
  { icon: IconSmile, title: "Simples para os clientes", text: "Fotografias, alergénios, extras e conta da mesa, claros e legíveis." },
];

const SOLUTIONS = [
  { title: "Restaurantes", text: "Esplanada e sala, com conta da mesa partilhada." },
  { title: "Bares de praia", text: "Picos de verão sem filas no balcão." },
  { title: "Espreguiçadeiras", text: "Pedir e pagar ao pedir, entregue na cama." },
  { title: "Hotéis", text: "Bar, lounge e serviço nos espaços comuns." },
  { title: "Piscinas", text: "Pedidos sem sair da água por muito tempo." },
  { title: "Outros espaços", text: "Rooftops, clubes, eventos e hotelaria." },
];

export default function LandingPage() {
  return (
    <div className="bg-paper">
      <SiteHeader />
      <main>
        <Hero />
        <HowItWorks />
        <Benefits />
        <Solutions />
        <Pricing />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}

function SiteHeader() {
  return (
    <header className="on-dark sticky top-0 z-20 border-b border-white/10 bg-brand/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="MESVIO — início" className="rounded-md">
          <Logo variant="dark" className="h-6 w-auto" />
        </Link>
        <nav aria-label="Principal" className="flex items-center gap-1 text-sm text-white/80">
          <a href="#como-funciona" className="hidden rounded-lg px-3 py-2 hover:text-white sm:block">
            Como funciona
          </a>
          <a href="#precos" className="hidden rounded-lg px-3 py-2 hover:text-white sm:block">
            Preços
          </a>
          <Link href="/painel/entrar" className="rounded-lg px-3 py-2 hover:text-white">
            Entrar
          </Link>
          <a href={DEMO_HREF} className="ml-1 hidden rounded-full bg-mint px-4 py-2 font-semibold text-brand hover:bg-white sm:block">
            Pedir demonstração
          </a>
        </nav>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="on-dark relative overflow-hidden bg-brand text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 right-[-10%] size-[36rem] rounded-full bg-mint/10 blur-3xl"
      />
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pt-14 pb-20 sm:px-6 md:grid-cols-[1.15fr_1fr] md:pt-24 md:pb-28">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1 text-xs font-medium tracking-wide text-mint uppercase">
            Menos espera. Mais serviço.
          </p>
          <h1 className="mt-6 text-4xl leading-[1.05] font-extrabold tracking-tight text-balance sm:text-5xl lg:text-6xl">
            O empregado que não sabias que precisavas<span className="text-mint">.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/80">
            Transforma a experiência dos teus clientes com pedidos digitais por QR Code e NFC. Menos espera, operações mais
            simples e uma equipa focada no serviço.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <a
              href={DEMO_HREF}
              className="inline-flex min-h-13 items-center justify-center gap-2 rounded-full bg-mint px-7 font-semibold text-brand transition hover:bg-white"
            >
              Solicitar demonstração <IconArrow className="size-5" />
            </a>
            <a
              href="#como-funciona"
              className="inline-flex min-h-13 items-center justify-center rounded-full border border-white/25 px-7 font-semibold text-white transition hover:border-white"
            >
              Como funciona
            </a>
          </div>
        </div>
        <PhonePreview />
      </div>
    </section>
  );
}

/** Ilustração de uma ementa (desenho, não um ecrã real nem dados de um restaurante). */
function PhonePreview() {
  const items = [
    { name: "Bowl de açaí", price: "9,50 €", tag: "Vegetariano" },
    { name: "Hambúrguer da casa", price: "14,00 €", tag: "Mais pedido" },
    { name: "Limonada de hortelã", price: "4,50 €", tag: null },
  ];
  return (
    <div aria-hidden="true" className="mx-auto w-full max-w-[19rem]">
      <div className="rounded-[2.75rem] border border-white/15 bg-forest p-3 shadow-2xl shadow-black/40">
        <div className="overflow-hidden rounded-[2.1rem] bg-paper text-ink">
          <div className="flex items-center justify-between px-5 pt-5">
            <span className="text-xs font-semibold text-brand">Mesa 12 · Esplanada</span>
            <span className="rounded-full border border-line px-2.5 py-0.5 text-[10px] font-medium">Conta da mesa</span>
          </div>
          <p className="px-5 pt-2 text-xl font-extrabold tracking-tight">O teu restaurante</p>
          <div className="mt-3 flex gap-1.5 px-5 text-[11px] font-semibold">
            <span className="rounded-full bg-brand px-3 py-1 text-white">Comida</span>
            <span className="rounded-full bg-card px-3 py-1 text-ink-soft">Bebidas</span>
            <span className="rounded-full bg-card px-3 py-1 text-ink-soft">Bar</span>
          </div>
          <ul className="mt-4 grid gap-2.5 px-4 pb-4">
            {items.map((i) => (
              <li key={i.name} className="flex items-center gap-3 rounded-2xl bg-card p-2.5">
                <span className="size-12 shrink-0 rounded-xl bg-brand-soft" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-bold">{i.name}</span>
                  <span className="text-[11px] text-ink-soft">{i.tag ?? "Sem glúten"}</span>
                </span>
                <span className="text-[13px] font-bold tabular-nums">{i.price}</span>
              </li>
            ))}
          </ul>
          <div className="mx-4 mb-5 flex items-center justify-between rounded-2xl bg-brand px-4 py-3 text-sm font-semibold text-white">
            <span>Ver pedido · 2</span>
            <span className="tabular-nums">23,50 €</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ eyebrow, title, text }: { eyebrow: string; title: string; text?: string }) {
  return (
    <div className="max-w-2xl">
      <p className="text-sm font-semibold tracking-wide text-brand uppercase">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">{title}</h2>
      {text && <p className="mt-4 text-lg leading-relaxed text-ink-soft">{text}</p>}
    </div>
  );
}

function HowItWorks() {
  return (
    <section id="como-funciona" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6 md:py-28">
      <SectionTitle eyebrow="Como funciona" title="Do telemóvel do cliente à cozinha, em quatro passos." />
      <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <li key={s.title} className="rounded-3xl border border-line bg-card p-6">
            <div className="flex items-center justify-between">
              <span className="grid size-11 place-items-center rounded-2xl bg-brand-soft text-brand">
                <s.icon />
              </span>
              <span className="text-sm font-bold text-ink-soft tabular-nums">0{i + 1}</span>
            </div>
            <h3 className="mt-6 text-lg font-bold">{s.title}</h3>
            <p className="mt-2 leading-relaxed text-ink-soft">{s.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Benefits() {
  return (
    <section className="bg-card">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-28">
        <SectionTitle
          eyebrow="Vantagens"
          title="Os teus clientes pedem. A tua equipa entrega. O teu negócio cresce."
          text="Uma camada digital por cima do serviço que já tens: sem trocar de sistema, sem formar clientes."
        />
        <ul className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFITS.map((b) => (
            <li key={b.title} className="flex gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand text-mint">
                <b.icon />
              </span>
              <span>
                <h3 className="font-bold">{b.title}</h3>
                <p className="mt-1 leading-relaxed text-ink-soft">{b.text}</p>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Solutions() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-28">
      <SectionTitle eyebrow="Soluções" title="Feita para quem serve em mesas, balcões e espreguiçadeiras." />
      <ul className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SOLUTIONS.map((s) => (
          <li key={s.title} className="group rounded-3xl border border-line bg-card p-6 transition hover:border-brand">
            <h3 className="flex items-center gap-2 text-lg font-bold">
              <span className="size-2 rounded-full bg-mint ring-4 ring-brand-soft" aria-hidden="true" />
              {s.title}
            </h3>
            <p className="mt-2 leading-relaxed text-ink-soft">{s.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Pricing() {
  return (
    <section id="precos" className="scroll-mt-20 bg-card">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 md:grid-cols-2 md:items-center md:py-28">
        <SectionTitle
          eyebrow="Preços"
          title="Só pagas quando a plataforma trabalha para ti."
          text="Sem mensalidade obrigatória. Uma pequena percentagem dos pedidos que entram pela MESVIO."
        />
        <div className="on-dark rounded-[2rem] bg-brand p-8 text-white sm:p-10">
          <p className="text-sm font-semibold tracking-wide text-mint uppercase">Modelo proposto</p>
          <p className="mt-4 flex items-baseline gap-2">
            <span className="text-7xl font-extrabold tracking-tight">1%</span>
            <span className="text-white/75">por pedido</span>
          </p>
          <p className="mt-3 leading-relaxed text-white/80">
            sobre o valor elegível sem IVA dos pedidos originados na plataforma.
          </p>
          <ul className="mt-8 grid gap-3 text-white/90">
            {["Sem mensalidade obrigatória", "Ementa, pedidos e painel da equipa", "QR Code e NFC para cada lugar"].map((t) => (
              <li key={t} className="flex items-center gap-3">
                <IconCheck className="size-5 shrink-0 text-mint" />
                {t}
              </li>
            ))}
          </ul>
          <p className="mt-8 border-t border-white/15 pt-5 text-sm leading-relaxed text-white/70">
            As condições comerciais dependem do acordo com cada estabelecimento. Integrações POS e pagamentos no telemóvel
            estão em validação: confirmamos na demonstração o que já está disponível para o teu sistema.
          </p>
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section id="contacto" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6 md:py-28">
      <div className="on-dark relative overflow-hidden rounded-[2rem] bg-forest px-6 py-14 text-center text-white sm:px-12">
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 left-1/2 size-96 -translate-x-1/2 rounded-full bg-mint/10 blur-3xl" />
        <div className="relative">
          <h2 className="mx-auto max-w-2xl text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">
            Pronto para transformar o serviço do teu espaço?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-white/80">Deixa o teu contacto e mostramos-te a MESVIO a funcionar no teu espaço.</p>
          <div className="mt-10">
            <DemoRequestForm />
          </div>
        </div>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <Logo className="h-5 w-auto" />
          <p className="mt-2 text-sm text-ink-soft">Menos espera. Mais serviço.</p>
        </div>
        <nav aria-label="Rodapé" className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-soft">
          <a href="#como-funciona" className="hover:text-ink">
            Como funciona
          </a>
          <a href="#precos" className="hover:text-ink">
            Preços
          </a>
          <a href="#contacto" className="hover:text-ink">
            Pedir demonstração
          </a>
          <Link href="/painel/entrar" className="hover:text-ink">
            Entrar no painel
          </Link>
        </nav>
      </div>
    </footer>
  );
}
