import type { CSSProperties } from "react";
import { getTableBrandingForRequest } from "@/server/branding/table-branding";

/**
 * Aplica a cor do restaurante a todas as páginas do cliente desta mesa: as classes brand/brand-soft
 * leem estas variáveis, por isso basta redefini-las aqui.
 */
export default async function TableLayout({ children, params }: { children: React.ReactNode; params: Promise<{ token: string }> }) {
  const { token } = await params;
  const branding = await getTableBrandingForRequest(token);
  const style = branding?.palette
    ? ({ "--color-brand": branding.palette.brand, "--color-brand-soft": branding.palette.brandSoft } as CSSProperties)
    : undefined;
  return (
    <div style={style} className="min-h-dvh">
      {children}
    </div>
  );
}
