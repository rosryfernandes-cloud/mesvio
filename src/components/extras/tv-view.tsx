"use client";

import { useEffect, useState } from "react";
import { formatEur } from "@/lib/money";

export type TvSlide =
  | { kind: "daily"; title: string; includes: string; extras: string; sections: { title: string; items: { name: string; half: number | null; price: number | null }[] }[] }
  | { kind: "category"; title: string; page: string | null; items: { name: string; description: string | null; price: number }[] };

const SECONDS = 12;

/** Ecrã de TV: um slide de cada vez, em letra grande; atualiza a ementa sozinho de 10 em 10 minutos. */
export function TvView({ name, logoUrl, brand, slides }: { name: string; logoUrl: string | null; brand: string; slides: TvSlide[] }) {
  const [i, setI] = useState(0);
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const next = setInterval(() => setI((x) => (slides.length ? (x + 1) % slides.length : 0)), SECONDS * 1000);
    const tick = setInterval(() => setClock(new Date()), 30_000);
    // Preços, esgotados e menu do dia mudam no painel: recarrega para os mostrar.
    const reload = setTimeout(() => window.location.reload(), 10 * 60_000);
    return () => {
      clearInterval(next);
      clearInterval(tick);
      clearTimeout(reload);
    };
  }, [slides.length]);

  const s = slides[i];
  const eur = (c: number | null) => (c === null ? "" : formatEur(c));

  return (
    <main className="flex h-dvh flex-col overflow-hidden text-white" style={{ background: `linear-gradient(160deg, ${brand}, #0b0f0e 85%)` }}>
      <header className="flex items-center justify-between px-[4vw] pt-[3vh]">
        <div className="flex items-center gap-[1.5vw]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logoUrl && <img src={logoUrl} alt="" className="h-[8vh] w-auto rounded-xl bg-white object-contain p-2" />}
          <p className="text-[3.2vh] font-semibold tracking-[0.2em] uppercase opacity-90">{name}</p>
        </div>
        <p className="text-[4vh] font-extrabold tabular-nums">{clock.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}</p>
      </header>

      {!s ? (
        <p className="m-auto text-[4vh] opacity-80">A ementa ainda está vazia.</p>
      ) : s.kind === "daily" ? (
        <section className="flex flex-1 flex-col px-[4vw] py-[3vh]">
          <h1 className="text-[8vh] leading-none font-extrabold">{s.title}</h1>
          {s.includes && <p className="mt-[1.5vh] text-[3vh] opacity-90">Inclui: {s.includes}</p>}
          <div className="mt-[3vh] grid flex-1 grid-cols-2 gap-x-[4vw] gap-y-[2vh] content-start">
            {s.sections.map((sec) => (
              <div key={sec.title}>
                <p className="mb-[1vh] text-[2.6vh] font-bold tracking-wide uppercase opacity-70">{sec.title}</p>
                {sec.items.map((it) => (
                  <p key={it.name} className="flex items-baseline justify-between gap-4 border-b border-white/15 py-[0.8vh] text-[3.3vh]">
                    <span>{it.name}</span>
                    <span className="font-bold whitespace-nowrap tabular-nums">
                      {it.half !== null && <span className="mr-3 font-normal opacity-80">½ {eur(it.half)}</span>}
                      {eur(it.price)}
                    </span>
                  </p>
                ))}
              </div>
            ))}
          </div>
          {s.extras && <p className="mt-[2vh] text-[2.6vh] opacity-80">{s.extras}</p>}
        </section>
      ) : (
        <section className="flex flex-1 flex-col px-[4vw] py-[3vh]">
          <h1 className="text-[8vh] leading-none font-extrabold">
            {s.title} {s.page && <span className="text-[3vh] font-normal opacity-60">{s.page}</span>}
          </h1>
          <div className="mt-[3vh] grid flex-1 grid-cols-1 gap-x-[4vw] content-start md:grid-cols-2">
            {s.items.map((it) => (
              <div key={it.name} className="border-b border-white/15 py-[1.2vh]">
                <p className="flex items-baseline justify-between gap-4 text-[3.6vh]">
                  <span className="font-semibold">{it.name}</span>
                  <span className="font-bold whitespace-nowrap tabular-nums">{eur(it.price)}</span>
                </p>
                {it.description && <p className="line-clamp-1 text-[2.3vh] opacity-70">{it.description}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      <footer className="flex items-center justify-between px-[4vw] pb-[2.5vh] text-[2vh] opacity-70">
        <span>Leia o QR na sua mesa para ver a ementa no telemóvel</span>
        <span className="flex gap-1.5" aria-hidden="true">
          {slides.map((_, k) => (
            <span key={k} className={`h-[1vh] rounded-full transition-all ${k === i ? "w-[3vw] bg-white" : "w-[1vh] bg-white/40"}`} />
          ))}
        </span>
      </footer>
    </main>
  );
}
