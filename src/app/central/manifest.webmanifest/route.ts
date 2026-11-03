/**
 * O painel central instala-se como uma app à parte ("MESVIO Central"): no ecrã inicial abre na
 * central, não no painel do restaurante (o manifesto do site, em app/manifest.ts, é o do painel).
 */
export function GET() {
  return Response.json(
    {
      id: "/central",
      name: "MESVIO Central",
      short_name: "Central",
      description: "Restaurantes, pedidos de demonstração e números da MESVIO.",
      start_url: "/central",
      scope: "/central",
      display: "standalone",
      orientation: "portrait",
      background_color: "#062D25",
      theme_color: "#062D25",
      lang: "pt-PT",
      icons: [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
        { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } },
  );
}
