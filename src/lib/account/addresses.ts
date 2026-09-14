import type { FieldError } from "@/lib/checkout/types";

import { postgresAddressRepository } from "./addresses.postgres";
import { memoize, persistenceMode, warnMemoryPersistence } from "./persistence";
import {
  nameError,
  normaliseAddress,
  phoneError,
  validateAddress,
} from "@/lib/checkout/validation";

import type {
  CustomerAddress,
  CustomerAddressInput,
  CustomerAddressView,
  CustomerIdentity,
} from "./types";

/**
 * Saved delivery addresses.
 *
 * The address itself is `ShippingAddress` and it is validated by the same rules
 * checkout uses. A second address shape with a second set of rules would
 * eventually accept something checkout refuses, and the customer would discover
 * it at the moment they were trying to pay.
 *
 * ── The default address ──────────────────────────────────────────────────
 *
 * One invariant, enforced here rather than in a form: **a customer with any
 * addresses has exactly one default**. The first address saved becomes it; a
 * new default demotes the old one in the same write; deleting the default
 * promotes the next. A UI cannot be trusted with this — two browser tabs would
 * be enough to end up with two defaults or none.
 *
 * ── Storage ──────────────────────────────────────────────────────────────
 *
 * PostgreSQL, since Phase 14. `addresses.postgres.ts` is the implementation and
 * `lib/db/schema.ts` declares the table, including the partial unique index
 * that expresses the invariant above where the database can hold it — which is
 * what makes it true under concurrency rather than merely usually true.
 *
 * The in-process store beneath is kept for development without a database.
 * Production has no such fallback; see `persistence.ts`.
 */

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

/** Beyond this an address book stops being an address book. */
export const MAX_ADDRESSES = 20;

const MAX_LABEL_LENGTH = 40;

/**
 * Validates a saved address.
 *
 * Composed from the checkout rules, not a reimplementation of them: the
 * recipient reuses the contact name and phone checks, and the address reuses
 * `validateAddress` whole — including its destination policy, so a country
 * Reality 3D does not ship to is refused here for the same reason and with the
 * same message.
 *
 * Field paths match the form's input names so each message can be rendered
 * beside the control it belongs to.
 */
export function validateCustomerAddress(
  input: CustomerAddressInput,
): FieldError[] {
  const errors: FieldError[] = [];

  const name = nameError(input.fullName, "fullName");
  if (name) errors.push(name);

  const phone = phoneError(input.phone, "phone");
  if (phone) errors.push(phone);

  if ((input.label ?? "").length > MAX_LABEL_LENGTH) {
    errors.push({
      field: "label",
      message: `Keep the label under ${MAX_LABEL_LENGTH} characters.`,
    });
  }

  errors.push(...validateAddress(input.address));

  return errors;
}

/** Trims and bounds what a form sent, before any of it is validated. */
export function normaliseCustomerAddress(
  input: CustomerAddressInput,
): CustomerAddressInput {
  return {
    label: input.label?.trim().slice(0, MAX_LABEL_LENGTH) || undefined,
    fullName: input.fullName.trim().slice(0, 120),
    phone: input.phone.trim().replace(/\s|-/g, "").slice(0, 20),
    address: normaliseAddress(input.address),
    isDefault: input.isDefault === true,
  };
}

/* ------------------------------------------------------------------ *
 * Repository
 * ------------------------------------------------------------------ */

export interface CustomerAddressRepository {
  readonly name: string;
  list(customerId: string): Promise<CustomerAddress[]>;
  get(customerId: string, addressId: string): Promise<CustomerAddress | null>;
  /** Replaces the whole set for one customer. One write, one invariant. */
  replace(customerId: string, addresses: readonly CustomerAddress[]): Promise<void>;
}

const GLOBAL_KEY = "__sada3d_customer_addresses__";

function store(): Map<string, CustomerAddress[]> {
  const globals = globalThis as unknown as Record<
    string,
    Map<string, CustomerAddress[]> | undefined
  >;
  const existing = globals[GLOBAL_KEY];
  if (existing) return existing;

  const created = new Map<string, CustomerAddress[]>();
  globals[GLOBAL_KEY] = created;
  return created;
}

/** Defensive copy, so a caller cannot mutate what the store holds. */
function clone(address: CustomerAddress): CustomerAddress {
  return { ...address, address: { ...address.address } };
}

export const memoryCustomerAddressRepository: CustomerAddressRepository = {
  name: "memory",

  async list(customerId: string): Promise<CustomerAddress[]> {
    return (store().get(customerId) ?? []).map(clone);
  },

  async get(customerId: string, addressId: string): Promise<CustomerAddress | null> {
    /*
     * Looked up within the customer's own set, never by id across every
     * customer. An implementation that found the address first and checked its
     * owner afterwards would be one refactor away from forgetting to.
     */
    const found = (store().get(customerId) ?? []).find(
      (address) => address.id === addressId,
    );
    return found ? clone(found) : null;
  },

  async replace(
    customerId: string,
    addresses: readonly CustomerAddress[],
  ): Promise<void> {
    store().set(customerId, addresses.map(clone));
  },
};

const postgres = memoize(() => postgresAddressRepository());

/**
 * The repository the application uses.
 *
 * A facade rather than a fixed choice: the decision is re-read per call from
 * `persistenceMode()`, so a process that gains a database does not have to be
 * restarted to notice, and a test that installs one is answered by it. The
 * instances themselves are made once.
 *
 * Every caller above this — the service, the server actions, the account UI —
 * is unchanged by durability arriving, which is the point of the interface.
 */
function repository(): CustomerAddressRepository {
  if (persistenceMode() === "postgres") return postgres();

  warnMemoryPersistence();
  return memoryCustomerAddressRepository;
}

export const customerAddressRepository: CustomerAddressRepository = {
  get name() {
    return repository().name;
  },
  list: (customerId) => repository().list(customerId),
  get: (customerId, addressId) => repository().get(customerId, addressId),
  replace: (customerId, addresses) => repository().replace(customerId, addresses),
};

/* ------------------------------------------------------------------ *
 * The default invariant
 * ------------------------------------------------------------------ */

/**
 * Exactly one default among any addresses there are.
 *
 * `preferred` wins if it is present. Otherwise the existing default stands, and
 * if there is none the first address takes it — an address book with no default
 * would make checkout choose arbitrarily, which is a choice it should not make.
 */
export function withSingleDefault(
  addresses: readonly CustomerAddress[],
  preferredId?: string,
): CustomerAddress[] {
  if (addresses.length === 0) return [];

  const chosen =
    addresses.find((address) => address.id === preferredId) ??
    addresses.find((address) => address.isDefault) ??
    addresses[0];

  return addresses.map((address) => ({
    ...address,
    isDefault: address.id === chosen?.id,
  }));
}

/* ------------------------------------------------------------------ *
 * Projection
 * ------------------------------------------------------------------ */

/** Built from safe fields. The owner id does not cross into a component. */
export function toAddressView(address: CustomerAddress): CustomerAddressView {
  return {
    id: address.id,
    label: address.label,
    fullName: address.fullName,
    phone: address.phone,
    address: { ...address.address },
    isDefault: address.isDefault,
    createdAt: address.createdAt,
    updatedAt: address.updatedAt,
  };
}

/* ------------------------------------------------------------------ *
 * Service
 * ------------------------------------------------------------------ */

export type AddressMutation =
  | { ok: true; addresses: readonly CustomerAddressView[] }
  /** Field errors when the form is wrong; a message when the request is. */
  | { ok: false; message?: string; errors?: readonly FieldError[] };

/** Default first, then newest. The one checkout would use reads first. */
function ordered(addresses: readonly CustomerAddress[]): CustomerAddress[] {
  return [...addresses].sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    return Date.parse(b.createdAt) - Date.parse(a.createdAt);
  });
}

export async function listCustomerAddresses(
  identity: CustomerIdentity,
): Promise<CustomerAddressView[]> {
  const addresses = await customerAddressRepository.list(identity.id);
  return ordered(addresses).map(toAddressView);
}

async function commit(
  identity: CustomerIdentity,
  addresses: readonly CustomerAddress[],
  preferredDefaultId?: string,
): Promise<AddressMutation> {
  const next = withSingleDefault(addresses, preferredDefaultId);
  await customerAddressRepository.replace(identity.id, next);
  return { ok: true, addresses: ordered(next).map(toAddressView) };
}

function newAddressId(): string {
  return `adr_${crypto.randomUUID()}`;
}

export async function createCustomerAddress(
  identity: CustomerIdentity,
  input: CustomerAddressInput,
): Promise<AddressMutation> {
  const normalised = normaliseCustomerAddress(input);
  const errors = validateCustomerAddress(normalised);
  if (errors.length > 0) return { ok: false, errors };

  const existing = await customerAddressRepository.list(identity.id);
  if (existing.length >= MAX_ADDRESSES) {
    return {
      ok: false,
      message: `You can save up to ${MAX_ADDRESSES} addresses. Remove one and try again.`,
    };
  }

  const now = new Date().toISOString();
  const created: CustomerAddress = {
    id: newAddressId(),
    customerId: identity.id,
    label: normalised.label,
    fullName: normalised.fullName,
    phone: normalised.phone,
    address: normalised.address,
    // The first address is the default whatever the form said, because an
    // address book with no default is one checkout cannot choose from.
    isDefault: normalised.isDefault === true || existing.length === 0,
    createdAt: now,
    updatedAt: now,
  };

  return commit(
    identity,
    [...existing, created],
    created.isDefault ? created.id : undefined,
  );
}

export async function updateCustomerAddress(
  identity: CustomerIdentity,
  addressId: string,
  input: CustomerAddressInput,
): Promise<AddressMutation> {
  const existing = await customerAddressRepository.get(identity.id, addressId);
  if (!existing) return { ok: false, message: "That address no longer exists." };

  const normalised = normaliseCustomerAddress(input);
  const errors = validateCustomerAddress(normalised);
  if (errors.length > 0) return { ok: false, errors };

  const all = await customerAddressRepository.list(identity.id);
  const updated: CustomerAddress = {
    ...existing,
    label: normalised.label,
    fullName: normalised.fullName,
    phone: normalised.phone,
    address: normalised.address,
    // A default cannot be un-set by editing: something has to become the
    // default instead, which is what "set as default" on another address does.
    isDefault: existing.isDefault || normalised.isDefault === true,
    updatedAt: new Date().toISOString(),
  };

  return commit(
    identity,
    all.map((address) => (address.id === addressId ? updated : address)),
    updated.isDefault ? updated.id : undefined,
  );
}

export async function deleteCustomerAddress(
  identity: CustomerIdentity,
  addressId: string,
): Promise<AddressMutation> {
  const existing = await customerAddressRepository.get(identity.id, addressId);
  if (!existing) return { ok: false, message: "That address no longer exists." };

  const all = await customerAddressRepository.list(identity.id);
  const remaining = all.filter((address) => address.id !== addressId);

  // Deleting the default leaves the set without one; withSingleDefault promotes
  // the next rather than leaving checkout with nothing to choose.
  return commit(identity, remaining);
}

export async function setDefaultCustomerAddress(
  identity: CustomerIdentity,
  addressId: string,
): Promise<AddressMutation> {
  const existing = await customerAddressRepository.get(identity.id, addressId);
  if (!existing) return { ok: false, message: "That address no longer exists." };

  const all = await customerAddressRepository.list(identity.id);
  return commit(identity, all, addressId);
}
