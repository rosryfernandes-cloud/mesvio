import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type Db } from "@/server/db/client";
import { DEMO_USERS } from "@/server/db/seed-demo";
import { DEMO_PRODUCTS, DEMO_TABLES } from "@/server/pos/mock/demo-data";
import { resolveStaffContext, type StaffContext } from "@/server/staff/context";
import { getTableMenu } from "./get-table-menu";
import { productImageUrls, saveProductImage, setMenuPhotosEnabled } from "./menu-images";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);
const REF = DEMO_PRODUCTS[0].posProductRef;

let db: Db;
let owner: StaffContext;
beforeEach(async () => {
  db = await createTestDb();
  owner = (await resolveStaffContext(db, DEMO_USERS[0].userId))!;
  await saveProductImage(db, owner, REF, PNG);
});

const photoOfProduct = async () => {
  const menu = await getTableMenu(DEMO_TABLES[0].publicToken, { db });
  return menu!.categories.flatMap((c) => c.products).find((p) => p.ref === REF)!.imageUrl;
};

describe("fotos na ementa", () => {
  it("por omissão, o cliente vê a foto", async () => {
    expect(await photoOfProduct()).toBeTruthy();
  });

  it("desligar esconde a foto sem a apagar, e ligar volta a mostrá-la", async () => {
    await setMenuPhotosEnabled(db, owner, false);
    expect(await photoOfProduct()).toBeUndefined();
    expect((await productImageUrls(db, owner.organizationId, owner.establishmentId)).has(REF)).toBe(true);
    await setMenuPhotosEnabled(db, owner, true);
    expect(await photoOfProduct()).toBeTruthy();
  });
});
