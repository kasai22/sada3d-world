import assert from "node:assert/strict";
import { test } from "node:test";

import { PRODUCTS } from "@/lib/catalog/products";
import { isQuoteOnly } from "@/lib/catalog/query";
import type { ShippingAddress } from "@/lib/checkout/types";
import { orderRepository } from "@/lib/orders/repository";
import { aggregateOrderStatus } from "@/lib/orders/aggregate";
import { createManufacturingJobs, applyManufacturingEvent } from "@/lib/orders/service";
import type { Order, OrderItem } from "@/lib/orders/types";

import {
  createCustomerAddress,
  deleteCustomerAddress,
  listCustomerAddresses,
  setDefaultCustomerAddress,
  updateCustomerAddress,
  validateCustomerAddress,
  withSingleDefault,
} from "./addresses";
import { listCustomerDesigns } from "./designs";
import {
  developmentCustomerAuth,
  getCustomerContext,
  noCustomerAuth,
  requireCustomerContext,
} from "./identity";
import { ACCOUNT_SECTIONS, activeSection, isSectionActive } from "./navigation";
import {
  getCustomerOrder,
  listActiveManufacturing,
  listCustomerOrders,
  matchesOrderFilter,
  ownsOrder,
  parseOrderFilter,
} from "./orders";
import { safeReturnPath, signInHref } from "./routes";
import { listSavedProducts, removeSavedProduct, saveProduct } from "./saved";
import type { CustomerAddress, CustomerIdentity } from "./types";

/**
 * Account tests.
 *
 * The security-sensitive behaviour is tested first and most: ownership, the
 * absence of an identity, and the redirect target. Those are the three places
 * where a mistake exposes one customer's data to another.
 */

const ALICE: CustomerIdentity = { id: "cus_alice" };
const BOB: CustomerIdentity = { id: "cus_bob" };

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

let sequence = 0;

const ADDRESS: ShippingAddress = {
  line1: "42 Industrial Estate",
  city: "Hyderabad",
  state: "TG",
  postalCode: "500032",
  country: "IN",
};

/** A real, purchasable catalog part. Saved items reference the catalog. */
function catalogProduct() {
  const product = PRODUCTS.find((entry) => !isQuoteOnly(entry));
  assert.ok(product, "the catalog has no purchasable product to save");
  return product;
}

function orderItem(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    id: `item-${(sequence += 1)}`,
    type: "catalog",
    name: "Precision Gear",
    spec: "PLA / BLACK",
    quantity: 1,
    unitPrice: 399,
    lineTotal: 399,
    fulfillmentStatus: "pending",
    ...overrides,
  };
}

/** Builds a stored order. Ownership is the only thing that varies. */
async function storeOrder(
  customerId: string | undefined,
  items: OrderItem[] = [orderItem()],
): Promise<Order> {
  // The shape the system issues. A reference in any other shape names no order
  // (`lib/orders/reference`); 900000+ keeps clear of references a test checkout
  // draws from the counter.
  const reference = `S3D-${900_000 + (sequence += 1)}`;
  const payment = { status: "paid" as const };

  const order: Order = {
    reference,
    cartId: `cart_${reference}`,
    customerId,
    status: aggregateOrderStatus({ items, payment }),
    payment,
    items,
    shipments: [],
    totals: {
      currency: "INR",
      subtotal: items.reduce((sum, item) => sum + item.lineTotal, 0),
      shipping: { known: false, reason: "Confirmed before dispatch" },
      tax: { known: false, reason: "Added on the tax invoice" },
      total: items.reduce((sum, item) => sum + item.lineTotal, 0),
      excluded: ["Shipping", "GST"],
      unitCount: items.length,
      provisional: true,
    },
    contact: { name: "Test Customer", email: "test@example.com", phone: "9876543210" },
    address: ADDRESS,
    placedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    provisional: true,
  };

  await orderRepository.createOrder(order);
  return order;
}

/* ------------------------------------------------------------------ *
 * Ownership
 * ------------------------------------------------------------------ */

test("an order belongs to the customer whose id it carries", async () => {
  const order = await storeOrder(ALICE.id);

  assert.equal(ownsOrder(order, ALICE), true);
  assert.equal(ownsOrder(order, BOB), false);
});

test("a guest order belongs to no account", async () => {
  const order = await storeOrder(undefined);

  assert.equal(ownsOrder(order, ALICE), false);
  assert.equal(ownsOrder(order, BOB), false);
  // The bug this guards: undefined === undefined would match every customer.
  assert.equal(ownsOrder(order, { id: "" }), false);
});

test("an empty customer id owns nothing", async () => {
  const order = await storeOrder("");
  assert.equal(ownsOrder(order, { id: "" }), false);
});

test("customer A cannot read customer B's order", async () => {
  const order = await storeOrder(BOB.id);

  assert.equal(await getCustomerOrder(ALICE, order.reference), undefined);
  assert.notEqual(await getCustomerOrder(BOB, order.reference), undefined);
});

test("an unknown reference and someone else's order give the same answer", async () => {
  const order = await storeOrder(BOB.id);

  const foreign = await getCustomerOrder(ALICE, order.reference);
  const missing = await getCustomerOrder(ALICE, "TEST-DOES-NOT-EXIST");

  assert.equal(foreign, undefined);
  assert.equal(missing, undefined);
});

test("an order list holds only this customer's orders", async () => {
  const mine = await storeOrder(ALICE.id);
  const theirs = await storeOrder(BOB.id);
  const guest = await storeOrder(undefined);

  const references = (await listCustomerOrders(ALICE)).map((order) => order.reference);

  assert.ok(references.includes(mine.reference));
  assert.ok(!references.includes(theirs.reference));
  assert.ok(!references.includes(guest.reference));
});

test("a customer with no orders gets an empty list, not everyone's", async () => {
  await storeOrder(BOB.id);
  const orders = await listCustomerOrders({ id: "cus_nobody" });

  assert.deepEqual(orders, []);
});

/* ------------------------------------------------------------------ *
 * Order mapping
 * ------------------------------------------------------------------ */

test("a summary counts units, not lines", async () => {
  const order = await storeOrder(ALICE.id, [
    orderItem({ quantity: 2 }),
    orderItem({ quantity: 3, name: "Bracket" }),
  ]);

  const summary = (await listCustomerOrders(ALICE)).find(
    (entry) => entry.reference === order.reference,
  );

  assert.equal(summary?.lineCount, 2);
  assert.equal(summary?.unitCount, 5);
  assert.equal(summary?.summary, "Precision Gear + 1 more");
});

test("an order with nothing in production carries no manufacturing roll-up", async () => {
  const order = await storeOrder(ALICE.id);

  const summary = (await listCustomerOrders(ALICE)).find(
    (entry) => entry.reference === order.reference,
  );

  assert.equal(summary?.manufacturing, undefined);
});

test("the roll-up reports the least advanced part still being made", async () => {
  const order = await storeOrder(ALICE.id, [
    orderItem({ type: "custom", name: "a.stl" }),
    orderItem({ type: "custom", name: "b.stl" }),
  ]);

  await createManufacturingJobs(order);
  const jobs = await orderRepository.findJobsForOrder(order.reference);
  const [first, second] = jobs;
  assert.ok(first && second);

  // One part reaches printing; the other stays where it started.
  for (const type of [
    "DESIGN_REVIEW_STARTED",
    "DESIGN_APPROVED",
    "FILE_PREPARED",
    "MATERIAL_PREPARED",
    "PRINT_STARTED",
  ] as const) {
    const result = await applyManufacturingEvent(first.id, { type });
    assert.equal(result.ok, true);
  }

  const summary = (await listCustomerOrders(ALICE)).find(
    (entry) => entry.reference === order.reference,
  );

  assert.equal(summary?.manufacturing?.itemsInProduction, 2);
  // design_verified, not printing: the order is waiting on the slower part.
  assert.equal(summary?.manufacturing?.stage, "design_verified");
});

test("active manufacturing lists one entry per part, not per order", async () => {
  const order = await storeOrder(ALICE.id, [
    orderItem({ type: "custom", name: "left.stl" }),
    orderItem({ type: "custom", name: "right.stl" }),
  ]);
  await createManufacturingJobs(order);

  const active = (await listActiveManufacturing(ALICE)).filter(
    (entry) => entry.orderReference === order.reference,
  );

  assert.equal(active.length, 2);
  assert.deepEqual(
    active.map((entry) => entry.itemName).sort(),
    ["left.stl", "right.stl"],
  );
});

test("active manufacturing exposes no internal manufacturing fields", async () => {
  const order = await storeOrder(ALICE.id, [orderItem({ type: "custom", name: "x.stl" })]);
  await createManufacturingJobs(order);

  const entry = (await listActiveManufacturing(ALICE)).find(
    (item) => item.orderReference === order.reference,
  );
  assert.ok(entry);

  const keys = Object.keys(entry);
  for (const forbidden of ["state", "machineId", "actor", "note", "events", "reworkCount"]) {
    assert.ok(!keys.includes(forbidden), `${forbidden} must not reach the customer`);
  }
});

/* ------------------------------------------------------------------ *
 * Filters
 * ------------------------------------------------------------------ */

test("every order status falls into exactly one filter bucket", () => {
  const statuses = [
    "pending",
    "awaiting_payment",
    "confirmed",
    "fulfillment_in_progress",
    "partially_fulfilled",
    "fulfilled",
    "cancelled",
    "failed",
  ] as const;

  for (const status of statuses) {
    const matches = (["active", "completed", "closed"] as const).filter((filter) =>
      matchesOrderFilter(status, filter),
    );

    assert.equal(matches.length, 1, `${status} matched ${matches.length} buckets`);
    assert.equal(matchesOrderFilter(status, "all"), true);
  }
});

test("an unknown filter reads as all rather than as nothing", () => {
  assert.equal(parseOrderFilter(undefined), "all");
  assert.equal(parseOrderFilter("nonsense"), "all");
  assert.equal(parseOrderFilter("active"), "active");
});

/* ------------------------------------------------------------------ *
 * Identity
 * ------------------------------------------------------------------ */

test("the production adapter has no customer", async () => {
  assert.equal(await noCustomerAuth.currentCustomer(), null);
});

test("the development adapter is disabled in a production build", async () => {
  const original = process.env.NODE_ENV;

  try {
    // Reflect rather than assignment: NODE_ENV is typed read-only, and this
    // test exists precisely to prove what a production build does.
    Reflect.set(process.env, "NODE_ENV", "production");

    assert.equal(await developmentCustomerAuth.currentCustomer(), null);
    assert.equal((await getCustomerContext()).identity, null);
    assert.equal((await requireCustomerContext()).authenticated, false);

    // And no environment variable can switch it back on.
    process.env.SADA_DEV_ACCOUNT = "1";
    assert.equal(await developmentCustomerAuth.currentCustomer(), null);
  } finally {
    if (original === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
    else Reflect.set(process.env, "NODE_ENV", original);
    delete process.env.SADA_DEV_ACCOUNT;
  }
});

test("a context without an identity is never authenticated", async () => {
  const original = process.env.SADA_DEV_ACCOUNT;

  try {
    process.env.SADA_DEV_ACCOUNT = "0";
    const gate = await requireCustomerContext();
    assert.equal(gate.authenticated, false);
  } finally {
    if (original === undefined) delete process.env.SADA_DEV_ACCOUNT;
    else process.env.SADA_DEV_ACCOUNT = original;
  }
});

/* ------------------------------------------------------------------ *
 * Navigation
 * ------------------------------------------------------------------ */

test("a nested order path is in the orders section, not the overview", () => {
  assert.equal(activeSection("/account/orders/S3D-000184")?.href, "/account/orders");
  assert.equal(activeSection("/account/orders")?.href, "/account/orders");
  assert.equal(activeSection("/account")?.href, "/account");
  assert.equal(activeSection("/account/")?.href, "/account");
});

test("exactly one section is ever marked current", () => {
  for (const path of [
    "/account",
    "/account/orders",
    "/account/orders/S3D-000184",
    "/account/designs",
    "/account/saved",
    "/account/addresses",
    "/account/settings",
  ]) {
    const current = ACCOUNT_SECTIONS.filter((section) =>
      isSectionActive(path, section),
    );
    assert.equal(current.length, 1, `${path} marked ${current.length} sections`);
  }
});

test("a path outside the account marks nothing current", () => {
  assert.equal(activeSection("/shop"), undefined);
});

/* ------------------------------------------------------------------ *
 * Sign-in return path
 * ------------------------------------------------------------------ */

test("only account paths survive as a return path", () => {
  assert.equal(safeReturnPath("/account"), "/account");
  assert.equal(safeReturnPath("/account/orders"), "/account/orders");

  for (const hostile of [
    "https://elsewhere.example",
    "//elsewhere.example",
    "/\\elsewhere.example",
    "\\\\elsewhere.example",
    "/shop",
    "/accountant",
    "javascript:alert(1)",
    "/account\nSet-Cookie: x=1",
    "",
    undefined,
    null,
  ]) {
    assert.equal(safeReturnPath(hostile), undefined, `${String(hostile)} was accepted`);
  }
});

test("the sign-in link drops an unsafe return path rather than failing", () => {
  assert.equal(signInHref("https://elsewhere.example"), "/login");
  assert.equal(signInHref("/account/orders"), "/login?next=%2Faccount%2Forders");
  assert.equal(signInHref(), "/login");
});

/* ------------------------------------------------------------------ *
 * Addresses
 * ------------------------------------------------------------------ */

const addressInput = (overrides: Record<string, unknown> = {}) => ({
  fullName: "Test Customer",
  phone: "9876543210",
  address: { ...ADDRESS },
  ...overrides,
});

test("a malformed address is refused field by field", () => {
  const errors = validateCustomerAddress({
    fullName: "",
    phone: "123",
    address: { ...ADDRESS, city: "", postalCode: "00000", state: "ZZ" },
  });

  const fields = errors.map((error) => error.field);
  assert.ok(fields.includes("fullName"));
  assert.ok(fields.includes("phone"));
  assert.ok(fields.includes("address.city"));
  assert.ok(fields.includes("address.postalCode"));
  assert.ok(fields.includes("address.state"));
});

test("a well-formed address passes", () => {
  assert.deepEqual(validateCustomerAddress(addressInput()), []);
});

test("the first address saved becomes the default", async () => {
  const customer: CustomerIdentity = { id: `cus_${(sequence += 1)}` };

  const result = await createCustomerAddress(customer, addressInput());
  assert.equal(result.ok, true);
  assert.ok(result.ok && result.addresses[0]?.isDefault);
});

test("a customer has exactly one default address, always", async () => {
  const customer: CustomerIdentity = { id: `cus_${(sequence += 1)}` };

  await createCustomerAddress(customer, addressInput({ label: "One" }));
  await createCustomerAddress(customer, addressInput({ label: "Two", isDefault: true }));
  await createCustomerAddress(customer, addressInput({ label: "Three" }));

  const addresses = await listCustomerAddresses(customer);
  assert.equal(addresses.filter((address) => address.isDefault).length, 1);
  assert.equal(addresses[0]?.label, "Two");
});

test("deleting the default promotes another address", async () => {
  const customer: CustomerIdentity = { id: `cus_${(sequence += 1)}` };

  await createCustomerAddress(customer, addressInput({ label: "One" }));
  await createCustomerAddress(customer, addressInput({ label: "Two" }));

  const before = await listCustomerAddresses(customer);
  const defaultAddress = before.find((address) => address.isDefault);
  assert.ok(defaultAddress);

  const result = await deleteCustomerAddress(customer, defaultAddress.id);
  assert.equal(result.ok, true);

  const after = await listCustomerAddresses(customer);
  assert.equal(after.length, 1);
  assert.equal(after.filter((address) => address.isDefault).length, 1);
});

test("deleting the last address leaves no default to promote", async () => {
  const customer: CustomerIdentity = { id: `cus_${(sequence += 1)}` };

  const created = await createCustomerAddress(customer, addressInput());
  assert.ok(created.ok);

  const only = created.addresses[0];
  assert.ok(only);

  await deleteCustomerAddress(customer, only.id);
  assert.deepEqual(await listCustomerAddresses(customer), []);
});

test("customer A cannot read, edit, delete or re-default customer B's address", async () => {
  const owner: CustomerIdentity = { id: `cus_${(sequence += 1)}` };
  const intruder: CustomerIdentity = { id: `cus_${(sequence += 1)}` };

  const created = await createCustomerAddress(owner, addressInput());
  assert.ok(created.ok);
  const target = created.addresses[0];
  assert.ok(target);

  assert.deepEqual(await listCustomerAddresses(intruder), []);

  const updated = await updateCustomerAddress(intruder, target.id, addressInput());
  assert.equal(updated.ok, false);

  const promoted = await setDefaultCustomerAddress(intruder, target.id);
  assert.equal(promoted.ok, false);

  const deleted = await deleteCustomerAddress(intruder, target.id);
  assert.equal(deleted.ok, false);

  // Untouched by every one of those attempts.
  assert.equal((await listCustomerAddresses(owner)).length, 1);
});

test("withSingleDefault leaves an empty set empty", () => {
  assert.deepEqual(withSingleDefault([]), []);
});

test("withSingleDefault repairs a set that somehow has none", () => {
  const base: CustomerAddress = {
    id: "a",
    customerId: "c",
    fullName: "A",
    phone: "9876543210",
    address: ADDRESS,
    isDefault: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  const repaired = withSingleDefault([base, { ...base, id: "b" }]);
  assert.equal(repaired.filter((address) => address.isDefault).length, 1);
  assert.equal(repaired[0]?.isDefault, true);
});

/* ------------------------------------------------------------------ *
 * Designs
 * ------------------------------------------------------------------ */

test("designs report as unavailable rather than as empty", async () => {
  const result = await listCustomerDesigns(ALICE);

  assert.equal(result.status, "unavailable");
  assert.ok(result.status === "unavailable" && result.reason.length > 0);
});

/* ------------------------------------------------------------------ *
 * Saved items
 * ------------------------------------------------------------------ */

test("a customer starts with nothing saved", async () => {
  assert.deepEqual(await listSavedProducts({ id: `cus_${(sequence += 1)}` }), []);
});

test("saving a product that is not in the catalog is refused", async () => {
  const result = await saveProduct(ALICE, "no-such-product");
  assert.equal(result.ok, false);
});

test("saved items are private to the customer who saved them", async () => {
  const owner: CustomerIdentity = { id: `cus_${(sequence += 1)}` };
  const other: CustomerIdentity = { id: `cus_${(sequence += 1)}` };

  const product = catalogProduct();

  const saved = await saveProduct(owner, product.id);
  assert.equal(saved.ok, true);

  assert.equal((await listSavedProducts(owner)).length, 1);
  assert.deepEqual(await listSavedProducts(other), []);

  // Removing from one customer does not touch another's list.
  await removeSavedProduct(other, product.id);
  assert.equal((await listSavedProducts(owner)).length, 1);
});

test("saving the same product twice saves it once", async () => {
  const customer: CustomerIdentity = { id: `cus_${(sequence += 1)}` };

  const product = catalogProduct();

  await saveProduct(customer, product.id);
  await saveProduct(customer, product.id);

  assert.equal((await listSavedProducts(customer)).length, 1);
});
