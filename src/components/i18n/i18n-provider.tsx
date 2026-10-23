"use client";

import { createContext, useContext } from "react";
import { DEFAULT_LOCALE, MESSAGES, type Locale, type Messages } from "@/lib/i18n/messages";

const I18nContext = createContext<Locale>(DEFAULT_LOCALE);

/** Passa a língua escolhida no servidor aos componentes do cliente (os textos vêm do dicionário). */
export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <I18nContext.Provider value={locale}>{children}</I18nContext.Provider>;
}

export function useI18n(): { locale: Locale; t: Messages } {
  const locale = useContext(I18nContext);
  return { locale, t: MESSAGES[locale] };
}
