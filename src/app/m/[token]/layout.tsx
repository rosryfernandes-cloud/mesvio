import type { CSSProperties } from "react";
import { getTableBrandingForRequest } from "@/server/branding/table-branding";
import { getRequestLocale } from "@/server/i18n/request-locale";
import { I18nProvider } from "@/components/i18n/i18n-provider";
import { LOCALE_TAGS } from "@/lib/i18n/messages";

/**
 * Aplica a cor do restaurante e a língua do cliente a todas as páginas desta mesa: as classes
 * brand/brand-soft leem estas variáveis, por isso basta redefini-las aqui.
 */
export default async function TableLayout({ children, params }: { children: React.ReactNode; params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [branding, locale] = await Promise.all([getTableBrandingForRequest(token), getRequestLocale()]);
  const style = branding?.palette
    ? ({ "--color-brand": branding.palette.brand, "--color-brand-soft": branding.palette.brandSoft } as CSSProperties)
    : undefined;
  return (
    <div style={style} lang={LOCALE_TAGS[locale]} className="min-h-dvh">
      <I18nProvider locale={locale}>{children}</I18nProvider>
    </div>
  );
}
