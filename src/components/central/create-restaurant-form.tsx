"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const field = "mt-1 block w-full min-h-11 rounded-xl border border-line bg-card px-3";
const label = "text-sm font-semibold";
const hint = "mt-1 block text-xs font-normal text-ink-soft";

const toSlug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

/** Novo cliente: dados da empresa, do espaço, POS, lugares e dono. */
export function CreateRestaurantForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(form: HTMLFormElement) {
    const f = new FormData(form);
    const str = (k: string) => String(f.get(k) ?? "").trim();
    const num = (k: string) => Number(f.get(k) || 0);
    const body = {
      legalName: str("legalName"),
      nif: str("nif").replace(/\s/g, ""),
      billingEmail: str("billingEmail"),
      name: str("name"),
      slug: str("slug"),
      address: str("address") || undefined,
      posProvider: str("posProvider"),
      commissionBps: Math.round(Number(str("commission").replace(",", ".")) * 100),
      tables: [
        { count: num("tablesCount"), prefix: str("tablesPrefix") || "Mesa", zone: str("tablesZone") || undefined, orderingMode: "pay_later" },
        { count: num("bedsCount"), prefix: str("bedsPrefix") || "Cama", zone: str("bedsZone") || undefined, orderingMode: "pay_first" },
      ].filter((t) => t.count > 0),
      owner: { email: str("ownerEmail"), displayName: str("ownerName") || undefined },
    };
    setBusy(true);
    setError(null);
    const res = await fetch("/api/central/restaurantes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok) return setError(data.message ?? "Sem ligação. Tente de novo.");
    router.push(`/central/restaurantes/${data.establishmentId}?criado=1`);
  }

  return (
    <form
      className="grid gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(e.currentTarget);
      }}
    >
      <fieldset className="grid gap-4 rounded-3xl border border-line bg-card p-5 sm:grid-cols-2">
        <legend className="px-1 text-lg font-bold">Empresa</legend>
        <label className={label}>
          Nome legal
          <input name="legalName" required minLength={2} maxLength={160} className={field} placeholder="Ex.: Praia Azul, Lda." />
        </label>
        <label className={label}>
          NIF
          <input name="nif" required inputMode="numeric" pattern="\s*\d{3}\s*\d{3}\s*\d{3}\s*" className={field} placeholder="9 dígitos" />
        </label>
        <label className={`${label} sm:col-span-2`}>
          Email de faturação <span className="font-normal text-ink-soft">(opcional)</span>
          <input name="billingEmail" type="email" maxLength={200} className={field} />
        </label>
      </fieldset>

      <fieldset className="grid gap-4 rounded-3xl border border-line bg-card p-5 sm:grid-cols-2">
        <legend className="px-1 text-lg font-bold">Espaço</legend>
        <label className={label}>
          Nome na ementa
          <input
            name="name"
            required
            minLength={2}
            maxLength={120}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!slugTouched) setSlug(toSlug(e.target.value));
            }}
            className={field}
          />
        </label>
        <label className={label}>
          Identificador
          <input
            name="slug"
            required
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value.toLowerCase());
            }}
            className={`${field} font-mono`}
          />
          <span className={hint}>Letras minúsculas, números e hífenes. Usado internamente.</span>
        </label>
        <label className={`${label} sm:col-span-2`}>
          Morada <span className="font-normal text-ink-soft">(opcional, aparece na ementa)</span>
          <input name="address" maxLength={200} className={field} />
        </label>
        <label className={label}>
          Sistema POS
          <select name="posProvider" defaultValue="mock" className={field}>
            <option value="mock">MockPOS (testes e demonstração)</option>
            <option value="zonesoft">ZoneSoft (por configurar)</option>
          </select>
          <span className={hint}>Com ZoneSoft, a ementa só mostra até a integração estar ligada.</span>
        </label>
        <label className={label}>
          Comissão (%)
          <input name="commission" required defaultValue="1" inputMode="decimal" pattern="\d{1,2}([.,]\d{1,2})?" className={field} />
          <span className={hint}>Sobre o valor sem IVA dos pedidos confirmados.</span>
        </label>
      </fieldset>

      <fieldset className="grid gap-4 rounded-3xl border border-line bg-card p-5">
        <legend className="px-1 text-lg font-bold">Lugares (QR Code / NFC)</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className={label}>
            Mesas <span className="font-normal text-ink-soft">(pagam no fim)</span>
            <input name="tablesCount" type="number" min={0} max={300} defaultValue={10} className={field} />
          </label>
          <label className={label}>
            Nome
            <input name="tablesPrefix" defaultValue="Mesa" maxLength={30} className={field} />
          </label>
          <label className={label}>
            Zona
            <input name="tablesZone" defaultValue="Esplanada" maxLength={40} className={field} />
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className={label}>
            Espreguiçadeiras <span className="font-normal text-ink-soft">(pagam ao pedir)</span>
            <input name="bedsCount" type="number" min={0} max={300} defaultValue={0} className={field} />
          </label>
          <label className={label}>
            Nome
            <input name="bedsPrefix" defaultValue="Cama" maxLength={30} className={field} />
          </label>
          <label className={label}>
            Zona
            <input name="bedsZone" defaultValue="Praia" maxLength={40} className={field} />
          </label>
        </div>
        <p className="text-xs text-ink-soft">
          Pode acrescentar mais depois. As espreguiçadeiras só aceitam pedidos quando os pagamentos no telemóvel estiverem ligados.
        </p>
      </fieldset>

      <fieldset className="grid gap-4 rounded-3xl border border-line bg-card p-5 sm:grid-cols-2">
        <legend className="px-1 text-lg font-bold">Dono</legend>
        <label className={label}>
          Email
          <input name="ownerEmail" type="email" required maxLength={200} className={field} />
          <span className={hint}>Recebe um convite por email e depois convida a equipa no painel.</span>
        </label>
        <label className={label}>
          Nome <span className="font-normal text-ink-soft">(opcional)</span>
          <input name="ownerName" maxLength={80} className={field} />
        </label>
      </fieldset>

      {error && (
        <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}
      <div>
        <button type="submit" disabled={busy} className="min-h-12 rounded-2xl bg-brand px-6 font-semibold text-white disabled:opacity-50">
          {busy ? "A criar…" : "Criar restaurante e convidar o dono"}
        </button>
      </div>
    </form>
  );
}
