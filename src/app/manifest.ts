import type { MetadataRoute } from "next";

/**
 * O painel da equipa instala-se como app (ecrã inicial do telemóvel): abre direto no painel, em
 * ecrã inteiro. Os clientes não instalam nada: continuam a usar o QR no browser.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/painel",
    name: "MESVIO — Painel",
    short_name: "MESVIO",
    description: "Pedidos, mesas e pagamentos do restaurante.",
    start_url: "/painel",
    scope: "/painel",
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
  };
}
