import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadPublicMenu } from "@/server/extras/public-menu";
import { formatEur } from "@/lib/money";
import { PoweredBy } from "@/components/brand/logo";

export const dynamic = "force-dynamic";

const DAYS: [string, string][] = [
  ["mon", "Segunda"],
  ["tue", "Terça"],
  ["wed", "Quarta"],
  ["thu", "Quinta"],
  ["fri", "Sexta"],
  ["sat", "Sábado"],
  ["sun", "Domingo"],
];

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const data = await loadPublicMenu("site", token);
  if (!data) return { title: "Restaurante", robots: { index: false } };
  const { name, address } = data.menu.establishment;
  return { title: name, description: `Ementa, menu do dia, horário e morada do ${name}${address ? `, ${address}` : ""}.` };
}

/** Site do restaurante (extra): uma página com a ementa, o menu do dia, o horário e a morada. */
export default async function RestaurantSite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await loadPublicMenu("site", token);
  if (!data) notFound();
  const { menu, branding, openingHours } = data;
  const { name, address } = menu.establishment;
  const style = branding?.palette ? ({ "--color-brand": branding.palette.brand, "--color-brand-soft": branding.palette.brandSoft } as CSSProperties) : undefined;
  const maps = address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name}, ${address}`)}` : null;
  const daily = menu.dailyMenu;

  return (
    <div style={style} className="min-h-dvh bg-paper">
      <header className="bg-brand px-4 pt-10 pb-12 text-white">
        <div className="mx-auto max-w-3xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {branding?.logoUrl && <img src={branding.logoUrl} alt="" className="mb-4 h-20 w-auto rounded-2xl bg-white object-contain p-2" />}
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">{name}</h1>
          {address && <p className="mt-2 text-lg opacity-90">{address}</p>}
          <div className="mt-6 flex flex-wrap gap-2">
            <a href="#ementa" className="inline-flex min-h-11 items-center rounded-full bg-white px-5 font-semibold text-brand">
              Ver a ementa
            </a>
            {maps && (
              <a href={maps} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-full border border-white/70 px-5 font-semibold">
                Como chegar
              </a>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-3xl gap-10 px-4 py-10">
        {daily && (
          <section aria-labelledby="dia" className="rounded-3xl border-2 border-brand bg-card p-5">
            <h2 id="dia" className="text-2xl font-extrabold">
              Menu do dia
            </h2>
            {daily.includes && <p className="mt-1 text-ink-soft">Inclui: {daily.includes}</p>}
            <div className="mt-4 grid gap-4">
              {daily.sections.map((s) => (
                <div key={s.title}>
                  <h3 className="mb-1 text-sm font-bold tracking-wide uppercase">{s.title}</h3>
                  <ul className="grid gap-1">
                    {s.items.map((it) => (
                      <li key={it.name} className="flex items-baseline justify-between gap-3">
                        <span>{it.name}</span>
                        <span className="font-semibold whitespace-nowrap tabular-nums">
                          {it.halfPriceCents !== null && <span className="mr-2 font-normal text-ink-soft">½ {formatEur(it.halfPriceCents)}</span>}
                          {it.priceCents !== null && formatEur(it.priceCents)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            {(daily.extras || daily.note) && <p className="mt-3 text-sm text-ink-soft">{[daily.extras, daily.note].filter(Boolean).join(" · ")}</p>}
          </section>
        )}

        <section id="ementa" aria-labelledby="ementa-h" className="scroll-mt-4">
          <h2 id="ementa-h" className="text-3xl font-extrabold tracking-tight">
            Ementa
          </h2>
          <div className="mt-4 grid gap-8">
            {menu.categories.map((c) => (
              <div key={c.ref}>
                <h3 className="border-b border-line pb-1 text-lg font-bold">{c.name}</h3>
                <ul className="mt-2 grid gap-3">
                  {c.products.map((p) => (
                    <li key={p.ref} className={`flex gap-3 ${p.available ? "" : "opacity-50"}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {p.imageUrl && <img src={p.imageUrl} alt="" loading="lazy" className="size-16 shrink-0 rounded-xl object-cover" />}
                      <div className="min-w-0 flex-1">
                        <p className="flex items-baseline justify-between gap-3">
                          <span className="font-semibold">{p.name}</span>
                          <span className="font-semibold whitespace-nowrap tabular-nums">{formatEur(p.priceCents)}</span>
                        </p>
                        {p.description && <p className="text-sm text-ink-soft">{p.description}</p>}
                        {!p.available && <p className="text-xs">Esgotado hoje</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {openingHours && Object.keys(openingHours).length > 0 && (
          <section aria-labelledby="horario">
            <h2 id="horario" className="text-2xl font-extrabold">
              Horário
            </h2>
            <ul className="mt-2 grid gap-1">
              {DAYS.map(([k, label]) => (
                <li key={k} className="flex justify-between border-b border-line/60 py-1">
                  <span>{label}</span>
                  <span className="tabular-nums">{openingHours[k]?.length ? openingHours[k].map(([a, b]) => `${a}–${b}`).join(", ") : "Fechado"}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {address && (
          <section aria-labelledby="onde">
            <h2 id="onde" className="text-2xl font-extrabold">
              Onde estamos
            </h2>
            <p className="mt-1">{address}</p>
            {maps && (
              <a href={maps} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-11 items-center rounded-full bg-brand px-5 font-semibold text-white">
                Abrir no mapa
              </a>
            )}
          </section>
        )}
      </main>

      <footer className="px-4 pb-10 text-center text-xs text-ink-soft">
        Preços com IVA incluído. Informe-se sobre alergénios junto da equipa.
        <span className="mt-4 flex justify-center gap-4">
          <PoweredBy label="Feito com" />
          <Link href="/privacidade" className="underline">
            Privacidade
          </Link>
        </span>
      </footer>
    </div>
  );
}
