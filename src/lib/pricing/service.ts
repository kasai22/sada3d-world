import { calculateQuote } from "./calculateQuote";
import type { QuoteRequest, QuoteResponse } from "./types";

/**
 * Quote transport seam.
 *
 * The UI calls a service, never the calculator. Today the service runs the
 * calculator in-process; later it posts to /api/quotes and the pricing rules
 * stop being visible to the browser at all. Neither the workflow nor the quote
 * components change when that happens, because both only ever see a
 * QuoteResponse.
 *
 * Treat any figure produced here as untrusted client state. A server
 * implementation must re-validate material, quality, finish and quantity and
 * recompute the total itself before it is used for payment.
 */

export interface QuoteService {
  readonly name: string;
  request(request: QuoteRequest): Promise<QuoteResponse>;
}

/**
 * In-process calculator.
 *
 * Deliberately not artificially delayed: the calculation is arithmetic and
 * completes immediately, so the interface shows a result rather than a
 * manufactured loading state.
 */
export const localQuoteService: QuoteService = {
  name: "local",

  async request(request: QuoteRequest): Promise<QuoteResponse> {
    try {
      return calculateQuote(request);
    } catch {
      // A thrown error is a fault in the engine, not a customer mistake.
      return {
        status: "error",
        message: "The quote service could not be reached. Try again.",
      };
    }
  },
};

/** The service the application uses. Phase 15 points this at the API route. */
export const quoteService: QuoteService = localQuoteService;
