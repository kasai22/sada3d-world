import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { eq } from "drizzle-orm";

import { PRODUCTS } from "@/lib/catalog/products";
import { isQuoteOnly } from "@/lib/catalog/query";
import { catalogLineKey } from "@/lib/cart/identity";
import { postgresAccountCartStore } from "@/lib/cart/repository";
import type { CartTotals } from "@/lib/cart/types";
import { setDatabaseProvider } from "@/lib/db/client";
import { createTestDatabase, type TestDatabase } from "@/lib/db/pglite.testing";
import { customerCarts, customers } from "@/lib/db/schema";
import { NotFoundError } from "@/lib/errors";
import { cubeStl } from "@/lib/models/fixtures";
import { aggregateOrderStatus } from "@/lib/orders/aggregate";
import { orderRepository } from "@/lib/orders/repository";
import type { Order } from "@/lib/orders/types";
import { setStorageAdapter } from "@/lib/storage";
import { createMemoryStorage } from "@/lib/storage/memory.testing";
import { sha256Hex } from "@/lib/storage/stream";

import {
  createCustomerAddress,
  deleteCustomerAddress,
  listCustomerAddresses,
  updateCustomerAddress,
} from "./addresses";
import { CUSTOMER_ID_PATTERN, postgresCustomerDirectory } from "./customers";
import {
  authorizeDesignDownload,
  deleteCustomerDesign,
  designFileAvailability,
  readCustomerDesign,
} from "./design-files";
import { completeUpload, createUploadIntent } from "./design-uploads";
import { getCustomerOrder, listCustomerOrders } from "./orders";
import { listSavedProducts, removeSavedProduct, saveProduct } from "./saved";
import type { CustomerIdentity } from "./types";

/**
 * Identity mapping and authorization between two authenticated customers.
 *
 * Against PostgreSQL (PGlite, the committed migrations). Two provider subjects
 * are provisioned exactly as sign-in provisions them, and every customer
 * resource is then asked for by the wrong one. Supabase proves who someone is;
 * these tests prove the domain services still decide what they may touch.
 */

let harness: TestDatabase;
const storage = createMemoryStorage();
const directory = postgresCustomerDirectory();

before(async () => {
  harness = await createTestDatabase();
  setDatabaseProvider(harness);
  setStorageAdapter(storage);
});

after(async () => {
  setStorageAdapter(null);
  setDatabaseProvider(null);
  await harness.destroy();
});

async function signedInCustomer(): Promise<CustomerIdentity> {
  return { id: await directory.resolve("supabase", randomUUID()) };
}

/* ------------------------------------------------------------------ *
 * Provisioning
 * ------------------------------------------------------------------ */

test("a provider subject maps to the same customer every time", async () => {
  const subject = randomUUID();

  const first = await directory.resolve("supabase", subject);
  const second = await directory.resolve("supabase", subject);

  assert.match(first, CUSTOMER_ID_PATTERN);
  assert.equal(second, first);
});

test("concurrent first sign-ins for one user create exactly one customer", async () => {
  const subject = randomUUID();

  const ids = await Promise.all(
    Array.from({ length: 25 }, () => directory.resolve("supabase", subject)),
  );

  assert.equal(new Set(ids).size, 1, "two customer ids were issued for one user");

  const db = await harness.database();
  const rows = await db.select().from(customers).where(eq(customers.authSubject, subject));
  assert.equal(rows.length, 1);
});

test("different users are different customers, and the customer id is not the provider id", async () => {
  const a = randomUUID();
  const b = randomUUID();

  const idA = await directory.resolve("supabase", a);
  const idB = await directory.resolve("supabase", b);

  assert.notEqual(idA, idB);
  assert.ok(!idA.includes(a), "the provider's id leaked into the customer id");
});

test("an unknown provider or a malformed subject is refused", async () => {
  await assert.rejects(() => directory.resolve("github", randomUUID()));
  await assert.rejects(() => directory.resolve("supabase", ""));
  await assert.rejects(() => directory.resolve("supabase", "x".repeat(256)));
});

/* ------------------------------------------------------------------ *
 * Customer A cannot reach customer B
 * ------------------------------------------------------------------ */

const ADDRESS_INPUT = {
  fullName: "Customer A",
  phone: "9876543210",
  address: {
    line1: "42 Industrial Estate",
    city: "Hyderabad",
    state: "TG",
    postalCode: "500032",
    country: "IN",
  },
};

test("customer B cannot change or delete customer A's address", async () => {
  const alice = await signedInCustomer();
  const bob = await signedInCustomer();

  assert.ok((await createCustomerAddress(alice, ADDRESS_INPUT)).ok);
  const [address] = await listCustomerAddresses(alice);
  assert.ok(address);

  const updated = await updateCustomerAddress(bob, address.id, { ...ADDRESS_INPUT, fullName: "Bob" });
  const deleted = await deleteCustomerAddress(bob, address.id);

  assert.equal(updated.ok, false);
  assert.equal(deleted.ok, false);
  assert.deepEqual(await listCustomerAddresses(bob), []);

  const [unchanged] = await listCustomerAddresses(alice);
  assert.equal(unchanged?.fullName, "Customer A");
});

test("customer B cannot see or remove customer A's saved parts", async () => {
  const alice = await signedInCustomer();
  const bob = await signedInCustomer();
  const product = PRODUCTS.find((entry) => !isQuoteOnly(entry));
  assert.ok(product);

  assert.ok((await saveProduct(alice, product.id)).ok);
  await removeSavedProduct(bob, product.id);

  assert.deepEqual(await listSavedProducts(bob), []);
  assert.equal((await listSavedProducts(alice)).length, 1, "Bob removed Alice's saved part");
});

test("customer B cannot see customer A's order", async () => {
  const alice = await signedInCustomer();
  const bob = await signedInCustomer();

  const totals: CartTotals = {
    currency: "INR",
    subtotal: 399,
    shipping: { known: false, reason: "Confirmed before dispatch" },
    tax: { known: false, reason: "Added on the tax invoice" },
    total: 399,
    excluded: ["Shipping", "GST"],
    unitCount: 1,
    provisional: true,
  };
  const items = [
    {
      id: `item-${randomUUID()}`,
      type: "catalog" as const,
      name: "Precision Gear",
      spec: "PLA / BLACK",
      quantity: 1,
      unitPrice: 399,
      lineTotal: 399,
      fulfillmentStatus: "pending" as const,
    },
  ];
  const payment = { status: "paid" as const, provider: "mock" };
  const reference = await orderRepository.nextReference();
  const now = new Date().toISOString();

  const order: Order = {
    reference,
    cartId: `cart_${reference}`,
    customerId: alice.id,
    status: aggregateOrderStatus({ items, payment }),
    payment,
    items,
    shipments: [],
    totals,
    contact: { name: "A", email: "a@example.com", phone: "9876543210" },
    address: ADDRESS_INPUT.address,
    placedAt: now,
    updatedAt: now,
    provisional: true,
  };
  await orderRepository.createOrder(order);

  assert.ok(await getCustomerOrder(alice, reference));
  assert.equal(await getCustomerOrder(bob, reference), undefined);
  assert.ok(!(await listCustomerOrders(bob)).some((summary) => summary.reference === reference));
});

test("customer B cannot read, download, order or delete customer A's design", async () => {
  const alice = await signedInCustomer();
  const bob = await signedInCustomer();
  const bytes = cubeStl(23);

  const intent = await createUploadIntent(alice, {
    fileName: "private.stl",
    sizeBytes: bytes.byteLength,
    sha256: sha256Hex(bytes),
  });
  assert.equal(intent.status, "upload_required");
  assert.ok(intent.status === "upload_required");
  storage.upload(intent.upload, bytes);
  const { design } = await completeUpload(alice, intent.design.id);

  for (const attempt of [
    () => authorizeDesignDownload(bob, design.id),
    () => readCustomerDesign(bob, design.id),
    () => deleteCustomerDesign(bob, design.id),
  ]) {
    await assert.rejects(attempt, NotFoundError);
  }

  assert.equal((await designFileAvailability(bob, design.id, { verifyObject: true })).durable, false);

  // Alice's file is untouched and still hers.
  assert.ok(await authorizeDesignDownload(alice, design.id));
  assert.ok(storage.objects.has(design.fileKey));
});

/* ------------------------------------------------------------------ *
 * Account carts
 * ------------------------------------------------------------------ */

test("a customer's cart is theirs alone and survives a new session", async () => {
  const alice = await signedInCustomer();
  const bob = await signedInCustomer();
  const product = PRODUCTS.find((entry) => !isQuoteOnly(entry));
  assert.ok(product);

  const configuration = { material: product.material, color: product.color ?? "black" };
  const line = {
    type: "catalog" as const,
    id: catalogLineKey({ productId: product.id, configuration }),
    productId: product.id,
    quantity: 2,
    configuration,
    priceAtAdd: product.price,
    addedAt: new Date().toISOString(),
  };

  await postgresAccountCartStore.save(alice.id, {
    cart: { id: "cart-alice", lines: [line], updatedAt: new Date().toISOString() },
    mergedGuestCartIds: ["guest-1"],
  });

  const restored = await postgresAccountCartStore.load(alice.id);
  assert.equal(restored.cart.id, "cart-alice");
  assert.equal(restored.cart.lines[0]?.quantity, 2);
  assert.deepEqual(restored.mergedGuestCartIds, ["guest-1"]);

  const other = await postgresAccountCartStore.load(bob.id);
  assert.equal(other.cart.lines.length, 0);
  assert.notEqual(other.cart.id, "cart-alice");
});

test("a stored cart is re-validated on load like a cookie", async () => {
  const carol = await signedInCustomer();
  const db = await harness.database();

  await db.insert(customerCarts).values({
    customerId: carol.id,
    cartId: "cart-carol",
    lines: [
      { type: "catalog", id: 7, productId: null },
      { type: "custom", id: "x", quantity: -3 },
      { type: "catalog", id: "ok", productId: "p", quantity: 1, configuration: { material: "pla", color: "black" }, priceAtAdd: 1 },
    ],
    mergedGuestCartIds: Array.from({ length: 30 }, (_, index) => `guest-${index}`),
  });

  const loaded = await postgresAccountCartStore.load(carol.id);

  assert.equal(loaded.cart.lines.length, 1, "a malformed stored line was accepted");
  assert.equal(loaded.mergedGuestCartIds.length, 20);
});
