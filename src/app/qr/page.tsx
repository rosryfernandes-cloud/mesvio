import { redirect } from "next/navigation";

/**
 * Antiga folha pública de QR Codes. Os QR dão acesso a fazer pedidos nas mesas, por isso só se
 * mostram no painel do restaurante (dono/gerente, com login): /painel/qr.
 */
export default function QrSheetPage() {
  redirect("/painel/qr");
}
