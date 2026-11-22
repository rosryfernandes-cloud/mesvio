import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadPublicMenu } from "@/server/extras/public-menu";
import { TvView, type TvSlide } from "@/components/extras/tv-view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ementa", robots: { index: false, follow: false } };

const PER_SLIDE = 9;

/** Ementa na TV (extra): menu do dia e ementa a passar sozinhos, para a TV do restaurante. */
export default async function TvPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await loadPublicMenu("tv", token);
  if (!data) notFound();
  const { menu, branding } = data;
  const slides: TvSlide[] = [];
  if (menu.dailyMenu) {
    slides.push({
      kind: "daily",
      title: "Menu do dia",
      includes: menu.dailyMenu.includes,
      extras: [menu.dailyMenu.extras, menu.dailyMenu.note].filter(Boolean).join(" · "),
      sections: menu.dailyMenu.sections.map((s) => ({ title: s.title, items: s.items.map((i) => ({ name: i.name, half: i.halfPriceCents, price: i.priceCents })) })),
    });
  }
  for (const c of menu.categories) {
    const items = c.products.filter((p) => p.available).map((p) => ({ name: p.name, description: p.description ?? null, price: p.priceCents }));
    for (let i = 0; i < items.length; i += PER_SLIDE) {
      slides.push({ kind: "category", title: c.name, page: items.length > PER_SLIDE ? `${i / PER_SLIDE + 1}/${Math.ceil(items.length / PER_SLIDE)}` : null, items: items.slice(i, i + PER_SLIDE) });
    }
  }
  return <TvView name={menu.establishment.name} logoUrl={branding?.logoUrl ?? null} brand={branding?.palette?.brand ?? "#062D25"} slides={slides} />;
}
