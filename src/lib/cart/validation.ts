import { getProductById, isQuoteOnly, productHref } from "@/lib/catalog/query";
import { MATERIALS } from "@/lib/catalog/taxonomy";
import { modelFileAvailability } from "@/lib/custom-print/storage";
import {
  finishOption,
  materialOption,
  qualityOption,
} from "@/lib/custom-print/options";
import { calculateQuote } from "@/lib/pricing/calculateQuote";
import { formatINR } from "@/lib/money";

import { calculateCartTotals, type TotalsInput } from "./totals";
import {
  MAX_LINE_QUANTITY,
  type Cart,
  type CartIssue,
  type CartLine,
  type CatalogCartLine,
  type CustomCartLine,
  type PricedCart,
  type PricedCartLine,
} from "./types";

/**
 * Cart pricing and revalidation — the trust boundary.
 *
 * Everything a stored cart says about money is ignored here. A catalog line is
 * priced from the catalog as it is now; a custom line is priced by running the
 * quote engine again over the stored configuration. The stored figures are used
 * for exactly one thing: noticing that they no longer match, so the customer is
 * told rather than quietly charged something else.
 *
 * This runs on every read, so the cart page, the checkout page and the order
 * that is finally created all see the same numbers derived the same way.
 */

/* ------------------------------------------------------------------ *
 * Display helpers
 * ------------------------------------------------------------------ */

function materialLabel(value: string): string {
  return (
    MATERIALS.find((entry) => entry.value === value)?.label ??
    materialOption(value)?.name ??
    value.toUpperCase()
  );
}

function catalogSpec(line: CatalogCartLine, qualityLabel?: string): string {
  return [
    materialLabel(line.configuration.material),
    line.configuration.color.toUpperCase(),
    qualityLabel,
  ]
    .filter(Boolean)
    .join(" / ");
}

function customSpec(line: CustomCartLine): string {
  return [
    materialLabel(line.configuration.material),
    qualityOption(line.configuration.quality)?.label.toUpperCase() ??
      line.configuration.quality.toUpperCase(),
    finishOption(line.configuration.finish)?.label.toUpperCase() ??
      line.configuration.finish.toUpperCase(),
  ].join(" / ");
}

/* ------------------------------------------------------------------ *
 * Catalog lines
 * ------------------------------------------------------------------ */

function priceCatalogLine(line: CatalogCartLine): PricedCartLine {
  const issues: CartIssue[] = [];
  const product = getProductById(line.productId);

  if (!product) {
    return {
      line,
      name: "This part",
      spec: catalogSpec(line),
      unitPrice: null,
      lineTotal: null,
      issues: [
        {
          code: "product_unavailable",
          severity: "blocking",
          lineId: line.id,
          message: "No longer available. Remove it to continue.",
        },
      ],
    };
  }

  if (isQuoteOnly(product)) {
    // A quote-only part has no catalog price; it is bought through custom
    // print. A line like this cannot be honoured as a catalog purchase.
    issues.push({
      code: "product_not_purchasable",
      severity: "blocking",
      lineId: line.id,
      message: "This part is priced from your own geometry. Order it through custom print.",
    });
  }

  if (!isQuoteOnly(product) && product.price !== line.priceAtAdd) {
    issues.push({
      code: "price_changed",
      severity: "blocking",
      lineId: line.id,
      message: `The price for ${product.name} changed from ${formatINR(line.priceAtAdd)} to ${formatINR(product.price)}.`,
    });
  }

  if (line.quantity < 1 || line.quantity > MAX_LINE_QUANTITY) {
    issues.push({
      code: "quantity_invalid",
      severity: "blocking",
      lineId: line.id,
      message: `Quantity must be between 1 and ${MAX_LINE_QUANTITY}.`,
    });
  }

  const qualityLabel = product.qualityOptions?.find(
    (option) => option.value === line.configuration.quality,
  )?.label;

  // Price comes from the catalog, never from the line.
  const unitPrice = isQuoteOnly(product) ? null : product.price;

  return {
    line,
    name: product.name,
    href: productHref(product),
    spec: catalogSpec(line, qualityLabel?.toUpperCase()),
    unitPrice,
    lineTotal: unitPrice === null ? null : unitPrice * line.quantity,
    issues,
  };
}

/* ------------------------------------------------------------------ *
 * Custom lines
 * ------------------------------------------------------------------ */

function priceCustomLine(line: CustomCartLine): PricedCartLine {
  const issues: CartIssue[] = [];

  // The quote is recomputed from the stored configuration. cartLine.quote.total
  // is never the figure used — only the figure compared against.
  const response = calculateQuote({
    model: {
      name: line.model.name,
      extension: line.model.extension,
      sizeBytes: line.model.sizeBytes,
      triangles: line.model.triangles,
    },
    material: line.configuration.material,
    quality: line.configuration.quality,
    finish: line.configuration.finish,
    quantity: line.quantity,
  });

  let lineTotal: number | null = null;

  if (response.status === "available") {
    lineTotal = response.quote.total;

    if (response.quote.rulesVersion !== line.quote.rulesVersion) {
      issues.push({
        code: "quote_stale",
        severity: "blocking",
        lineId: line.id,
        message:
          "Manufacturing prices changed after this quote. Review it before checkout.",
      });
    } else if (response.quote.total !== line.quote.total) {
      // The quantity moved after the quote, or the rules produce a different
      // figure. Either way the customer has not agreed to this number yet.
      issues.push({
        code: "quote_stale",
        severity: "blocking",
        lineId: line.id,
        message: `This quote was ${formatINR(line.quote.total)} and is now ${formatINR(response.quote.total)}. Review it before checkout.`,
      });
    }
  } else {
    issues.push({
      code: "quote_unavailable",
      severity: "blocking",
      lineId: line.id,
      message:
        response.status === "unavailable"
          ? response.reason
          : "This configuration can no longer be quoted. Review it before checkout.",
    });
  }

  /*
   * The manufacturing file. A custom part cannot become an order unless the
   * file can be reached for fulfilment, and today it cannot: it is still in the
   * browser. Saying so is the whole point — an order without its file is an
   * order that cannot be made.
   */
  const availability = modelFileAvailability(line.model.modelId);
  if (!availability.durable) {
    issues.push({
      code: "model_file_pending",
      severity: "blocking",
      lineId: line.id,
      message:
        availability.reason ??
        "This part's file is not stored yet, so it cannot be sent for manufacturing.",
    });
  }

  return {
    line,
    name: line.model.name,
    href: "/custom-print",
    spec: customSpec(line),
    unitPrice: lineTotal === null ? null : Math.round(lineTotal / line.quantity),
    lineTotal,
    issues,
  };
}

/* ------------------------------------------------------------------ *
 * Cart
 * ------------------------------------------------------------------ */

export function priceLine(line: CartLine): PricedCartLine {
  return line.type === "catalog" ? priceCatalogLine(line) : priceCustomLine(line);
}

/**
 * Resolves a stored cart into the priced, validated cart everything else uses.
 *
 * The result is the single source of truth for what the cart contains, what it
 * costs and what is wrong with it. Nothing downstream recalculates any part of
 * it.
 */
export function priceCart(cart: Cart, totals: TotalsInput = {}): PricedCart {
  const lines = cart.lines.map(priceLine);
  const issues = lines.flatMap((priced) => priced.issues);

  return {
    id: cart.id,
    lines,
    totals: calculateCartTotals(lines, totals),
    issues,
    checkoutReady:
      lines.length > 0 && !issues.some((issue) => issue.severity === "blocking"),
  };
}

/** Blocking issues only — what stops an order being created. */
export function blockingIssues(cart: PricedCart): readonly CartIssue[] {
  return cart.issues.filter((issue) => issue.severity === "blocking");
}
