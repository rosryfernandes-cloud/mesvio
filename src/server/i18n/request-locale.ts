import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { LOCALE_COOKIE, pickLocale, type Locale } from "@/lib/i18n/messages";

/** Língua do cliente neste pedido HTTP: escolhida (cookie) ou a do telemóvel. */
export const getRequestLocale = cache(async (): Promise<Locale> => {
  const [c, h] = await Promise.all([cookies(), headers()]);
  return pickLocale(c.get(LOCALE_COOKIE)?.value, h.get("accept-language"));
});
