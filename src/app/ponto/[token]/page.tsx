import type { Metadata, Viewport } from "next";
import { ClockKiosk } from "@/components/clock/clock-kiosk";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Picar ponto", robots: { index: false, follow: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1 };

/** Tablet à entrada do restaurante: cada funcionário pica o ponto com o nome, o PIN e uma selfie. */
export default async function ClockKioskPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ClockKiosk token={token} />;
}
