import type { Metadata } from "next";

export const metadata: Metadata = { title: { default: "Painel central", template: "%s · Central MESVIO" }, robots: { index: false, follow: false } };

export default function CentralLayout({ children }: { children: React.ReactNode }) {
  return children;
}
