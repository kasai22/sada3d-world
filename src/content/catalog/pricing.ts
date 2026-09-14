import { calculateCatalogQuote } from "@/lib/pricing/calculateQuote";
import { PRICING_RULES } from "@/lib/pricing/rules";

import type { ModelAsset } from "./types";

/**
 * Catalog prices, derived — never typed in.
 *
 * ── Why derived ──────────────────────────────────────────────────────────
 *
 * The repository holds no approved Reality 3D pricing. The pre-reset catalog had a
 * hand-written price on every product (₹399, ₹520, ₹2,680 …) with no record of
 * where any of them came from, and the reset instruction was not to copy them.
 *
 * The one pricing authority that does exist is the quote engine, which custom
 * print already uses. So a catalog price is exactly what that engine charges
 * for the same selections: the product's material, standard quality, standard
 * finish, one unit per separately printed part, one setup fee. A catalog part
 * and the same parts quoted through custom print cost the same, by construction.
 *
 * ── Why still provisional ────────────────────────────────────────────────
 *
 * `PRICING_RULES` is itself marked provisional, and it does not price geometry
 * — a 34 mm spacer and a 50 mm gear in the same material cost the same per part.
 * Every price produced here is recorded as `priceStatus: "provisional"`, and
 * readiness never counts a provisional product as REAL. Replacing the rules, or
 * approving individual prices, is the step that removes that status.
 */
export interface DerivedPrice {
  price: number;
  basis: string;
}

export function provisionalCatalogPrice(input: {
  material: string;
  model: ModelAsset;
}): DerivedPrice {
  const quantity = input.model.partCount;

  const response = calculateCatalogQuote({
    material: input.material,
    quality: "standard",
    finish: "standard",
    quantity,
  });

  if (response.status !== "available") {
    // A catalog module that cannot be priced must fail loudly, not ship ₹0.
    throw new Error(
      `Cannot derive a price for ${input.model.url}: ` +
        (response.status === "invalid"
          ? response.errors.map((error) => error.message).join("; ")
          : response.status),
    );
  }

  return {
    price: response.quote.total,
    basis:
      `Quote engine, rules ${PRICING_RULES.version} (provisional): ${input.material}, ` +
      `standard quality, standard finish, ${quantity} part${quantity === 1 ? "" : "s"}, one setup fee.`,
  };
}
