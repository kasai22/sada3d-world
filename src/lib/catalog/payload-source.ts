import { unstable_cache } from "next/cache";

import { CONTENT_TAGS } from "@/lib/content/tags";

import { toDomainCatalog } from "./payload-mapping";
import type { Product } from "./types";

/**
 * The catalog, read from Payload.
 *
 * ── Reading the published catalog once, not per request ──────────────────
 *
 * The whole published catalog is read in one query and cached under the
 * `catalog` tag. Publishing anything in the CMS drops the tag and the next
 * request rebuilds it, so this is one read per publication rather than one per
 * visitor.
 *
 * That is a deliberate choice for a catalog of this size, and it is what makes
 * the facet counts correct. Phase 5's semantics count every facet against the
 * results of every *other* facet, which is six differently-filtered counts plus
 * the page — seven grouped queries per request if pushed into SQL, against a
 * cached in-memory pass over a few dozen products. The engine is shared with
 * the local source, so the numbers are identical by construction.
 *
 * `CATALOG_MAX` is the point at which that trade stops being true. It is a hard
 * cap rather than a comment: a catalog that outgrows it fails loudly here, and
 * the fix is to push filtering and faceting into SQL. Silently paging a
 * too-large catalog would produce facet counts that are quietly wrong.
 *
 * ── Only what the public may see ─────────────────────────────────────────
 *
 * `overrideAccess: false` makes Payload apply the collection's access rules to
 * this query as though it were an anonymous request, so drafts are excluded by
 * the same rule that excludes them from the REST API. Reading with access
 * overridden — the default for server-side calls — would publish every draft to
 * the storefront.
 */

/** Beyond this the read-everything strategy has to be replaced by SQL. */
export const CATALOG_MAX = 1000;

export class CatalogTooLargeError extends Error {}

async function readPublishedCatalog(): Promise<Product[]> {
  const [{ getPayload }, { default: config }] = await Promise.all([
    import("payload"),
    import("@payload-config"),
  ]);

  const payload = await getPayload({ config });

  const result = await payload.find({
    collection: "products",
    /*
     * The access rules decide what is visible, not this call. Payload's
     * server-side default is to bypass them.
     */
    overrideAccess: false,
    /* Categories and materials are needed to map a product; one query with
       depth 1 rather than a lookup per product. */
    depth: 1,
    limit: CATALOG_MAX + 1,
    pagination: false,
  });

  if (result.docs.length > CATALOG_MAX) {
    throw new CatalogTooLargeError(
      `The catalog has more than ${CATALOG_MAX} published products. ` +
        "Filtering and facet counting must move into SQL before it can grow further.",
    );
  }

  const { products, failures } = toDomainCatalog(result.docs);

  if (failures.length > 0) {
    /*
     * Server-side only, and named. A product an operator has broken is invisible
     * on the storefront, and the only way anyone finds out is if this says so.
     */
    console.warn(
      `[sada3d] ${failures.length} product(s) were skipped as unpublishable:\n` +
        failures.map((f) => `  ${f.productId}: ${f.reason}`).join("\n"),
    );
  }

  return products;
}

/**
 * The cached read.
 *
 * `unstable_cache` rather than `use cache`: this project does not enable the
 * `cacheComponents` flag, and this is the caching model that applies without
 * it. The tag is what the Payload publish hooks invalidate.
 */
const cachedCatalog = unstable_cache(readPublishedCatalog, ["sada3d-catalog"], {
  tags: [CONTENT_TAGS.catalog],
});

export async function loadPayloadCatalog(): Promise<readonly Product[]> {
  return cachedCatalog();
}

/** The uncached read, for the parity verifier, which must see the real state. */
export async function loadPayloadCatalogUncached(): Promise<readonly Product[]> {
  return readPublishedCatalog();
}
