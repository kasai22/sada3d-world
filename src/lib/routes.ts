/**
 * Canonical public URLs.
 *
 * ── Why this module exists ───────────────────────────────────────────────
 *
 * Before Stage 19 six different places built a product URL from a template
 * literal, and one of them — the homepage — built `/shop/{slug}` while the real
 * route is `/shop/[category]/[slug]`. Every featured product on the homepage
 * pointed at a 404, and nothing in the type system could notice, because a
 * wrong string is still a string.
 *
 * So URL construction has one home. A component that wants to link to a product
 * calls `productHref(product)`; it never assembles the path itself. The rule is
 * the same one `query.ts` applies to data: **one seam, and everything goes
 * through it.**
 *
 * ── Why it is pure ───────────────────────────────────────────────────────
 *
 * Nothing here imports the catalog, the taxonomy or Payload. These are string
 * functions over values a caller already holds, which is what lets a client
 * component import them without dragging a Postgres driver into the browser
 * bundle — the same reasoning as `catalog/format.ts`.
 *
 * Validity is a separate concern and is checked by `lib/catalog/links.test.ts`,
 * which resolves every internal href in the source against the real route table
 * and the real catalog.
 */

/** Every informational and top-level public destination, by name. */
export const ROUTES = {
  home: "/",
  shop: "/shop",
  customPrint: "/custom-print",
  materials: "/materials",
  solutions: "/solutions",
  howItWorks: "/how-it-works",
  cart: "/cart",
  checkout: "/checkout",
  account: "/account",
  accountOrders: "/account/orders",
  accountDesigns: "/account/designs",
  orderLookup: "/orders",
  login: "/login",
} as const;

export type RouteName = keyof typeof ROUTES;

/**
 * The minimum a product must supply to be addressable.
 *
 * Structural rather than `Product`, so this module stays free of catalog
 * imports and a caller holding only the two fields can still ask for the URL.
 */
export interface ProductRef {
  browseCategory: string;
  slug: string;
}

/**
 * The canonical page for a product.
 *
 * Category-aware by construction. `/shop/{slug}` is not a shorter form of this
 * address — it is not an address at all.
 */
export function productHref(product: ProductRef): string {
  return `${ROUTES.shop}/${product.browseCategory}/${product.slug}`;
}

/** The browse page for a top-level category. */
export function categoryHref(value: string): string {
  return `${ROUTES.shop}/${value}`;
}

/**
 * The catalog filtered to one facet value, e.g. every part in PETG.
 *
 * Built with URLSearchParams rather than interpolation so a value containing a
 * reserved character produces a valid URL instead of a broken one.
 */
export function shopFilterHref(facet: string, value: string): string {
  const search = new URLSearchParams();
  search.set(facet, value);
  return `${ROUTES.shop}?${search.toString()}`;
}

/**
 * A material's section on the materials page.
 *
 * A fragment rather than a route: the page is a single comparison document, and
 * splitting five materials across five thin pages would make comparing them —
 * the only reason anyone opens it — require five navigations.
 */
export function materialHref(value: string): string {
  return `${ROUTES.materials}#${value}`;
}

/** A solution's section on the solutions page. Same reasoning as materials. */
export function solutionHref(value: string): string {
  return `${ROUTES.solutions}#${value}`;
}

/** A stage's section on the how-it-works page. */
export function processStageHref(value: string): string {
  return `${ROUTES.howItWorks}#${value}`;
}
