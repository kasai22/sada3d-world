import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createAddressAction,
  deleteAddressAction,
  setDefaultAddressAction,
  updateAddressAction,
} from "@/app/(site)/account/addresses/actions";
import {
  removeSavedItemAction,
  saveItemAction,
} from "@/app/(site)/account/saved/actions";
import { PRODUCTS } from "@/lib/catalog/products";
import type { ShippingAddress } from "@/lib/checkout/types";

import { listCustomerAddresses } from "./addresses";
import { DEVELOPMENT_CUSTOMER_ID } from "./development";
import { listSavedProducts } from "./saved";

/**
 * Server-action authorization.
 *
 * Every account mutation is reachable from a browser, so every one of them is
 * tested for the same thing: **a caller with no identity changes nothing**.
 *
 * These run with the development identity switched off, which is the state a
 * production build is permanently in. If any of them started succeeding, an
 * unauthenticated request would be writing to a customer's record.
 */

const ADDRESS: ShippingAddress = {
  line1: "42 Industrial Estate",
  city: "Hyderabad",
  state: "TG",
  postalCode: "500032",
  country: "IN",
};

const INPUT = {
  fullName: "Someone Else",
  phone: "9876543210",
  address: ADDRESS,
};

/** Runs work with no signed-in customer, and restores the environment after. */
async function signedOut<T>(work: () => Promise<T>): Promise<T> {
  const original = process.env.SADA_DEV_ACCOUNT;
  process.env.SADA_DEV_ACCOUNT = "0";

  try {
    return await work();
  } finally {
    if (original === undefined) delete process.env.SADA_DEV_ACCOUNT;
    else process.env.SADA_DEV_ACCOUNT = original;
  }
}

test("no address action succeeds without an identity", async () => {
  await signedOut(async () => {
    for (const [name, run] of [
      ["create", () => createAddressAction(INPUT)],
      ["update", () => updateAddressAction("adr_x", INPUT)],
      ["delete", () => deleteAddressAction("adr_x")],
      ["setDefault", () => setDefaultAddressAction("adr_x")],
    ] as const) {
      const result = await run();
      assert.equal(result.ok, false, `${name} succeeded for a signed-out caller`);
      assert.equal(
        result.ok === false && result.message,
        "Sign in to manage your addresses.",
      );
    }
  });
});

test("a signed-out create writes nothing", async () => {
  await signedOut(async () => {
    await createAddressAction(INPUT);
  });

  // Checked against the development customer, the only identity this process
  // can produce: a signed-out call must not have written into anyone's book.
  const addresses = await listCustomerAddresses({ id: DEVELOPMENT_CUSTOMER_ID });
  assert.ok(
    !addresses.some((address) => address.fullName === "Someone Else"),
    "a signed-out call wrote an address",
  );
});

test("no saved-item action succeeds without an identity", async () => {
  const product = PRODUCTS[0];
  assert.ok(product);

  await signedOut(async () => {
    for (const run of [
      () => saveItemAction(product.id),
      () => removeSavedItemAction(product.id),
    ]) {
      const result = await run();
      assert.equal(result.ok, false);
      assert.equal(
        result.ok === false && result.message,
        "Sign in to change your saved parts.",
      );
    }
  });

  const saved = await listSavedProducts({ id: DEVELOPMENT_CUSTOMER_ID });
  assert.ok(
    !saved.some((item) => item.productId === product.id),
    "a signed-out call saved an item",
  );
});
