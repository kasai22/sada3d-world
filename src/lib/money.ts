/**
 * Money formatting.
 *
 * One formatter for the whole application, so ₹ amounts never differ in
 * grouping or decimals between the catalog, the product page and a quote.
 * Indian grouping: ₹1,036 · ₹12,500 · ₹1,25,000.
 */

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

/** Whole rupees. Amounts are rounded before they reach this function. */
export function formatINR(value: number): string {
  return INR.format(value);
}
