import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getDb } from "@/server/db/client";
import { findPlatformAdmin } from "@/server/platform/admin-auth";
import { can, manageableRoles } from "@/server/staff/context";
import { getStaffContext } from "@/server/staff/http";
import { getBoard } from "@/server/staff/staff-service";
import { StaffPanel } from "@/components/staff/staff-panel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Painel", robots: { index: false, follow: false } };

export default async function StaffPanelPage() {
  const ctx = await getStaffContext();
  if (!ctx) redirect("/painel/entrar");
  const db = await getDb();
  return (
    <StaffPanel
      initialBoard={await getBoard(db, ctx)}
      me={{
        isPlatformAdmin: (await findPlatformAdmin(db, ctx.userId)) !== null,
        displayName: ctx.displayName,
        role: ctx.role,
        establishmentId: ctx.establishmentId,
        establishments: ctx.establishments,
        canEditSettings: can(ctx, "settings.edit"),
        canViewTeam: can(ctx, "team.view"),
        manageableRoles: manageableRoles(ctx.role),
      }}
    />
  );
}
