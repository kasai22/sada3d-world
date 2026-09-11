import assert from "node:assert/strict";
import test from "node:test";

import { ValidationError } from "@/lib/errors";

import { parseCheckoutInput, readShippingAddress } from "./input";

const CONTACT = { name: "A Kumar", email: "a.kumar@example.com", phone: "9876543210" };
const ADDRESS = {
  line1: "42 Industrial Estate",
  city: "Hyderabad",
  state: "TG",
  postalCode: "500032",
  country: "IN",
};

function refusesField(field: string) {
  return (error: unknown) =>
    error instanceof ValidationError && error.issues.some((issue) => issue.field === field);
}

test("a well-formed checkout is read field for field", () => {
  const input = parseCheckoutInput({ contact: CONTACT, address: ADDRESS }, { strict: true });

  assert.equal(input.contact.email, CONTACT.email);
  assert.equal(input.address.postalCode, ADDRESS.postalCode);
  assert.equal(input.address.line2, undefined);
});

test("strict input refuses fields outside the vocabulary, by name, at every level", () => {
  assert.throws(
    () => parseCheckoutInput({ contact: CONTACT, address: ADDRESS, total: 1 }, { strict: true }),
    refusesField("total"),
  );
  assert.throws(
    () => parseCheckoutInput({ contact: { ...CONTACT, customerId: "cus_x" }, address: ADDRESS }, { strict: true }),
    refusesField("contact.customerId"),
  );
  assert.throws(
    () => parseCheckoutInput({ contact: CONTACT, address: { ...ADDRESS, price: 0 } }, { strict: true }),
    refusesField("address.price"),
  );
});

test("lenient input drops fields outside the vocabulary rather than passing them on", () => {
  const input = parseCheckoutInput({
    contact: { ...CONTACT, customerId: "cus_x" },
    address: { ...ADDRESS, price: 0 },
    total: 1,
  });

  assert.deepEqual(Object.keys(input).sort(), ["address", "contact"]);
  assert.equal("customerId" in input.contact, false);
  assert.equal("price" in input.address, false);
});

test("a value of the wrong type is refused rather than coerced", () => {
  assert.throws(
    () => parseCheckoutInput({ contact: { ...CONTACT, email: 42 }, address: ADDRESS }),
    refusesField("contact.email"),
  );
  assert.throws(
    () => parseCheckoutInput({ contact: CONTACT, address: { ...ADDRESS, postalCode: ["500032"] } }),
    refusesField("address.postalCode"),
  );
  assert.throws(() => parseCheckoutInput({ contact: [], address: ADDRESS }), refusesField("contact"));
  assert.throws(() => parseCheckoutInput("contact=x"), ValidationError);
});

test("an over-long value and a missing section are refused", () => {
  assert.throws(
    () => parseCheckoutInput({ contact: { ...CONTACT, name: "x".repeat(10_000) }, address: ADDRESS }),
    refusesField("contact.name"),
  );
  assert.throws(() => parseCheckoutInput({ address: ADDRESS }), refusesField("contact"));
  assert.throws(() => readShippingAddress(undefined), refusesField("address"));
});
