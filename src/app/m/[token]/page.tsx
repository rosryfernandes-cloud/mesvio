import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTableMenuForRequest as getTableMenu } from "@/server/menu/get-table-menu";
import { MenuOrdering } from "@/components/order/menu-ordering";
import { PoweredBy } from "@/components/brand/logo";
import { getTableBrandingForRequest } from "@/server/branding/table-branding";
import { getRequestLocale } from "@/server/i18n/request-locale";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { MESSAGES } from "@/lib/i18n/messages";
import { CallStaff } from "@/components/order/call-staff";

// A ementa depende do token e do estado do POS — nunca gerada estaticamente.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const locale = await getRequestLocale();
  const menu = await getTableMenu(token, locale);
  return {
    title: menu ? `${menu.establishment.name} — ${menu.table.label}` : MESSAGES[locale].notFound.title,
    robots: { index: false, follow: false },
  };
}

export default async function TableMenuPage({ params }: Props) {
  const { token } = await params;
  const locale = await getRequestLocale();
  const t = MESSAGES[locale];
  const [menu, branding] = await Promise.all([getTableMenu(token, locale), getTableBrandingForRequest(token)]);
  if (!menu) notFound();
  const payFirst = menu.table.orderingMode === "pay_first";

  return (
    <div className="mx-auto max-w-2xl pb-28">
      <header className="px-4 pt-8 pb-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-brand">
            {menu.table.label}
            {menu.table.zone && <span className="text-ink-soft"> · {menu.table.zone}</span>}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <LanguageSwitcher />
            {menu.plan !== "menu" && (
              <Link
                href={`/m/${token}/conta`}
                className="inline-flex min-h-9 items-center rounded-full border border-line bg-card px-3.5 text-sm font-medium hover:border-brand hover:text-brand"
              >
                {payFirst ? t.menu.myOrders : t.menu.tableBill}
              </Link>
            )}
          </div>
        </div>
        {branding?.logoUrl && (
          // Logótipo alojado pelo restaurante (URL https gravado no painel).
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={branding.logoUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="mt-4 h-16 w-auto max-w-[14rem] object-contain object-left"
          />
        )}
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl leading-tight">
          {menu.establishment.name}
        </h1>
        {menu.establishment.address && <p className="mt-1 text-sm text-ink-soft">{menu.establishment.address}</p>}
      </header>

      {menu.plan !== "menu" && <CallStaff tableToken={token} payFirst={payFirst} />}

      {menu.ordering.enabled && payFirst && (
        <div className="mx-4 mt-4 rounded-xl border border-line bg-brand-soft px-4 py-3 text-sm">
          <strong className="font-semibold">{t.menu.payFirstTitle}</strong> {t.menu.payFirstBody}
        </div>
      )}

      {/* Plano só com a ementa: não é "por agora", é assim — sem aviso. */}
      {!menu.ordering.enabled && menu.plan !== "menu" && (
        <div role="status" className="mx-4 mt-4 rounded-xl border border-line bg-brand-soft px-4 py-3 text-sm">
          <strong className="font-semibold">{t.menu.viewOnlyTitle}</strong> {t.menu.viewOnlyBody}
        </div>
      )}

      <MenuOrdering menu={menu} tableToken={token} />

      <footer className="mt-12 px-4 text-center text-xs text-ink-soft">
        {t.menu.vatIncluded} {payFirst ? t.menu.payInApp : t.menu.payAtRestaurant}
        <br />
        {t.menu.allergyNotice}
        <span className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <PoweredBy label={t.menu.poweredBy} />
          <Link href="/privacidade" className="underline hover:text-ink">
            {t.menu.privacy}
          </Link>
          <Link href="/termos" className="underline hover:text-ink">
            {t.menu.terms}
          </Link>
        </span>
      </footer>
    </div>
  );
}
