import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type Db } from "@/server/db/client";
import { DEMO_USERS } from "@/server/db/seed-demo";
import { productImageUrls } from "@/server/menu/menu-images";
import { resolveStaffContext, type StaffContext } from "@/server/staff/context";
import { getBranding, setBranding } from "@/server/staff/staff-service";
import { LOGO_IMAGE_REF, removeEstablishmentLogo, saveEstablishmentLogo } from "./logo";

const PNG = (n: number) => Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, n]);
const BASE = "https://mesvio.pt";

let db: Db;
let owner: StaffContext;
beforeEach(async () => {
  db = await createTestDb();
  owner = (await resolveStaffContext(db, DEMO_USERS[0].userId))!;
});

describe("logótipo enviado pelo dono", () => {
  it("guarda a imagem, usa-a na ementa e mantém a cor", async () => {
    await setBranding(db, owner, { brandColor: "#1d3557", brandLogoUrl: null });
    const r = await saveEstablishmentLogo(db, owner, PNG(1), BASE);
    expect(r.ok).toBe(true);
    const branding = await getBranding(db, owner);
    expect(branding.brandColor).toBe("#1d3557");
    expect(branding.brandLogoUrl).toMatch(/^https:\/\/mesvio\.pt\/api\/imagens\//);
  });

  it("trocar substitui a imagem anterior, sem acumular", async () => {
    const first = await saveEstablishmentLogo(db, owner, PNG(1), BASE);
    const second = await saveEstablishmentLogo(db, owner, PNG(2), BASE);
    expect(first.ok && second.ok && first.url !== second.url).toBe(true);
    const urls = await productImageUrls(db, owner.organizationId, owner.establishmentId);
    expect([...urls.keys()].filter((k) => k === LOGO_IMAGE_REF)).toHaveLength(1);
  });

  it("recusa o que não é imagem e deixa o logótipo como estava", async () => {
    const r = await saveEstablishmentLogo(db, owner, Buffer.from("<svg onload=alert(1)>"), BASE);
    expect(r.ok).toBe(false);
    expect((await getBranding(db, owner)).brandLogoUrl).toBeNull();
  });

  it("remover apaga a imagem e o endereço", async () => {
    await saveEstablishmentLogo(db, owner, PNG(1), BASE);
    await removeEstablishmentLogo(db, owner);
    expect((await getBranding(db, owner)).brandLogoUrl).toBeNull();
    const urls = await productImageUrls(db, owner.organizationId, owner.establishmentId);
    expect(urls.has(LOGO_IMAGE_REF)).toBe(false);
  });
});
