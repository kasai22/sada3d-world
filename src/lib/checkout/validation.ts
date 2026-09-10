import {
  INDIA_STATES,
  type Contact,
  type FieldError,
  type ShippingAddress,
} from "./types";
import { checkDestination } from "./policies";

/**
 * Contact and address validation.
 *
 * Pure functions returning field-addressed errors, so the form can put each
 * message beside the input it belongs to and move focus there.
 *
 * The rules are format rules, not identity checks. A PIN code with six digits
 * is well-formed; whether it exists is a question for a postal database, and
 * the system does not pretend to know.
 */

/** Practical email shape check. Deliverability is proven by sending, not regex. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Indian mobile numbers: ten digits beginning 6–9, optionally +91 prefixed. */
const INDIA_PHONE = /^(?:\+?91[\s-]?)?[6-9]\d{9}$/;

/** Indian PIN codes: six digits, first digit 1–9. */
const INDIA_PIN = /^[1-9]\d{5}$/;

/**
 * A person's name, addressed to a named field.
 *
 * Exported because a name is validated in more than one place — checkout takes
 * one, and a saved address takes a recipient. Two copies of the rule would
 * eventually disagree about what a valid name is.
 *
 * Deliberately permissive: it checks that something was entered, not that it
 * looks like a name. Names that a stricter rule would reject are real.
 */
export function nameError(value: string, field: string): FieldError | null {
  return value.trim().length < 2 ? { field, message: "Enter the full name." } : null;
}

export function phoneError(value: string, field: string): FieldError | null {
  return INDIA_PHONE.test(value.replace(/\s|-/g, ""))
    ? null
    : { field, message: "Enter a 10-digit Indian mobile number." };
}

export function validateContact(contact: Contact): FieldError[] {
  const errors: FieldError[] = [];

  const name = nameError(contact.name, "contact.name");
  if (name) errors.push(name);

  if (!EMAIL.test(contact.email.trim())) {
    errors.push({
      field: "contact.email",
      message: "Enter an email address we can send the order to.",
    });
  }

  const phone = phoneError(contact.phone, "contact.phone");
  if (phone) errors.push(phone);

  return errors;
}

export function validateAddress(address: ShippingAddress): FieldError[] {
  const errors: FieldError[] = [];

  const destination = checkDestination(address);
  if (!destination.supported) {
    errors.push({ field: "address.country", message: destination.message });
    // Nothing below this is meaningful for a destination that is not served.
    return errors;
  }

  if (address.line1.trim().length < 4) {
    errors.push({
      field: "address.line1",
      message: "Enter the street address.",
    });
  }

  if (address.city.trim().length < 2) {
    errors.push({ field: "address.city", message: "Enter the city." });
  }

  if (!INDIA_STATES.some((state) => state.code === address.state)) {
    errors.push({ field: "address.state", message: "Select a state." });
  }

  if (!INDIA_PIN.test(address.postalCode.trim())) {
    errors.push({
      field: "address.postalCode",
      message: "Enter a 6-digit PIN code.",
    });
  }

  return errors;
}

export function validateCheckoutInput(input: {
  contact: Contact;
  address: ShippingAddress;
}): FieldError[] {
  return [...validateContact(input.contact), ...validateAddress(input.address)];
}

/** Trims and normalises what the form sent, before anything is validated. */
export function normaliseContact(contact: Contact): Contact {
  return {
    name: contact.name.trim().slice(0, 120),
    email: contact.email.trim().toLowerCase().slice(0, 200),
    phone: contact.phone.trim().replace(/\s|-/g, "").slice(0, 20),
  };
}

export function normaliseAddress(address: ShippingAddress): ShippingAddress {
  return {
    line1: address.line1.trim().slice(0, 160),
    line2: address.line2?.trim().slice(0, 160) || undefined,
    city: address.city.trim().slice(0, 80),
    state: address.state.trim().slice(0, 4).toUpperCase(),
    postalCode: address.postalCode.trim().slice(0, 10),
    country: address.country.trim().slice(0, 2).toUpperCase(),
  };
}
