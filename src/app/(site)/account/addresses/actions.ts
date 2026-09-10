"use server";

import { revalidatePath } from "next/cache";

import {
  createCustomerAddress,
  deleteCustomerAddress,
  setDefaultCustomerAddress,
  updateCustomerAddress,
} from "@/lib/account/addresses";
import { requireCustomerContext } from "@/lib/account/identity";
import type { CustomerAddressInput } from "@/lib/account/types";
import type { FieldError } from "@/lib/checkout/types";

/**
 * Address actions.
 *
 * Every one resolves the customer here, on the server, from the auth adapter.
 * The browser sends address fields and an address id; it never sends a customer
 * id, and there is no parameter it could put one in.
 *
 * The address id it does send is only ever looked up **within** the calling
 * customer's own set — `customerAddressRepository.get(customerId, addressId)`
 * takes both, so an id belonging to someone else finds nothing rather than
 * finding a record that then has to be checked. An id from another customer is
 * therefore not an authorization failure to get right; it is a lookup that
 * misses.
 *
 * What comes back to the browser is the outcome and, where the form was wrong,
 * the field errors. Never a stored record, and never anything about a customer
 * who is not the caller.
 */

export type AddressActionResult =
  | { ok: true }
  | { ok: false; message?: string; errors?: readonly FieldError[] };

const SIGNED_OUT: AddressActionResult = {
  ok: false,
  message: "Sign in to manage your addresses.",
};

/** Re-renders the list from the server after any change. */
function refresh(): void {
  revalidatePath("/account/addresses");
}

export async function createAddressAction(
  input: CustomerAddressInput,
): Promise<AddressActionResult> {
  const gate = await requireCustomerContext();
  if (!gate.authenticated) return SIGNED_OUT;

  const result = await createCustomerAddress(gate.context.identity, input);
  if (!result.ok) return result;

  refresh();
  return { ok: true };
}

export async function updateAddressAction(
  addressId: string,
  input: CustomerAddressInput,
): Promise<AddressActionResult> {
  const gate = await requireCustomerContext();
  if (!gate.authenticated) return SIGNED_OUT;

  const result = await updateCustomerAddress(
    gate.context.identity,
    addressId,
    input,
  );
  if (!result.ok) return result;

  refresh();
  return { ok: true };
}

export async function deleteAddressAction(
  addressId: string,
): Promise<AddressActionResult> {
  const gate = await requireCustomerContext();
  if (!gate.authenticated) return SIGNED_OUT;

  const result = await deleteCustomerAddress(gate.context.identity, addressId);
  if (!result.ok) return result;

  refresh();
  return { ok: true };
}

export async function setDefaultAddressAction(
  addressId: string,
): Promise<AddressActionResult> {
  const gate = await requireCustomerContext();
  if (!gate.authenticated) return SIGNED_OUT;

  const result = await setDefaultCustomerAddress(gate.context.identity, addressId);
  if (!result.ok) return result;

  refresh();
  return { ok: true };
}
