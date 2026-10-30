import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { requirePlatformAdmin } from "@/server/platform/page-guard";
import { getEstablishmentDetail } from "@/server/platform/platform-service";
import { CentralShell } from "@/components/central/central-shell";
import { AddTablesForm, InviteOwnerForm } from "@/components/central/establishment-actions";
import { formatEur } from "@/lib/money";
import { OwnMenuSwitch } from "@/components/central/own-menu-switch";
import { PlanPicker } from "@/components/central/plan-picker";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Restaurante" };

const STATUS: Record<string, string> = {
  AWAITING_PAYMENT: "Por pagar",
  RECEIVED: "Recebido",
  SUBMITTING: "A enviar",
  FAILED_RETRYING: "A tentar de novo",
  SUBMITTED: "Enviado",
  ACCEPTED: "Confirmado",
  IN_PREPARATION: "Em preparação",
  SERVED: "Servido",
  REJECTED: "Recusado",
  CANCELLED: "Cancelado",
  NEEDS_ATTENTION: "Precisa de atenção",
};

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ criado?: string }> };

export default async function EstablishmentPage({ params, searchParams }: Props) {
  const admin = await requirePlatformAdmin();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const d = await getEstablishmentDetail(await getDb(), id);
  if (!d) notFound();
  const { criado } = await searchParams;
  const s = d.summary;
  const zones = [...new Set(d.tables.map((t) => t.zone ?? "Sem zona"))];

  return (
    <CentralShell adminName={admin.displayName ?? admin.email ?? ""}>
      <Link prefetch={false} href="/central" className="text-sm text-ink-soft underline">
        ← Visão geral
      </Link>
      {criado && (
        <p role="status" className="mt-4 rounded-2xl bg-[#ecfdf3] px-4 py-3 text-sm text-ok">
          Restaurante criado e dono convidado. Próximo passo: imprimir os QR Codes.
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl tracking-tight">{s.name}</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {s.legalName} · NIF {d.nif}
            {d.address && ` · ${d.address}`}
          </p>
        </div>
        <Link href={`/central/restaurantes/${id}/qr`} className="min-h-11 rounded-xl bg-brand px-5 py-2.5 font-semibold text-white">
          Imprimir QR Codes
        </Link>
      </div>

      <ul className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Pedidos este mês", value: s.ordersThisMonth.toLocaleString("pt-PT") },
          { label: "Sem IVA este mês", value: formatEur(s.netCentsThisMonth) },
          { label: `Comissão (${(s.commissionBps / 100).toLocaleString("pt-PT")}%)`, value: formatEur(s.commissionCentsThisMonth) },
          { label: "Lugares", value: String(s.tables) },
        ].map((k) => (
          <li key={k.label} className="rounded-3xl border border-line bg-card p-5">
            <p className="text-sm text-ink-soft">{k.label}</p>
            <p className="mt-2 text-xl font-extrabold tracking-tight tabular-nums sm:text-2xl">{k.value}</p>
          </li>
        ))}
      </ul>

      <PlanPicker establishmentId={id} plan={s.plan} />

      <OwnMenuSwitch establishmentId={id} provider={s.posProvider} />

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="donos" className="rounded-3xl border border-line bg-card p-5">
          <h2 id="donos" className="text-lg">
            Donos
          </h2>
          {d.owners.length === 0 ? (
            <p className="mt-2 text-sm text-ink-soft">Ainda sem dono.</p>
          ) : (
            <ul className="mt-2 grid gap-1 text-sm">
              {d.owners.map((o) => (
                <li key={o.userId}>
                  <span className="font-semibold">{o.displayName ?? o.email}</span>
                  {o.displayName && <span className="text-ink-soft"> · {o.email}</span>}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 border-t border-line pt-4">
            <InviteOwnerForm establishmentId={id} />
          </div>
        </section>

        <section aria-labelledby="pedidos" className="rounded-3xl border border-line bg-card p-5">
          <h2 id="pedidos" className="text-lg">
            Últimos pedidos
          </h2>
          {d.recentOrders.length === 0 ? (
            <p className="mt-2 text-sm text-ink-soft">Ainda sem pedidos.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line text-sm">
              {d.recentOrders.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 py-2">
                  <span>
                    <span className="font-semibold tabular-nums">#{o.shortCode}</span> · {o.tableLabel}
                    <span className="block text-xs text-ink-soft">
                      {new Date(o.createdAt).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Lisbon" })} ·{" "}
                      {STATUS[o.status] ?? o.status}
                    </span>
                  </span>
                  <span className="tabular-nums">{formatEur(o.totalCents)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section aria-labelledby="lugares" className="mt-6 rounded-3xl border border-line bg-card p-5">
        <h2 id="lugares" className="text-lg">
          Lugares
        </h2>
        {zones.map((zone) => (
          <div key={zone} className="mt-3">
            <p className="text-xs font-semibold tracking-wide text-ink-soft uppercase">{zone}</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {d.tables
                .filter((t) => (t.zone ?? "Sem zona") === zone)
                .map((t) => (
                  <li key={t.id}>
                    <a
                      href={`/m/${t.publicToken}`}
                      target="_blank"
                      rel="noopener"
                      className={`inline-flex min-h-9 items-center rounded-full border px-3 text-sm ${t.active ? "border-line" : "border-dashed text-ink-soft"}`}
                      title={t.orderingMode === "pay_first" ? "Paga ao pedir" : "Paga no fim"}
                    >
                      {t.label}
                    </a>
                  </li>
                ))}
            </ul>
          </div>
        ))}
        <div className="mt-5 border-t border-line pt-4">
          <AddTablesForm establishmentId={id} />
        </div>
      </section>
    </CentralShell>
  );
}
