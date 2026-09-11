import { orderDetailDto } from "@/lib/api/dto";
import { RATE_LIMITS, enforceRateLimit, sourceSubject } from "@/lib/api/rate-limit";
import { assertSameOrigin, created, failure, readJson } from "@/lib/api/respond";
import { parseCheckoutInput } from "@/lib/checkout/input";
import { placeOrder } from "@/lib/checkout/service";
import {
  ConflictError,
  IdempotencyConflictError,
  InfrastructureError,
  ValidationError,
} from "@/lib/errors";

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
 * all it is allowed to carry: a request that also sends a price, a product, an
 * order id or a customer id is refused by name (`parseCheckoutInput`, strict),
 * so there is nothing in it to tamper with and no doubt about whether a stray
 * field was used.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    // The session is a cookie; a cross-site page must not be able to spend it.
    assertSameOrigin(request);
    enforceRateLimit(RATE_LIMITS.checkoutSource, sourceSubject(request.headers));

    const input = parseCheckoutInput(await readJson(request), { strict: true });
    const result = await placeOrder(input);

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

        /*
         * Everything else here is the payment provider being unavailable or
         * refusing to start — temporary, and already written for a customer.
         * A 503 tells a client to try again later, which is the truth.
         */
        throw new InfrastructureError(message);
      }
    }
  } catch (error) {
    return failure(error, "POST /api/checkout");
  }
}
