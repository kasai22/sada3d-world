import assert from "node:assert/strict";
import { test } from "node:test";

import { mockPaymentAdapter } from "@/lib/payment/adapters/mock";
import { resolvePaymentAdapter } from "@/lib/payment/service";
import { PaymentConfigurationError } from "@/lib/payment/types";

import {
  checkoutIdempotencyKey,
  memoryIdempotencyStore,
} from "./idempotency";
import { memoryOrderRepository } from "@/lib/orders/repository";
import { checkDestination, shippingPolicy, taxPolicy } from "./policies";
import {
  normaliseAddress,
  normaliseContact,
  validateAddress,
  validateContact,
} from "./validation";
import { EMPTY_ADDRESS, type Contact, type ShippingAddress } from "./types";
import type { Order } from "@/lib/orders/types";

const CONTACT: Contact = {
  name: "A Kumar",
  email: "a.kumar@example.com",
  phone: "9876543210",
};

const ADDRESS: ShippingAddress = {
  line1: "42 Industrial Estate",
  city: "Hyderabad",
  state: "TG",
  postalCode: "500032",
  country: "IN",
};

const field = (errors: { field: string }[], name: string) =>
  errors.some((error) => error.field === name);

/* ------------------------------------------------------------------ *
 * Contact
 * ------------------------------------------------------------------ */

test("a complete contact passes", () => {
  assert.deepEqual(validateContact(CONTACT), []);
});

test("a missing name is reported against the name", () => {
  assert.ok(field(validateContact({ ...CONTACT, name: "" }), "contact.name"));
});

test("an email without a domain is rejected", () => {
  assert.ok(field(validateContact({ ...CONTACT, email: "a.kumar@" }), "contact.email"));
  assert.ok(field(validateContact({ ...CONTACT, email: "not an email" }), "contact.email"));
});

test("an Indian mobile number is accepted with or without the country code", () => {
  assert.deepEqual(validateContact({ ...CONTACT, phone: "+91 98765 43210" }), []);
  assert.deepEqual(validateContact({ ...CONTACT, phone: "9876543210" }), []);
});

test("a number that is not an Indian mobile is rejected", () => {
  // Nine digits, and a ten-digit number starting outside the mobile range.
  assert.ok(field(validateContact({ ...CONTACT, phone: "987654321" }), "contact.phone"));
  assert.ok(field(validateContact({ ...CONTACT, phone: "1234567890" }), "contact.phone"));
});

/* ------------------------------------------------------------------ *
 * Address
 * ------------------------------------------------------------------ */

test("a complete Indian address passes", () => {
  assert.deepEqual(validateAddress(ADDRESS), []);
});

test("an unsupported destination is refused and nothing else is reported", () => {
  const errors = validateAddress({ ...ADDRESS, country: "US" });

  assert.equal(errors.length, 1);
  assert.ok(field(errors, "address.country"));
  assert.match(errors[0]?.message ?? "", /India only/i);
});

test("a PIN code must be six digits not starting with zero", () => {
  assert.ok(field(validateAddress({ ...ADDRESS, postalCode: "50003" }), "address.postalCode"));
  assert.ok(field(validateAddress({ ...ADDRESS, postalCode: "012345" }), "address.postalCode"));
  assert.ok(field(validateAddress({ ...ADDRESS, postalCode: "5000322" }), "address.postalCode"));
  assert.deepEqual(validateAddress({ ...ADDRESS, postalCode: "500032" }), []);
});

test("a state must be one that exists", () => {
  assert.ok(field(validateAddress({ ...ADDRESS, state: "ZZ" }), "address.state"));
  assert.ok(field(validateAddress({ ...ADDRESS, state: "" }), "address.state"));
});

test("an empty address reports every missing field at once", () => {
  const errors = validateAddress({ ...EMPTY_ADDRESS, country: "IN" });
  assert.ok(field(errors, "address.line1"));
  assert.ok(field(errors, "address.city"));
  assert.ok(field(errors, "address.state"));
  assert.ok(field(errors, "address.postalCode"));
});

test("input is trimmed and normalised before it is judged", () => {
  const contact = normaliseContact({
    name: "  A Kumar  ",
    email: "  A.Kumar@Example.COM ",
    phone: "98765 43210",
  });

  assert.equal(contact.email, "a.kumar@example.com");
  assert.equal(contact.phone, "9876543210");
  assert.equal(contact.name, "A Kumar");

  const address = normaliseAddress({ ...ADDRESS, state: "tg", country: "in" });
  assert.equal(address.state, "TG");
  assert.equal(address.country, "IN");
});

/* ------------------------------------------------------------------ *
 * Destination and policies
 * ------------------------------------------------------------------ */

test("India is served and nowhere else is", () => {
  assert.equal(checkDestination(ADDRESS).supported, true);
  assert.equal(checkDestination({ ...ADDRESS, country: "GB" }).supported, false);
});

test("shipping and tax report that they are not configured", () => {
  assert.equal(shippingPolicy.configured, false);
  assert.equal(taxPolicy.configured, false);
  assert.equal(shippingPolicy.quote(ADDRESS, []).known, false);
  assert.equal(taxPolicy.calculate(ADDRESS, 1000).known, false);
});

/* ------------------------------------------------------------------ *
 * Idempotency
 * ------------------------------------------------------------------ */

test("the same request derives the same key", () => {
  const input = {
    cartId: "cart_1",
    fingerprint: "catalog:p-001:pla:black:precisionx2",
    email: "a@b.co",
    postalCode: "500032",
  };

  assert.equal(checkoutIdempotencyKey(input), checkoutIdempotencyKey(input));
});

test("a different cart derives a different key", () => {
  const base = {
    cartId: "cart_1",
    fingerprint: "a",
    email: "a@b.co",
    postalCode: "500032",
  };

  assert.notEqual(checkoutIdempotencyKey(base), checkoutIdempotencyKey({ ...base, fingerprint: "b" }));
  assert.notEqual(checkoutIdempotencyKey(base), checkoutIdempotencyKey({ ...base, cartId: "cart_2" }));
});

test("a second reservation of the same key does not get through", async () => {
  const key = `test-${Math.random()}`;

  const first = await memoryIdempotencyStore.reserve(key);
  const second = await memoryIdempotencyStore.reserve(key);

  assert.equal(first.status, "reserved");
  assert.equal(second.status, "in_flight", "a duplicate request was allowed to proceed");
});

test("once an order is recorded the duplicate returns that order", async () => {
  const key = `test-${Math.random()}`;

  await memoryIdempotencyStore.reserve(key);
  await memoryIdempotencyStore.complete(key, "S3D-000001");

  const repeat = await memoryIdempotencyStore.reserve(key);
  assert.equal(repeat.status, "duplicate");
  assert.equal(
    repeat.status === "duplicate" ? repeat.orderReference : "",
    "S3D-000001",
  );
});

test("a released reservation can be retried", async () => {
  const key = `test-${Math.random()}`;

  await memoryIdempotencyStore.reserve(key);
  await memoryIdempotencyStore.release(key);

  assert.equal((await memoryIdempotencyStore.reserve(key)).status, "reserved");
});

/* ------------------------------------------------------------------ *
 * Orders
 * ------------------------------------------------------------------ */

test("order references are sequential and generated", async () => {
  const a = await memoryOrderRepository.nextReference();
  const b = await memoryOrderRepository.nextReference();

  assert.match(a, /^S3D-\d{6}$/);
  assert.notEqual(a, b);
});

test("an order can be read back by its reference", async () => {
  const reference = await memoryOrderRepository.nextReference();
  const order: Order = {
    reference,
    status: "confirmed",
    cartId: "cart_1",
    payment: { status: "paid" },
    items: [],
    shipments: [],
    totals: {
      currency: "INR",
      subtotal: 798,
      shipping: { known: false, reason: "x" },
      tax: { known: false, reason: "x" },
      total: 798,
      excluded: ["Shipping", "GST"],
      unitCount: 2,
      provisional: false,
    },
    contact: CONTACT,
    address: ADDRESS,
    placedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    provisional: true,
  };

  await memoryOrderRepository.createOrder(order);
  const found = await memoryOrderRepository.findOrder(reference);

  assert.equal(found?.reference, reference);
  assert.equal(found?.totals.total, 798);
});

/* ------------------------------------------------------------------ *
 * Payment
 * ------------------------------------------------------------------ */

test("the development adapter reports that it is a mock", () => {
  assert.equal(mockPaymentAdapter.mode, "mock");
  assert.equal(resolvePaymentAdapter().mode, "mock");
});

test("a mock session carries the amount it was given", async () => {
  const result = await mockPaymentAdapter.createSession({
    amount: 1036,
    currency: "INR",
    reference: "S3D-000001",
    idempotencyKey: "abcdef0123456789",
    customer: { name: "A Kumar", email: "a@b.co" },
  });

  assert.equal(result.status, "succeeded");
  assert.equal(result.status === "succeeded" ? result.session.amount : 0, 1036);
  assert.equal(result.status === "succeeded" ? result.session.mode : "", "mock");
});

test("a declining customer produces a failure, not an exception", async () => {
  const result = await mockPaymentAdapter.createSession({
    amount: 798,
    currency: "INR",
    reference: "S3D-000003",
    idempotencyKey: "k",
    customer: { name: "A", email: "decline@example.com" },
  });

  assert.equal(result.status, "failed");
  assert.equal(
    result.status === "failed" ? result.message : "",
    "Payment could not be completed.",
  );
});

test("a zero amount cannot start a payment", async () => {
  const result = await mockPaymentAdapter.createSession({
    amount: 0,
    currency: "INR",
    reference: "S3D-000002",
    idempotencyKey: "k",
    customer: { name: "A", email: "a@b.co" },
  });

  assert.equal(result.status, "failed");
});

test("a provider that is named but not implemented fails loudly", () => {
  const previous = process.env.PAYMENT_PROVIDER;
  process.env.PAYMENT_PROVIDER = "razorpay";

  try {
    assert.throws(() => resolvePaymentAdapter(), PaymentConfigurationError);
  } finally {
    if (previous === undefined) delete process.env.PAYMENT_PROVIDER;
    else process.env.PAYMENT_PROVIDER = previous;
  }
});
