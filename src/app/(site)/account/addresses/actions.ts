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
import {
  MAX_ID_LENGTH,
  UNREADABLE,
  asRecord,
  isOptionalText,
  isText,
} from "@/lib/api/action-input";
import { readShippingAddress } from "@/lib/checkout/input";
import type { FieldError } from "@/lib/checkout/types";
import { ValidationError } from "@/lib/errors";

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
 * Arguments are read as `unknown`: the id must be bounded text, and the address
 * is projected field by field (the address part through the same reader
 * checkout uses) before `normaliseCustomerAddress` and validation see it.
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

const REFUSED: AddressActionResult = { ok: false, message: UNREADABLE };

/** Re-renders the list from the server after any change. */
function refresh(): void {
  revalidatePath("/account/addresses");
}

type Parsed = { ok: true; input: CustomerAddressInput } | { ok: false; result: AddressActionResult };

function readAddressInput(value: unknown): Parsed {
  const raw = asRecord(value);
  if (
    !raw ||
    !isOptionalText(raw.label, 80) ||
    !isText(raw.fullName, 200) ||
    !isText(raw.phone, 32) ||
    !(raw.isDefault === undefined || typeof raw.isDefault === "boolean")
  ) {
    return { ok: false, result: REFUSED };
  }

  try {
    return {
      ok: true,
      input: {
        ...(typeof raw.label === "string" ? { label: raw.label } : {}),
        fullName: raw.fullName,
        phone: raw.phone,
        address: readShippingAddress(raw.address),
        ...(raw.isDefault === true ? { isDefault: true } : {}),
      },
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      return {
        ok: false,
        result: { ok: false, errors: error.issues.map(({ field, message }) => ({ field, message })) },
      };
    }
    throw error;
  }
}

export async function createAddressAction(input: unknown): Promise<AddressActionResult> {
  const parsed = readAddressInput(input);
  if (!parsed.ok) return parsed.result;

  const gate = await requireCustomerContext();
  if (!gate.authenticated) return SIGNED_OUT;

  const result = await createCustomerAddress(gate.context.identity, parsed.input);
  if (!result.ok) return result;

  refresh();
  return { ok: true };
}

export async function updateAddressAction(
  addressId: unknown,
  input: unknown,
): Promise<AddressActionResult> {
  if (!isText(addressId, MAX_ID_LENGTH)) return REFUSED;

  const parsed = readAddressInput(input);
  if (!parsed.ok) return parsed.result;

  const gate = await requireCustomerContext();
  if (!gate.authenticated) return SIGNED_OUT;

  const result = await updateCustomerAddress(gate.context.identity, addressId, parsed.input);
  if (!result.ok) return result;

  refresh();
  return { ok: true };
}

export async function deleteAddressAction(addressId: unknown): Promise<AddressActionResult> {
  if (!isText(addressId, MAX_ID_LENGTH)) return REFUSED;

  const gate = await requireCustomerContext();
  if (!gate.authenticated) return SIGNED_OUT;

  const result = await deleteCustomerAddress(gate.context.identity, addressId);
  if (!result.ok) return result;

  refresh();
  return { ok: true };
}

export async function setDefaultAddressAction(addressId: unknown): Promise<AddressActionResult> {
  if (!isText(addressId, MAX_ID_LENGTH)) return REFUSED;

  const gate = await requireCustomerContext();
  if (!gate.authenticated) return SIGNED_OUT;

  const result = await setDefaultCustomerAddress(gate.context.identity, addressId);
  if (!result.ok) return result;

  refresh();
  return { ok: true };
}
