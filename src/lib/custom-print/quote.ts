import { quoteService } from "@/lib/pricing/service";
import type { QuoteRequest, QuoteResponse } from "@/lib/pricing/types";

import type { CustomPrintConfiguration } from "./types";

/**
 * The workflow's quote boundary.
 *
 * Unchanged in shape since Phase 7: the workflow hands over a configuration
 * and receives a QuoteResponse. What sits behind it changed — this now maps the
 * configuration into a pricing request and delegates to the quote service.
 *
 * The workflow still knows nothing about the pricing formula, and this file
 * contains no arithmetic.
 */

export type { QuoteResponse, QuoteRequest };

/** Maps workflow state onto a pricing request. */
export function toQuoteRequest(
  configuration: CustomPrintConfiguration,
): QuoteRequest | null {
  const model = configuration.model;
  if (!model || !configuration.material) return null;

  return {
    model: {
      name: model.name,
      extension: model.extension,
      sizeBytes: model.sizeBytes,
      // Only present where the file format actually states one.
      triangles: model.inspection.triangles,
    },
    material: configuration.material,
    quality: configuration.quality,
    finish: configuration.finish,
    quantity: configuration.quantity,
    // geometry stays absent: nothing measures the part yet, so the engine
    // prices the configuration and says so.
  };
}

/**
 * Signature of everything that affects the price.
 *
 * The workflow compares this against the signature a quote was produced from,
 * so a figure can never stay on screen describing a configuration that has
 * since changed.
 */
export function pricingSignature(configuration: CustomPrintConfiguration): string {
  return [
    configuration.model?.id ?? "",
    configuration.material ?? "",
    configuration.quality ?? "",
    configuration.finish ?? "",
    configuration.quantity,
  ].join("|");
}

export async function requestQuote(
  configuration: CustomPrintConfiguration,
): Promise<QuoteResponse> {
  const request = toQuoteRequest(configuration);

  if (!request) {
    return {
      status: "invalid",
      errors: [
        !configuration.model
          ? { field: "model" as const, message: "Upload a model before requesting a quote." }
          : { field: "material" as const, message: "Select a material." },
      ],
    };
  }

  return quoteService.request(request);
}
