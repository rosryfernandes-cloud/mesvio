"use client";

import { useRouter } from "next/navigation";
import { LOCALE_COOKIE, LOCALE_NAMES, LOCALES, type Locale } from "@/lib/i18n/messages";
import { useI18n } from "./i18n-provider";

/** Seletor de língua da ementa: guarda a escolha (1 ano) e volta a pedir a página ao servidor. */
export function LanguageSwitcher() {
  const router = useRouter();
  const { locale, t } = useI18n();
  return (
    <label className="relative inline-flex min-h-9 items-center rounded-full border border-line bg-card px-3 text-sm font-medium focus-within:outline-3 focus-within:outline-brand hover:border-brand">
      <span className="sr-only">{t.menu.language}</span>
      <svg viewBox="0 0 24 24" className="mr-1.5 size-4 text-ink-soft" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5Z" />
      </svg>
      <span aria-hidden="true">{locale.toUpperCase()}</span>
      {/* O select fica por cima, invisível: abre a lista nativa do telemóvel, que mostra os nomes completos. */}
      <select
        value={locale}
        onChange={(e) => {
          const next = e.target.value as Locale;
          document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
          router.refresh();
        }}
        className="absolute inset-0 cursor-pointer appearance-none opacity-0"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l} lang={l}>
            {LOCALE_NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
