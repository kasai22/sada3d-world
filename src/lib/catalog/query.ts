import { PAGE_SIZE } from "./engine";
import { selectFeatured, type FeaturedSelection } from "./featured";
import { formatPrice, isQuoteOnly, partId, productHref } from "./format";
import { resolveCatalogSource } from "./source";
import { browseCategoriesFor } from "./taxonomy";
import type { CatalogQuery, CatalogResult, Product } from "./types";

/**
 * The single boundary between catalog data and everything that consumes it.
 *
 * Phase 5 created it over a typed array. Phase 14 put a `CatalogSource` behind
 * it, so the same functions answer from the local catalog or from Payload
 * depending on configuration, and no page, component or domain module knows
 * which.
 *
 * ── Async, as of this phase ──────────────────────────────────────────────
 *
 * The data-access functions now return promises, because a database does. The
 * *pure* helpers below — `isQuoteOnly`, `formatPrice`, `productHref`, `partId`
 * — deliberately did not change: they operate on a product that has already
 * been loaded, they are called from components during render, and making them
 * async would have pushed the client boundary through half the product page for
 * no reason.
 *
 * Data access is async. Presentation of loaded data is not.
 */

/*
 * Re-exported so server code has one import path for the catalog. Components
 * must import them from "./format" instead — see the note there.
 */
export { PAGE_SIZE, formatPrice, isQuoteOnly, partId, productHref };

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

export async function queryCatalog(query: CatalogQuery): Promise<CatalogResult> {
  return resolveCatalogSource().query(query);
}

/**
 * Every published product.
 *
 * For pages that describe the catalog rather than browse it — the materials and
 * solutions pages count parts and read which technologies are actually in use.
 * `queryCatalog` is the wrong tool for that: its `items` are one page of
 * twelve, so counting them would have quietly under-reported every total.
 */
export async function allCatalogProducts(): Promise<readonly Product[]> {
  return resolveCatalogSource().all();
}

/** Total catalog size, for the shop landing copy. */
export async function catalogSize(): Promise<number> {
  return resolveCatalogSource().size();
}

/**
 * Resolves one product by its browse category and slug.
 *
 * The category must match the product's own — /shop/lifestyle/precision-gear is
 * not a valid address for a mechanical part and returns undefined so the route
 * can 404 rather than serve the same product under two URLs.
 */
export async function getProduct(
  browseCategory: string,
  slug: string,
): Promise<Product | undefined> {
  return resolveCatalogSource().bySlug(browseCategory, slug);
}

/**
 * Looks a product up by its identifier.
 *
 * The cart stores a product id and nothing else about the product, so this is
 * how a cart line is resolved back to trusted catalog data. Returning undefined
 * is meaningful: the product is no longer in the catalog — withdrawn,
 * unpublished or removed — and a cart line that points at it can no longer be
 * bought.
 */
export async function getProductById(id: string): Promise<Product | undefined> {
  return resolveCatalogSource().byId(id);
}

/** Related parts: nearest first. See `engine.relatedProducts`. */
export async function getRelatedProducts(
  product: Product,
  limit = 4,
): Promise<Product[]> {
  return resolveCatalogSource().related(product, limit);
}

/**
 * The homepage's featured parts, resolved against the live catalog.
 *
 * The homepage names products by id and nothing else. Name, price, material and
 * — the part that used to be wrong — the URL all come from the catalog, so a
 * featured card cannot describe a product that does not exist or link to an
 * address that does not resolve. See `featured.ts` for what is refused.
 */
export async function getFeaturedProducts(): Promise<FeaturedSelection> {
  // Stage 19.6: products flagged `featured` that are launchable — no id list.
  const products = await resolveCatalogSource().all();
  return selectFeatured(products, undefined, browseCategoriesFor(products));
}

/**
 * Browse categories of the catalog actually served — seed and
 * administrator-managed products alike, in this catalog mode. The category
 * route, rail, footer, homepage index and sitemap all read this, so a category
 * an administrator fills appears everywhere at once, and one that empties
 * disappears everywhere at once.
 */
export async function getBrowseCategories(): Promise<string[]> {
  return browseCategoriesFor(await resolveCatalogSource().all());
}

/**
 * Every category/slug pair known at build time, for generateStaticParams.
 * Stage 19.8: not an allowlist any more — a product an administrator publishes
 * after the build is rendered on first request, and an unknown one 404s in the
 * page (there is no loading boundary above it, so the status is still 404).
 */
export async function productParams(): Promise<
  { category: string; slug: string }[]
> {
  return resolveCatalogSource().params();
}

