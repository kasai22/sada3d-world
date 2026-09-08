/**
 * Payment domain.
 *
 * Provider-agnostic by design. Nothing outside this folder names a provider,
 * uses a provider's field names, or imports a provider SDK — checkout asks for
 * a payment session and receives one, and which provider produced it is an
 * implementation detail behind the adapter.
 *
 * What never crosses this boundary: card numbers, CVVs, and provider
 * credentials. The system holds a session reference and a status, and that is
 * all it ever needs to hold.
 */

export type PaymentStatus =
  | "idle"
  | "creating"
  /** The customer must complete something in the provider's UI. */
  | "requires_action"
  | "processing"
  | "succeeded"
  | "failed"
  | "cancelled";

/**
 * How real the payment is.
 *
 * `mock` never contacts a provider and never moves money. It is surfaced in
 * the UI so a development build can never be mistaken for a live one.
 */
export type PaymentMode = "mock" | "test" | "live";

export interface PaymentSessionRequest {
  /**
   * Whole rupees, computed by the server from the validated cart.
   *
   * An adapter must treat this as the authoritative figure and must never
   * accept an amount that arrived from a browser.
   */
  amount: number;
  currency: "INR";
  /** The order this pays for. */
  reference: string;
  /** Deduplicates retries at the provider. */
  idempotencyKey: string;
  /** Enough to reach the customer about the payment. No address, no card data. */
  customer: { name: string; email: string };
}

export interface PaymentSession {
  id: string;
  provider: string;
  mode: PaymentMode;
  status: PaymentStatus;
  amount: number;
  currency: "INR";
  /**
   * What the browser must do next, when anything. Opaque to the application:
   * only the provider's own client code interprets it.
   */
  action?: { type: string; payload: Record<string, string> };
}

export type PaymentResult =
  | { status: "succeeded"; session: PaymentSession }
  | { status: "requires_action"; session: PaymentSession }
  /** Message is safe to display: provider internals never reach the customer. */
  | { status: "failed"; message: string }
  | { status: "cancelled"; message: string };

export interface PaymentAdapter {
  readonly name: string;
  readonly mode: PaymentMode;
  createSession(request: PaymentSessionRequest): Promise<PaymentResult>;
}

export class PaymentConfigurationError extends Error {}
