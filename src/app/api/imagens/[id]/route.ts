import { z } from "zod";
import { getDb } from "@/server/db/client";
import { readImage } from "@/server/menu/menu-images";

export const dynamic = "force-dynamic";

/**
 * Foto de um prato. O URL leva a versão (?v=hash) e cada foto nova tem id novo, por isso pode
 * ficar em cache para sempre (no telemóvel e na CDN): só a primeira visita chega à BD.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return new Response("Não encontrada", { status: 404 });
  const img = await readImage(await getDb(), id);
  if (!img) return new Response("Não encontrada", { status: 404 });
  return new Response(new Uint8Array(img.bytes), {
    headers: {
      "Content-Type": img.contentType,
      "Content-Length": String(img.bytes.length),
      "Cache-Control": "public, max-age=31536000, immutable",
      ETag: `"${img.sha256.slice(0, 32)}"`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
