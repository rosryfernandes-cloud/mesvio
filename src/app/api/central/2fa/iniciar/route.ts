import QRCode from "qrcode";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { json } from "@/server/staff/http";
import { guardPlatformPreMfa, startEnrollment } from "@/server/platform/admin-auth";

export const dynamic = "force-dynamic";

/** Configurar o 2FA: com o código de ativação, devolve o segredo e o QR Code para a app. */
export async function POST(request: Request) {
  const admin = await guardPlatformPreMfa(request);
  if (admin instanceof Response) return admin;
  const body = z.object({ codigoAtivacao: z.string().max(40).optional() }).safeParse(await request.json().catch(() => ({})));
  const r = await startEnrollment(await getDb(), admin, { activationCode: body.success ? body.data.codigoAtivacao : undefined });
  if (!r.ok) return json({ code: r.code, message: r.message }, r.code === "RATE_LIMITED" ? 429 : r.code === "ALREADY_ENROLLED" ? 409 : 403);
  const qrSvg = await QRCode.toString(r.uri, { type: "svg", errorCorrectionLevel: "M", margin: 1 });
  // O segredo só serve para quem não consegue ler o QR (introduzir à mão).
  return json({ secret: r.secret, qrSvg });
}
