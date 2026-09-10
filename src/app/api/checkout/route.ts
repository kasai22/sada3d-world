import { orderDetailDto } from "@/lib/api/dto";
import { created, failure, readJson, requireRecord } from "@/lib/api/respond";
import { placeOrder } from "@/lib/checkout/service";
import {
  ConflictError,
  IdempotencyConflictError,
  ValidationError,
} from "@/lib/errors";
import { EMPTY_ADDRESS, EMPTY_CONTACT } from "@/lib/checkout/types";
import type { Contact, ShippingAddress } from "@/lib/checkout/types";

/**
 * POST /api/checkout — turn the cart into an order.
 *
 * The Phase 11 service, unchanged, reached over HTTP. Everything that made it
 * safe still applies and none of it is re-implemented here:
 *
 *   · the cart comes from the server's own store, never from the request
 *   · every line is revalidated against the catalog and the pricing rules
 *   · every rupee is computed server-side
 *   · a custom part whose manufacturing file is not durably stored is refused,
 *     because an order whose file cannot be retrieved is one that cannot be made
 *   · the idempotency key is derived server-side, so a caller cannot choose it
 *
 * The body carries a name, an email, a phone number and an address. That is
 * all it is allowed to carry: there is no field for a price, a product, an
 * order id or a customer id, so there is nothing in it to tamper with.
 */
export const dynamic = "force-dynamic";

function readContact(source: Record<string, unknown>): Contact {
  const contact = source.contact;
  if (typeof contact !== "object" || contact === null) {
    throw new ValidationError("Contact details are required.", [
      { field: "contact", message: "This value is required." },
    ]);
  }

  const raw = contact as Record<string, unknown>;
  return {
    ...EMPTY_CONTACT,
    name: typeof raw.name === "string" ? raw.name : "",
    email: typeof raw.email === "string" ? raw.email : "",
    phone: typeof raw.phone === "string" ? raw.phone : "",
  };
}

function readAddress(source: Record<string, unknown>): ShippingAddress {
  const address = source.address;
  if (typeof address !== "object" || address === null) {
    throw new ValidationError("A delivery address is required.", [
      { field: "address", message: "This value is required." },
    ]);
  }

  const raw = address as Record<string, unknown>;
  const text = (field: string): string =>
    typeof raw[field] === "string" ? (raw[field] as string) : "";

  return {
    ...EMPTY_ADDRESS,
    line1: text("line1"),
    ...(typeof raw.line2 === "string" && raw.line2 ? { line2: raw.line2 } : {}),
    city: text("city"),
    state: text("state"),
    postalCode: text("postalCode"),
    country: text("country") || "IN",
  };
}

export async function POST(request: Request) {
  try {
    const body = requireRecord(await readJson(request));

    const result = await placeOrder({
      contact: readContact(body),
      address: readAddress(body),
    });

    /*
     * The service's own verdict, mapped to HTTP. Each branch is a different
     * thing for a client to do about it, which is why they are different codes
     * rather than one generic failure.
     */
    switch (result.status) {
      case "placed":
        return created({ order: orderDetailDto(result.order) }, { private: true });

      case "invalid":
        throw new ValidationError(
          "Some of these details need correcting.",
          result.errors.map((error) => ({
            field: error.field,
            message: error.message,
          })),
        );

      case "cart_invalid":
        // 409: the cart changed underneath the request. Re-read it and retry.
        throw new ConflictError(
          result.messages[0] ?? "Your cart cannot be ordered as it stands.",
        );

      case "payment_failed":
        throw new ConflictError(result.message);

      default: {
        /*
         * The service says "already submitted" and "already being placed"
         * through this branch. Both are idempotency outcomes and both are a
         * 409, so a client retrying knows not to submit a third time.
         */
        const message = result.message;
        if (/already/i.test(message)) throw new IdempotencyConflictError(message);
        throw new Error(message);
      }
    }
  } catch (error) {
    return failure(error, "POST /api/checkout");
  }
}
