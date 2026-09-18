import type { CategoryIndex } from "./category-tree";
import { visibleProducts } from "./commerce";
import { serverCatalogMode } from "./commerce-server";
import { PRODUCTS } from "./products";
import { relatedProducts, runCatalogQuery } from "./engine";
import { SEED_CATEGORY_INDEX } from "./taxonomy";
import type { CatalogQuery, CatalogResult, Product } from "./types";

/**
 * Where the catalog comes from.
 *
 * ── The seam ─────────────────────────────────────────────────────────────
 *
 *   Marketplace  →  queryCatalog()  →  CatalogSource  →  local | Payload
 *
 * The marketplace only ever sees `CatalogResult`. Which source produced it is
 * decided here and nowhere else, so moving the catalog into the CMS changes no
 * page, no component and no route.
 *
 * ── Which one is canonical, and why it is still the local one ────────────
 *
 * The local typed catalog remains the source of truth. That is a deliberate
 * gate, not an omission:
 *
 *   · Payload's tables do not exist until `DATABASE_URL` is set and the
 *     migrations are run, so with no database there is nothing to read.
 *   · The product pages are statically generated with `dynamicParams = false`,
 *     which means `productParams()` is the allowlist for every product URL. A
 *     build that asked an unreachable database for that list would produce an
 *     empty allowlist and 404 all thirty-six products.
 *   · Nothing should replace the catalog before the two have been shown to
 *     agree. `npm run content:verify` is that proof, and it needs a database.
 *
 * So the switch is explicit and one variable wide: set `CATALOG_SOURCE=payload`
 * once the import has run and the parity check passes. Until then the
 * storefront reads exactly what it read before this phase, and the Payload path
 * is exercised by the verifier rather than by customers.
 */

export interface CatalogSource {
  readonly name: string;
  query(query: CatalogQuery): Promise<CatalogResult>;
  all(): Promise<readonly Product[]>;
  size(): Promise<number>;
  byId(id: string): Promise<Product | undefined>;
  bySlug(browseCategory: string, slug: string): Promise<Product | undefined>;
  related(product: Product, limit: number): Promise<Product[]>;
  params(): Promise<{ category: string; slug: string }[]>;
  /** Stage 20: the category tree this source serves — seed or CMS. */
  categories(): Promise<CategoryIndex>;
}

/**
 * Everything a source needs once it can produce a product list.
 *
 * Both sources share it, so filtering, sorting, facet counting and paging are
 * one implementation rather than two that have to be kept in agreement.
 */
export function catalogSourceFrom(
  name: string,
  load: () => Promise<readonly Product[]>,
  loadCategories: () => Promise<CategoryIndex> = async () => SEED_CATEGORY_INDEX,
): CatalogSource {
  return {
    name,

    all: load,

    categories: loadCategories,

    async query(query: CatalogQuery): Promise<CatalogResult> {
      return runCatalogQuery(await load(), query, await loadCategories());
    },

    async size(): Promise<number> {
      return (await load()).length;
    },

    async byId(id: string): Promise<Product | undefined> {
      return (await load()).find((product) => product.id === id);
    },

    /**
     * The category must match the product's own — /shop/lifestyle/precision-gear
     * is not a valid address for a mechanical part and returns undefined so the
     * route can 404 rather than serve one product under two URLs.
     */
    async bySlug(browseCategory: string, slug: string): Promise<Product | undefined> {
      return (await load()).find(
        (product) =>
          product.slug === slug && product.browseCategory === browseCategory,
      );
    },

    async related(product: Product, limit: number): Promise<Product[]> {
      return relatedProducts(await load(), product, limit);
    },

    async params(): Promise<{ category: string; slug: string }[]> {
      return (await load()).map((product) => ({
        category: product.browseCategory,
        slug: product.slug,
      }));
    },
  };
}


/*
 * Stage 19.6: both sources serve only what the catalog mode makes visible —
 * approved products in launch mode, approved and provisional ones in review
 * mode. Applied here, once, so the shop, product pages, cart, checkout, sitemap
 * and materials counts all see the same set. The parity verifier reads the
 * unfiltered published catalog directly.
 */
export const localCatalogSource: CatalogSource = catalogSourceFrom(
  "local",
  async () => visibleProducts(PRODUCTS, serverCatalogMode()),
);

/* ------------------------------------------------------------------ *
 * Resolution
 * ------------------------------------------------------------------ */

let override: CatalogSource | null = null;

/** For the parity verifier and for tests. No request can reach it. */
export function setCatalogSource(source: CatalogSource | null): void {
  override = source;
}

/** Whether this deployment has been switched over to the CMS catalog. */
export function payloadCatalogSelected(): boolean {
  return process.env.CATALOG_SOURCE === "payload";
}

let payload: CatalogSource | null = null;

export function resolveCatalogSource(): CatalogSource {
  if (override) return override;
  if (!payloadCatalogSelected()) return localCatalogSource;

  if (!payload) {
    /*
     * Required lazily so the Payload runtime is only pulled in by a deployment
     * that has actually switched to it. A storefront on the local catalog does
     * not load the CMS to render a product page.
     */
    payload = lazyPayloadSource();
  }

  return payload;
}

/**
 * A source that resolves the Payload implementation on first use.
 *
 * The dynamic import cannot happen at module scope — this module is imported by
 * every marketplace page, and Payload is a large runtime that a build on the
 * local catalog should never load.
 */
function lazyPayloadSource(): CatalogSource {
  return catalogSourceFrom(
    "payload",
    async () => {
      const { loadPayloadCatalog } = await import("./payload-source");
      return visibleProducts(await loadPayloadCatalog(), serverCatalogMode());
    },
    async () => {
      const { loadPayloadCategoryIndex } = await import("./payload-source");
      return loadPayloadCategoryIndex();
    },
  );
}
