import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

// Manrope: licença SIL Open Font License, servida pelo próprio site (next/font), sem pedidos à Google no browser.
const manrope = Manrope({ subsets: ["latin", "latin-ext"], variable: "--font-manrope", display: "swap" });

export const metadata: Metadata = {
  metadataBase: process.env.NEXT_PUBLIC_APP_URL ? new URL(process.env.NEXT_PUBLIC_APP_URL) : undefined,
  title: { default: "MESVIO — pedidos digitais por QR Code e NFC", template: "%s · MESVIO" },
  description:
    "O empregado que não sabias que precisavas. Pedidos digitais por QR Code e NFC para restaurantes, bares de praia, hotéis e piscinas, sem instalar aplicações.",
  applicationName: "MESVIO",
  openGraph: {
    type: "website",
    locale: "pt_PT",
    siteName: "MESVIO",
    title: "MESVIO — O empregado que não sabias que precisavas.",
    description: "Pedidos digitais por QR Code e NFC. Menos espera. Mais serviço.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f7f5f0",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-PT" className={manrope.variable}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
