import type {
  PaymentAdapter,
  PaymentResult,
  PaymentSessionRequest,
} from "../types";

/**
 * Development payment adapter.
 *
 * Contacts nothing, holds no credentials, and moves no money. It exists so the
 * checkout path can be built and tested end to end without pretending a payment
 * provider is connected.
 *
 * It reports `mode: "mock"`, and the checkout UI says so wherever the customer
 * would otherwise be asked to believe a payment happened. Nothing about this
 * adapter should ever read as a real transaction.
 */

/**
 * A deterministic decline, so the failure path is exercisable rather than
 * theoretical. Providers offer test credentials that always decline for the
 * same reason: an error state that cannot be reached is an error state that
 * has never been seen.
 */
const DECLINE_PREFIX = "decline@";

export const mockPaymentAdapter: PaymentAdapter = {
  name: "mock",
  mode: "mock",

  async createSession(request: PaymentSessionRequest): Promise<PaymentResult> {
    if (request.amount <= 0) {
      return {
        status: "failed",
        message: "Payment could not be started for a zero amount.",
      };
    }

    if (request.customer.email.toLowerCase().startsWith(DECLINE_PREFIX)) {
      // Real providers decline, and the message the customer sees is ours, not
      // theirs. Provider error detail never reaches this string.
      return { status: "failed", message: "Payment could not be completed." };
    }

    return {
      status: "succeeded",
      session: {
        // Recognisably not a provider reference.
        id: `mock_${request.idempotencyKey.slice(0, 16)}`,
        provider: "mock",
        mode: "mock",
        status: "succeeded",
        amount: request.amount,
        currency: request.currency,
      },
    };
  },
};
