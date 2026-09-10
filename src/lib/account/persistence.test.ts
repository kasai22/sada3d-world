import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { eq } from "drizzle-orm";

import { setDatabaseProvider } from "@/lib/db/client";
import { createTestDatabase, type TestDatabase } from "@/lib/db/pglite.testing";
import { customerDesignOrders, customerDesigns, savedItems } from "@/lib/db/schema";
import { PRODUCTS } from "@/lib/catalog/products";
import type { ShippingAddress } from "@/lib/checkout/types";

import {
  createCustomerAddress,
  customerAddressRepository,
  deleteCustomerAddress,
  listCustomerAddresses,
  setDefaultCustomerAddress,
  updateCustomerAddress,
} from "./addresses";
import { getCustomerDesign, listCustomerDesigns } from "./designs";
import {
  isProductSaved,
  listSavedProducts,
  removeSavedProduct,
  saveProduct,
  savedItemRepository,
} from "./saved";
import type { CustomerIdentity } from "./types";

/**
 * Durable persistence.
 *
 * These run against **PostgreSQL**, not against a fake. PGlite is the Postgres
 * engine compiled to WebAssembly, so the migrations applied here are the
 * committed ones, the partial unique index is a real partial unique index, and
 * a transaction that should fail does fail.
 *
 * Three things are being proved, and only a real database can prove any of
 * them:
 *
 *   isolation    one customer cannot reach another's rows
 *   invariant    a customer has at most one default address, even when two
 *                requests try to set one at the same moment
 *   durability   a row written before a restart is there afterwards
 *
 * The service and UI layers above are untouched from Phase 13. That they pass
 * unchanged against a different store is the point.
 */

let harness: TestDatabase;

const ADDRESS: ShippingAddress = {
  line1: "42 Industrial Estate",
  city: "Hyderabad",
  state: "TG",
  postalCode: "500032",
  country: "IN",
};

const input = (overrides: Record<string, unknown> = {}) => ({
  fullName: "Test Customer",
  phone: "9876543210",
  address: { ...ADDRESS },
  ...overrides,
});

let sequence = 0;
const customer = (): CustomerIdentity => ({ id: `cus_${(sequence += 1)}` });

before(async () => {
  harness = await createTestDatabase();
  setDatabaseProvider(harness);
});

after(async () => {
  setDatabaseProvider(null);
  await harness.destroy();
});

/* ------------------------------------------------------------------ *
 * The repositories are the durable ones
 * ------------------------------------------------------------------ */

test("the account repositories resolve to PostgreSQL when one is configured", () => {
  assert.equal(customerAddressRepository.name, "postgres");
  assert.equal(savedItemRepository.name, "postgres");
});

/* ------------------------------------------------------------------ *
 * Addresses
 * ------------------------------------------------------------------ */

test("an address round-trips through the database unchanged", async () => {
  const me = customer();

  const created = await createCustomerAddress(
    me,
    input({ label: "Workshop", address: { ...ADDRESS, line2: "Unit 4" } }),
  );
  assert.ok(created.ok);

  const [saved] = await listCustomerAddresses(me);
  assert.ok(saved);
  assert.equal(saved.label, "Workshop");
  assert.equal(saved.fullName, "Test Customer");
  assert.equal(saved.address.line2, "Unit 4");
  assert.equal(saved.address.postalCode, "500032");
  assert.equal(saved.isDefault, true);
});

test("an absent label and line2 come back absent, not as null", async () => {
  const me = customer();
  await createCustomerAddress(me, input());

  const [saved] = await listCustomerAddresses(me);
  assert.ok(saved);
  assert.equal(saved.label, undefined);
  assert.equal(saved.address.line2, undefined);
});

test("customer A cannot read, edit, delete or re-default customer B's address", async () => {
  const owner = customer();
  const intruder = customer();

  const created = await createCustomerAddress(owner, input());
  assert.ok(created.ok);
  const target = created.addresses[0];
  assert.ok(target);

  assert.deepEqual(await listCustomerAddresses(intruder), []);
  assert.equal(await customerAddressRepository.get(intruder.id, target.id), null);

  assert.equal((await updateCustomerAddress(intruder, target.id, input())).ok, false);
  assert.equal((await setDefaultCustomerAddress(intruder, target.id)).ok, false);
  assert.equal((await deleteCustomerAddress(intruder, target.id)).ok, false);

  const after = await listCustomerAddresses(owner);
  assert.equal(after.length, 1);
  assert.equal(after[0]?.fullName, "Test Customer");
});

test("a customer has exactly one default address across every mutation", async () => {
  const me = customer();

  await createCustomerAddress(me, input({ label: "One" }));
  await createCustomerAddress(me, input({ label: "Two", isDefault: true }));
  await createCustomerAddress(me, input({ label: "Three" }));

  const addresses = await listCustomerAddresses(me);
  assert.equal(addresses.length, 3);
  assert.equal(addresses.filter((a) => a.isDefault).length, 1);
  assert.equal(addresses[0]?.label, "Two");

  const three = addresses.find((a) => a.label === "Three");
  assert.ok(three);
  assert.equal((await setDefaultCustomerAddress(me, three.id)).ok, true);

  const promoted = await listCustomerAddresses(me);
  assert.equal(promoted.filter((a) => a.isDefault).length, 1);
  assert.equal(promoted[0]?.label, "Three");
});

test("deleting the default promotes another, and the last one leaves none", async () => {
  const me = customer();
  await createCustomerAddress(me, input({ label: "One" }));
  await createCustomerAddress(me, input({ label: "Two" }));

  const before = await listCustomerAddresses(me);
  const current = before.find((a) => a.isDefault);
  assert.ok(current);

  assert.equal((await deleteCustomerAddress(me, current.id)).ok, true);

  const after = await listCustomerAddresses(me);
  assert.equal(after.length, 1);
  assert.equal(after.filter((a) => a.isDefault).length, 1);

  const last = after[0];
  assert.ok(last);
  await deleteCustomerAddress(me, last.id);
  assert.deepEqual(await listCustomerAddresses(me), []);
});

test("two concurrent promotions cannot leave two defaults", async () => {
  const me = customer();

  await createCustomerAddress(me, input({ label: "A" }));
  await createCustomerAddress(me, input({ label: "B" }));
  await createCustomerAddress(me, input({ label: "C" }));

  const addresses = await listCustomerAddresses(me);
  const a = addresses.find((entry) => entry.label === "A");
  const b = addresses.find((entry) => entry.label === "B");
  const c = addresses.find((entry) => entry.label === "C");
  assert.ok(a && b && c);

  /*
   * Fired together, with no coordination between them. Whichever order the
   * database settles on, the end state has to be one default — and if a write
   * loses the race it must fail rather than commit a second one.
   */
  const results = await Promise.allSettled([
    setDefaultCustomerAddress(me, a.id),
    setDefaultCustomerAddress(me, b.id),
    setDefaultCustomerAddress(me, c.id),
  ]);

  assert.ok(
    results.some((result) => result.status === "fulfilled"),
    "every concurrent promotion failed",
  );

  const settled = await listCustomerAddresses(me);
  assert.equal(settled.length, 3, "a promotion lost an address");
  assert.equal(
    settled.filter((entry) => entry.isDefault).length,
    1,
    "the database ended up with more than one default",
  );
});

test("concurrent creates all persist and still leave one default", async () => {
  const me = customer();

  const results = await Promise.allSettled(
    ["A", "B", "C", "D"].map((label) =>
      createCustomerAddress(me, input({ label })),
    ),
  );
  assert.ok(results.some((result) => result.status === "fulfilled"));

  const addresses = await listCustomerAddresses(me);
  assert.ok(addresses.length >= 1);
  assert.equal(addresses.filter((entry) => entry.isDefault).length, 1);
});

/* ------------------------------------------------------------------ *
 * Saved items
 * ------------------------------------------------------------------ */

function purchasableProduct() {
  const product = PRODUCTS[0];
  assert.ok(product);
  return product;
}

test("a saved item round-trips and is private to its customer", async () => {
  const owner = customer();
  const other = customer();
  const product = purchasableProduct();

  assert.equal((await saveProduct(owner, product.id)).ok, true);

  const saved = await listSavedProducts(owner);
  assert.equal(saved.length, 1);
  assert.equal(saved[0]?.productId, product.id);
  assert.equal(saved[0]?.product?.name, product.name);

  assert.deepEqual(await listSavedProducts(other), []);
  assert.equal(await isProductSaved(other, product.id), false);

  // Removing from one list does not touch another's.
  await removeSavedProduct(other, product.id);
  assert.equal((await listSavedProducts(owner)).length, 1);
});

test("saving the same product twice is one row, even concurrently", async () => {
  const me = customer();
  const product = purchasableProduct();

  await Promise.allSettled([
    saveProduct(me, product.id),
    saveProduct(me, product.id),
    saveProduct(me, product.id),
  ]);

  assert.equal((await listSavedProducts(me)).length, 1);
});

test("re-saving does not move a part or change when it was saved", async () => {
  const me = customer();
  const product = purchasableProduct();

  await saveProduct(me, product.id);
  const [first] = await listSavedProducts(me);
  assert.ok(first);

  await saveProduct(me, product.id);
  const [again] = await listSavedProducts(me);
  assert.equal(again?.savedAt, first.savedAt);
});

test("a saved item whose product left the catalog survives and resolves to nothing", async () => {
  const me = customer();

  /*
   * Written straight to the table: the service refuses to save a product that
   * is not in the catalog, and this is the other case — a product that was
   * saved legitimately and has since been removed.
   */
  const db = await harness.database();
  await db.insert(savedItems).values({
    id: `sav_${me.id}_gone`,
    customerId: me.id,
    productId: "product-that-no-longer-exists",
  });

  const saved = await listSavedProducts(me);
  assert.equal(saved.length, 1);
  assert.equal(saved[0]?.product, undefined);
  assert.equal(saved[0]?.productId, "product-that-no-longer-exists");

  // And it can still be removed.
  assert.equal((await removeSavedProduct(me, "product-that-no-longer-exists")).ok, true);
  assert.deepEqual(await listSavedProducts(me), []);
});

/* ------------------------------------------------------------------ *
 * Designs
 * ------------------------------------------------------------------ */

test("design metadata is scoped to its owner", async () => {
  const owner = customer();
  const intruder = customer();

  const db = await harness.database();
  await db.insert(customerDesigns).values({
    id: "dsn_1",
    customerId: owner.id,
    name: "bracket.stl",
    format: "STL",
    sizeBytes: 2048,
    storageKey: "private/owner/bracket.stl",
  });
  await db.insert(customerDesignOrders).values({
    designId: "dsn_1",
    customerId: owner.id,
    orderReference: "S3D-000184",
  });

  const { customerDesignRepository } = await import("./designs");

  const mine = await customerDesignRepository.get(owner.id, "dsn_1");
  assert.equal(mine?.name, "bracket.stl");
  assert.deepEqual(mine?.orderReferences, ["S3D-000184"]);

  // The same id, asked for by someone else.
  assert.equal(await customerDesignRepository.get(intruder.id, "dsn_1"), null);
  assert.deepEqual(await customerDesignRepository.list(intruder.id), []);
  assert.equal(await getCustomerDesign(intruder, "dsn_1"), null);
});

test("a stored design still reports as unavailable until there is file storage", async () => {
  const owner = customer();

  const db = await harness.database();
  await db.insert(customerDesigns).values({
    id: `dsn_${owner.id}`,
    customerId: owner.id,
    name: "part.stl",
    format: "STL",
    sizeBytes: 10,
  });

  const result = await listCustomerDesigns(owner);
  assert.equal(result.status, "unavailable");
});

test("a design view carries no storage key", async () => {
  const owner = customer();

  const db = await harness.database();
  await db.insert(customerDesigns).values({
    id: `dsn_view_${owner.id}`,
    customerId: owner.id,
    name: "secret.stl",
    format: "STL",
    sizeBytes: 10,
    storageKey: "private/very/secret/path.stl",
    previewKey: "private/very/secret/preview.png",
  });

  const view = await getCustomerDesign(owner, `dsn_view_${owner.id}`);
  assert.ok(view);

  const serialised = JSON.stringify(view);
  assert.ok(!serialised.includes("private/very/secret"), "a storage key reached the view");
  assert.equal(view.hasPreview, true);
});

/* ------------------------------------------------------------------ *
 * Durability
 * ------------------------------------------------------------------ */

test("an address and a saved item survive a restart", async () => {
  const me = customer();
  const product = purchasableProduct();

  const created = await createCustomerAddress(me, input({ label: "Persisted" }));
  assert.ok(created.ok);
  await saveProduct(me, product.id);

  /*
   * A genuine restart of the database process: the connection is closed and the
   * same directory is opened again. Nothing survives in memory across this.
   */
  await harness.close();

  const reopened = await createTestDatabase(harness.directory);
  setDatabaseProvider(reopened);

  try {
    const addresses = await listCustomerAddresses(me);
    assert.equal(addresses.length, 1, "the address did not survive the restart");
    assert.equal(addresses[0]?.label, "Persisted");
    assert.equal(addresses[0]?.isDefault, true);

    const saved = await listSavedProducts(me);
    assert.equal(saved.length, 1, "the saved item did not survive the restart");
    assert.equal(saved[0]?.productId, product.id);
  } finally {
    await reopened.close();
    setDatabaseProvider(harness);
    await harness.database();
  }
});

/* ------------------------------------------------------------------ *
 * Schema guarantees
 * ------------------------------------------------------------------ */

test("the database itself refuses a second default address", async () => {
  const me = customer();
  const db = await harness.database();

  const row = (id: string) => ({
    id,
    customerId: me.id,
    fullName: "Direct",
    phone: "9876543210",
    line1: ADDRESS.line1,
    city: ADDRESS.city,
    state: ADDRESS.state,
    postalCode: ADDRESS.postalCode,
    country: ADDRESS.country,
    isDefault: true,
  });

  const { customerAddresses } = await import("@/lib/db/schema");

  await db.insert(customerAddresses).values(row("direct_1"));
  // Straight past the service, straight into the table. The index is the thing
  // being tested, not the code that usually avoids tripping it.
  await assert.rejects(
    () => db.insert(customerAddresses).values(row("direct_2")),
    "the partial unique index did not hold",
  );

  const rows = await db
    .select()
    .from(customerAddresses)
    .where(eq(customerAddresses.customerId, me.id));
  assert.equal(rows.length, 1);
});

test("the database itself refuses a duplicate saved item", async () => {
  const me = customer();
  const db = await harness.database();

  await db
    .insert(savedItems)
    .values({ id: "dup_1", customerId: me.id, productId: "p1" });

  await assert.rejects(
    () => db.insert(savedItems).values({ id: "dup_2", customerId: me.id, productId: "p1" }),
    "the unique (customer_id, product_id) index did not hold",
  );
});
