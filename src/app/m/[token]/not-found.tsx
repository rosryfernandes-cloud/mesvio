import { getRequestLocale } from "@/server/i18n/request-locale";
import { MESSAGES } from "@/lib/i18n/messages";

export default async function TableNotFound() {
  const t = MESSAGES[await getRequestLocale()];
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 text-center">
      <h1 className="font-[family-name:var(--font-display)] text-3xl">{t.notFound.title}</h1>
      <p className="mt-3 text-ink-soft">{t.notFound.body}</p>
    </main>
  );
}
