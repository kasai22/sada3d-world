import type { CustomPrintConfiguration } from "./types";

/**
 * Quote seam.
 *
 * Phase 8 owns the pricing engine. This file exists so the workflow has a typed
 * boundary to hand a finished configuration to, and so the review step can
 * already represent every outcome a real engine will produce.
 *
 * It deliberately computes nothing. There is no price model, no material
 * multiplier and no print-time estimate anywhere in Phase 7, because none of
 * those figures exist yet and a plausible-looking number is worse than none.
 */

export interface QuoteRequest {
  configuration: CustomPrintConfiguration;
}

export type QuoteStatus = "pending" | "available" | "unavailable" | "error";

export interface QuoteBreakdownLine {
  label: string;
  /** Pre-formatted for the locale by the engine that produced it. */
  value: string;
}

export interface QuoteResponse {
  status: QuoteStatus;
  /** Present only when status is "available". */
  total?: string;
  /** Part analysis and cost lines, when the engine provides them. */
  breakdown?: readonly QuoteBreakdownLine[];
  /** Shown to the customer when the quote is unavailable or errored. */
  message?: string;
}

/**
 * Requests a manufacturing quote for a configuration.
 *
 * Always resolves "unavailable" in Phase 7. The workflow renders that outcome
 * honestly rather than inventing a figure; Phase 8 replaces the body of this
 * function and the review step starts showing real numbers with no UI change.
 */
export async function requestQuote(_request: QuoteRequest): Promise<QuoteResponse> {
  return {
    status: "unavailable",
    message:
      "Live quoting is not available yet. Your configuration is complete and ready to submit once quoting is enabled.",
  };
}
