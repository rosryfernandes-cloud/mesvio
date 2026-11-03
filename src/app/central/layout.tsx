import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Painel central", template: "%s · Central MESVIO" },
  robots: { index: false, follow: false },
  // App própria no ecrã inicial: abre na central (sem isto abria o painel do restaurante).
  manifest: "/central/manifest.webmanifest",
  appleWebApp: { capable: true, title: "MESVIO Central", statusBarStyle: "default" },
};

export default function CentralLayout({ children }: { children: React.ReactNode }) {
  return children;
}
