/**
 * SKU format (Stage 20).
 *
 * A SKU is assigned by the business and entered in the admin — never generated.
 * This module checks only its shape, so a typo cannot become a commercial
 * identifier: 3–32 characters, uppercase letters and digits in groups joined by
 * single hyphens. Documented example shape: "RG-GEAR-024" — the business chooses
 * the actual scheme.
 *
 * Uniqueness is enforced by the database (a unique index on products.sku) and
 * reported by the admin on save.
 *
 * Dependency-free: imported by the storefront assessment and by the Payload
 * collection (which cannot use path aliases).
 */

export const SKU_PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
export const SKU_MIN = 3;
export const SKU_MAX = 32;

/** Why a SKU is malformed, or undefined when it is well-formed or empty. */
export function skuProblem(sku: string | null | undefined): string | undefined {
  if (sku === null || sku === undefined || sku === "") return undefined;
  if (sku !== sku.trim()) return "The SKU has leading or trailing spaces.";
  if (sku.length < SKU_MIN || sku.length > SKU_MAX) return `A SKU is ${SKU_MIN}–${SKU_MAX} characters long.`;
  if (!SKU_PATTERN.test(sku)) {
    return 'A SKU uses uppercase letters and digits in groups joined by single hyphens, e.g. "RG-GEAR-024".';
  }
  return undefined;
}

/** Product classes that are sold at a catalog price and therefore need a SKU. */
export function classRequiresSku(productClass: string | null | undefined): boolean {
  return productClass !== "QUOTE_ONLY_PRODUCT";
}
