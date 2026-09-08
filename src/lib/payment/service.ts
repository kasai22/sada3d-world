import { mockPaymentAdapter } from "./adapters/mock";
import { PaymentConfigurationError, type PaymentAdapter } from "./types";

/**
 * Adapter selection.
 *
 * The provider is chosen by server configuration, never by a request. Two rules
 * govern this and both matter:
 *
 *   · a build with no provider configured uses the mock adapter, which cannot
 *     take money and says so;
 *   · a build that names a provider it cannot implement fails loudly rather
 *     than quietly falling back to the mock. Silently substituting a fake
 *     payment for a real one is the worst outcome available here.
 *
 * Razorpay is the intended provider and is not implemented: no credentials are
 * provisioned, and an untested integration written against documentation would
 * be a claim rather than an integration. The seam is what Phase 11 owes; the
 * implementation belongs with the credentials.
 */

/**
 * Resolved per call rather than at import.
 *
 * A misconfigured provider must fail the checkout that needs it, not the module
 * graph that merely imports it — a payment problem should not take the catalog
 * down with it.
 */
export function resolvePaymentAdapter(): PaymentAdapter {
  const configured = process.env.PAYMENT_PROVIDER?.trim().toLowerCase();

  if (!configured || configured === "mock") return mockPaymentAdapter;

  throw new PaymentConfigurationError(
    `Payment provider "${configured}" is configured but not implemented. ` +
      "Remove PAYMENT_PROVIDER to use the development adapter.",
  );
}
