import { processOf, unavailableReason } from "@/content/catalog/capabilities";
import { finishOption, materialOption, qualityOptionsFor } from "@/lib/custom-print/options";

import { EXCLUDED_FROM_ESTIMATE, PRICING_RULES, type PricingRules } from "./rules";
import type {
  ManufacturingQuote,
  QuoteLine,
  QuoteRequest,
  QuoteResponse,
  QuoteValidationError,
} from "./types";

/**
 * The quote engine.
 *
 * Pure and deterministic: the same request always produces the same result.
 * No React, no I/O, no clock, no randomness — which is what makes it testable
 * and what will let it move to a server unchanged.
 *
 * It prices the customer's *selections*. It does not price the part, because
 * nothing in the system measures the part yet. That distinction is carried on
 * the result as `basis: "configuration"` and stated in the interface.
 */

export const ACCEPTED_MODEL_EXTENSIONS = [".3mf", ".stl", ".step", ".stp", ".obj"];

/** Whole rupees, half away from zero. The one rounding point in the pipeline. */
export function roundRupees(value: number): number {
  return Math.round(value);
}

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

/**
 * Validates a request against the rules, not against the UI.
 *
 * The interface already prevents most of these, but the engine cannot assume
 * that: a future server implementation receives whatever a client sends, and
 * must reach the same verdict on its own.
 */
export function validateQuoteRequest(
  request: QuoteRequest,
  rules: PricingRules = PRICING_RULES,
): QuoteValidationError[] {
  const errors: QuoteValidationError[] = [];

  const model = request.model;
  if (!model || !model.name) {
    errors.push({ field: "model", message: "Upload a model before requesting a quote." });
  } else {
    if (!ACCEPTED_MODEL_EXTENSIONS.includes(model.extension)) {
      errors.push({ field: "model", message: "This file type cannot be quoted." });
    }
    if (!Number.isFinite(model.sizeBytes) || model.sizeBytes <= 0) {
      errors.push({ field: "model", message: "This model file is empty." });
    }
  }

  if (!request.material) {
    errors.push({ field: "material", message: "Select a material." });
  } else if (rules.materialFactor[request.material] === undefined) {
    errors.push({ field: "material", message: "Select a supported material." });
  } else if (!materialOption(request.material)) {
    // Stage 19.8: a pricing factor is not an approval. Only materials with an
    // approved manufacturing decision are quoted, whatever a client sends.
    // Stage 19.9: a Coming Soon material is named as such, and still refused.
    errors.push({
      field: "material",
      message: unavailableReason("material", request.material) ?? "That material is not currently offered.",
    });
  } else if (unavailableReason("technology", processOf(request.material))) {
    errors.push({ field: "material", message: unavailableReason("technology", processOf(request.material))! });
  }

  if (request.technology !== undefined) {
    const reason = unavailableReason("technology", request.technology);
    if (reason) {
      errors.push({ field: "technology", message: reason });
    } else if (processOf(request.material) && processOf(request.material) !== request.technology) {
      errors.push({ field: "technology", message: "That material is not printed with this manufacturing process." });
    }
  }

  if (request.quality !== undefined && rules.qualityFactor[request.quality] === undefined) {
    errors.push({ field: "quality", message: "Select a supported print quality." });
  } else if (
    request.quality !== undefined &&
    materialOption(request.material) &&
    !qualityOptionsFor(request.material).some((option) => option.value === request.quality)
  ) {
    // Stage 19.7: a quality belongs to a process. FDM layer heights cannot be
    // ordered for SLA resin, whatever a client sends.
    errors.push({ field: "quality", message: "That print quality is not offered for this material." });
  }

  if (request.finish !== undefined && rules.finishFee[request.finish] === undefined) {
    errors.push({ field: "finish", message: "Select a supported finish." });
  } else if (request.finish !== undefined && !finishOption(request.finish)) {
    // Stage 19.8: post-processing finishes are not approved and are not offered.
    // Stage 19.9: Smoothed and Matte are Coming Soon — named, and still refused.
    errors.push({
      field: "finish",
      message: unavailableReason("finish", request.finish) ?? "That finish is not currently offered.",
    });
  }

  const quantity = request.quantity;
  if (!Number.isInteger(quantity) || quantity < 1) {
    errors.push({ field: "quantity", message: "Quantity must be a whole number of at least 1." });
  } else if (quantity > rules.maxQuantity) {
    errors.push({
      field: "quantity",
      message: `Quantity above ${rules.maxQuantity} needs a manual quote.`,
    });
  }

  return errors;
}

/* ------------------------------------------------------------------ *
 * Calculation
 * ------------------------------------------------------------------ */

/**
 * Prices a validated request.
 *
 * Each line is rounded to whole rupees and the total is the sum of those
 * rounded lines, so the breakdown a customer reads always adds up to the
 * figure beside it. Rounding happens once, at line level — intermediate
 * per-unit maths stays in full precision.
 */
export function calculateQuote(
  request: QuoteRequest,
  rules: PricingRules = PRICING_RULES,
): QuoteResponse {
  const errors = validateQuoteRequest(request, rules);
  if (errors.length > 0) return { status: "invalid", errors };

  return { status: "available", quote: priceSelections(request, rules) };
}

/**
 * Prices a catalog configuration — the same selections, with no upload.
 *
 * A catalog product has no customer file, so the upload checks (a file is
 * present, its extension is one a customer may upload) do not apply; its model
 * may be a GLB, which is a display format nobody uploads. Every other check is
 * identical, and the arithmetic is the same function `calculateQuote` uses, so a
 * catalog price and a custom-print quote for the same selections cannot differ.
 */
export function calculateCatalogQuote(
  selections: Omit<QuoteRequest, "model" | "geometry">,
  rules: PricingRules = PRICING_RULES,
): QuoteResponse {
  const request: QuoteRequest = {
    ...selections,
    model: { name: "catalog", extension: ".stl", sizeBytes: 1 },
  };

  const errors = validateQuoteRequest(request, rules).filter((error) => error.field !== "model");
  if (errors.length > 0) return { status: "invalid", errors };

  return { status: "available", quote: priceSelections(request, rules) };
}

function priceSelections(request: QuoteRequest, rules: PricingRules): ManufacturingQuote {
  const quantity = request.quantity;
  const materialFactor = rules.materialFactor[request.material] ?? 1;
  const qualityFactor =
    request.quality === undefined ? 1 : (rules.qualityFactor[request.quality] ?? 1);
  const finishFee =
    request.finish === undefined ? 0 : (rules.finishFee[request.finish] ?? 0);

  // Per unit, in full precision.
  const unitBase = rules.baseUnitCost;
  const unitMaterial = unitBase * (materialFactor - 1);
  const unitQuality = unitBase * materialFactor * (qualityFactor - 1);

  const units = quantity === 1 ? undefined : `× ${quantity} units`;

  const lines: QuoteLine[] = [
    { id: "setup", label: "Setup", amount: roundRupees(rules.setupFee), detail: "Once per job" },
    {
      id: "base",
      label: "Base manufacturing",
      amount: roundRupees(unitBase * quantity),
      detail: units,
    },
  ];

  // A dimension that costs nothing is omitted rather than shown as ₹0.
  if (unitMaterial !== 0) {
    lines.push({
      id: "material",
      label: "Material",
      amount: roundRupees(unitMaterial * quantity),
      detail: units,
    });
  }

  if (unitQuality !== 0) {
    lines.push({
      id: "quality",
      label: "Quality",
      amount: roundRupees(unitQuality * quantity),
      detail: units,
    });
  }

  if (finishFee !== 0) {
    lines.push({
      id: "finish",
      label: "Finish",
      amount: roundRupees(finishFee * quantity),
      detail: units,
    });
  }

  const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);

  // Stated as its own line so the breakdown still sums to the total.
  if (subtotal < rules.minimumOrder) {
    lines.push({
      id: "minimum",
      label: "Minimum order adjustment",
      amount: rules.minimumOrder - subtotal,
    });
  }

  const total = lines.reduce((sum, line) => sum + line.amount, 0);

  const quote: ManufacturingQuote = {
    currency: rules.currency,
    /*
     * Always "configuration", even when geometry was supplied. No rule in
     * `rules.ts` reads a measured value, so the figure is derived from the
     * selections alone and saying otherwise would misdescribe it. This becomes
     * "geometry" in the same change that adds a geometry-dependent rule.
     */
    basis: "configuration",
    quantity,
    lines,
    total,
    excluded: EXCLUDED_FROM_ESTIMATE,
    rulesVersion: rules.version,
    geometry: request.geometry
      ? {
          state: "supplied_not_priced",
          reason:
            "Your model has been measured, and no approved pricing rule uses those measurements yet. The figure reflects your selections.",
        }
      : { state: "absent" },
    provisional: rules.provisional,
  };

  return quote;
}
