import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type Db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { withTenant } from "@/server/db/tenant";
import { DEMO_USERS } from "@/server/db/seed-demo";
import { DEMO_TABLES } from "@/server/pos/mock/demo-data";
import { resolveStaffContext, type StaffContext } from "@/server/staff/context";
import { getTableMenu } from "./get-table-menu";
import { deleteProductImage, MAX_IMAGE_BYTES, readImage, saveProductImage, sniffImageType } from "./menu-images";

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), randomBytes(200)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(200)]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([1, 2, 3, 4]), Buffer.from("WEBP"), randomBytes(200)]);
const T1 = DEMO_TABLES[0];

let db: Db;
let manager: StaffContext;
beforeEach(async () => {
  db = await createTestDb();
  manager = (await resolveStaffContext(db, DEMO_USERS[1].userId))!;
});

const photoOf = async (ref: string) => (await getTableMenu(T1.publicToken, { db }))!.categories.flatMap((c) => c.products).find((p) => p.ref === ref)!.imageUrl;

describe("fotos dos pratos", () => {
  it("reconhece o tipo pelos bytes e recusa o resto (ex.: SVG, que pode levar código)", () => {
    expect(sniffImageType(PNG)).toBe("image/png");
    expect(sniffImageType(JPEG)).toBe("image/jpeg");
    expect(sniffImageType(WEBP)).toBe("image/webp");
    expect(sniffImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).toBeNull();
    expect(sniffImageType(Buffer.from("GIF89a"))).toBeNull();
  });

  it("a foto enviada aparece na ementa; trocar dá um URL novo (a cache nunca mostra a antiga)", async () => {
    expect(await photoOf("F101")).toBeUndefined();
    const first = await saveProductImage(db, manager, "F101", PNG);
    expect(first.ok).toBe(true);
    const url1 = await photoOf("F101");
    expect(url1).toMatch(/^\/api\/imagens\/[0-9a-f-]{36}\?v=[0-9a-f]{12}$/);

    const second = await saveProductImage(db, manager, "F101", JPEG);
    const url2 = await photoOf("F101");
    expect(second.ok && url2).not.toBe(url1);
    expect(await db.$count(t.menuImages)).toBe(1);

    const id = url2!.split("/").pop()!.split("?")[0];
    const img = await readImage(db, id);
    expect(img?.contentType).toBe("image/jpeg");
    expect(Buffer.compare(img!.bytes, JPEG)).toBe(0);
  });

  it("remover volta a não ter foto", async () => {
    await saveProductImage(db, manager, "F101", PNG);
    expect(await deleteProductImage(db, manager, "F101")).toBe(true);
    expect(await photoOf("F101")).toBeUndefined();
  });

  it("recusa ficheiros que não são fotografias e fotos acima de 1 MB", async () => {
    expect(await saveProductImage(db, manager, "F101", Buffer.from("<svg/>"))).toMatchObject({ ok: false, code: "INVALID" });
    const big = Buffer.concat([JPEG, Buffer.alloc(MAX_IMAGE_BYTES)]);
    expect(await saveProductImage(db, manager, "F101", big)).toMatchObject({ ok: false, code: "TOO_LARGE" });
    expect(await db.$count(t.menuImages)).toBe(0);
  });

  it("as fotos de um restaurante não se veem nem se apagam a partir de outro (RLS)", async () => {
    await saveProductImage(db, manager, "F101", PNG);
    const otherOrg = "00000000-0000-4000-8000-00000000c001";
    await db.insert(t.organizations).values({ id: otherOrg, legalName: "Outro, Lda.", nif: "999999993", status: "active" });
    await withTenant(db, { organizationId: otherOrg }, async (tx) => {
      expect(await tx.select({ id: t.menuImages.id }).from(t.menuImages)).toHaveLength(0);
    });
    expect(await deleteProductImage(db, { ...manager, organizationId: otherOrg }, "F101")).toBe(false);
    expect(await db.$count(t.menuImages, eq(t.menuImages.posProductRef, "F101"))).toBe(1);
  });
});
