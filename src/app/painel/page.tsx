import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getDb } from "@/server/db/client";
import { can, manageableRoles } from "@/server/staff/context";
import { getStaffContext } from "@/server/staff/http";
import { getBoard } from "@/server/staff/staff-service";
import { StaffPanel } from "@/components/staff/staff-panel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Painel", robots: { index: false, follow: false } };

export default async function StaffPanelPage() {
  const ctx = await getStaffContext();
  if (!ctx) redirect("/painel/entrar");
  return (
    <StaffPanel
      initialBoard={await getBoard(await getDb(), ctx)}
      me={{
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
