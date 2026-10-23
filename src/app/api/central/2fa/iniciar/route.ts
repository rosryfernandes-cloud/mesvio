import QRCode from "qrcode";
import { getDb } from "@/server/db/client";
import { json } from "@/server/staff/http";
import { guardPlatformPreMfa, startEnrollment } from "@/server/platform/admin-auth";

export const dynamic = "force-dynamic";

/** Configurar o 2FA: segredo novo e QR Code para a app de autenticação. */
export async function POST(request: Request) {
  const admin = await guardPlatformPreMfa(request);
  if (admin instanceof Response) return admin;
  if (admin.totpSecretCiphertext) return json({ message: "O 2FA já está configurado." }, 409);
  const { secret, uri } = await startEnrollment(await getDb(), admin);
  const qrSvg = await QRCode.toString(uri, { type: "svg", errorCorrectionLevel: "M", margin: 1 });
  // O segredo só passa por aqui uma vez, para quem não consegue ler o QR (introduzir à mão).
  return json({ secret, qrSvg });
}
