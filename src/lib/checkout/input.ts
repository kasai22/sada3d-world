import { rejectUnknownFields, requireRecord } from "@/lib/api/respond";
import { ValidationError } from "@/lib/errors";

import { EMPTY_ADDRESS, EMPTY_CONTACT } from "./types";
import type { CheckoutInput, Contact, ShippingAddress } from "./types";

/**
 * Checkout input, from a request.
 *
 * One reader for the two ways a checkout arrives — the JSON API and the
 * checkout form's server action — so they cannot disagree about what a contact
 * or an address is. It checks shape only: every field text, every field
 * bounded. Whether an email looks like an email or a PIN code exists is
 * `validation.ts`, which runs after this.
 *
 *   strict    the API: a field outside the vocabulary is refused by name
 *   lenient   the form's action: a field outside it is dropped, never passed on
 *
 * Either way, there is nothing in the result a request can use to set a price,
 * a product or an owner — those fields do not exist in `CheckoutInput`.
 */

/** Field → the longest value accepted. Generous; normalisation trims further. */
const CONTACT_LIMITS: Readonly<Record<keyof Contact, number>> = { name: 200, email: 320, phone: 32 };
const ADDRESS_LIMITS: Readonly<Record<keyof ShippingAddress, number>> = {
  line1: 200,
  line2: 200,
  city: 120,
  state: 64,
  postalCode: 16,
  country: 8,
};

export interface InputOptions {
  /** Refuse unknown fields by name, rather than dropping them. */
  strict?: boolean;
}

/** Text, or empty when absent. A number or an object where text belongs is refused. */
function text(source: Record<string, unknown>, field: string, prefix: string, max: number): string {
  const value = source[field];
  if (value === undefined || value === null) return "";

  if (typeof value !== "string") {
    throw new ValidationError("This request contains a value of the wrong type.", [
      { field: `${prefix}${field}`, message: "This value must be text." },
    ]);
  }

  if (value.length > max) {
    throw new ValidationError("This request contains a value that is too long.", [
      { field: `${prefix}${field}`, message: `This value must be ${max} characters or fewer.` },
    ]);
  }

  return value;
}

export function readContact(value: unknown, { strict = false }: InputOptions = {}): Contact {
  if (value === undefined || value === null) {
    throw new ValidationError("Contact details are required.", [
      { field: "contact", message: "This value is required." },
    ]);
  }

  const raw = requireRecord(value, "contact");
  if (strict) rejectUnknownFields(raw, Object.keys(CONTACT_LIMITS), "contact.");

  const field = (name: keyof Contact) => text(raw, name, "contact.", CONTACT_LIMITS[name]);

  return { ...EMPTY_CONTACT, name: field("name"), email: field("email"), phone: field("phone") };
}

/**
 * An address. Shared with saved addresses, which carry the same shape under
 * `address` beside a label and a recipient.
 */
export function readShippingAddress(
  value: unknown,
  { strict = false }: InputOptions = {},
): ShippingAddress {
  if (value === undefined || value === null) {
    throw new ValidationError("A delivery address is required.", [
      { field: "address", message: "This value is required." },
    ]);
  }

  const raw = requireRecord(value, "address");
  if (strict) rejectUnknownFields(raw, Object.keys(ADDRESS_LIMITS), "address.");

  const field = (name: keyof ShippingAddress) => text(raw, name, "address.", ADDRESS_LIMITS[name]);
  const line2 = field("line2");

  return {
    ...EMPTY_ADDRESS,
    line1: field("line1"),
    ...(line2 ? { line2 } : { line2: undefined }),
    city: field("city"),
    state: field("state"),
    postalCode: field("postalCode"),
    country: field("country") || "IN",
  };
}

export function parseCheckoutInput(value: unknown, options: InputOptions = {}): CheckoutInput {
  const body = requireRecord(value);
  if (options.strict) rejectUnknownFields(body, ["contact", "address"]);

  return {
    contact: readContact(body.contact, options),
    address: readShippingAddress(body.address, options),
  };
}
