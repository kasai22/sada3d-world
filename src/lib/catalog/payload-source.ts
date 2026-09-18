import { unstable_cache } from "next/cache";

import { CONTENT_TAGS } from "@/lib/content/tags";

import { catalogAssets } from "./catalog-assets";
import { categoryIndexFor, type CategoryIndex, type CategoryNode } from "./category-tree";
import { readCategoryTree } from "./payload-categories";
import { entryFromPayloadDoc } from "./payload-entry";
import { applyPriceApprovals, toDomainCatalog } from "./payload-mapping";
import type { PriceApprovalRecord } from "./commerce";
import { catalogOrder, type Product } from "./types";

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
     * Published documents only — the same constraint the public access rule
     * applies — read with access overridden so the server sees the approval
     * records a launch assessment needs. The storefront never receives those
     * records; it receives the product and its computed launch summary.
     */
    where: { _status: { equals: "published" } },
    overrideAccess: true,
    draft: false,
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

  // Mapping failures are reported below; each mapped document is re-assessed per product.
  const mapped = toDomainCatalog(result.docs);

  /*
   * Price approvals are operator-only records, read here on the server with
   * access overridden. Nothing about them reaches a browser except the price
   * status they justify.
   */
  const approvalDocs = await payload.find({
    collection: "price-approvals",
    depth: 1,
    pagination: false,
    overrideAccess: true,
  });
  const approvals = new Map<string, PriceApprovalRecord[]>();
  for (const doc of approvalDocs.docs) {
    const product = typeof doc.product === "object" && doc.product ? doc.product.productId : undefined;
    if (!product) continue;
    approvals.set(product, [
      ...(approvals.get(product) ?? []),
      {
        amount: doc.amount,
        currency: "INR",
        effectiveFrom: String(doc.effectiveFrom).slice(0, 10),
        reference: doc.reference,
        approvedBy: doc.approvedBy,
      },
    ]);
  }

  const priced = applyPriceApprovals(mapped.products, approvals);
  const failures = [...mapped.failures, ...priced.failures];

  /*
   * Stage 19.8: every product carries its launch summary, computed here on the
   * server from its full record — commercial approval, media approval, price
   * approvals, manufacturing capability. Featuring and launch-mode visibility
   * honour it; nothing a client sends can set it.
   */
  const byId = new Map(result.docs.map((doc) => [doc.productId, doc]));
  // Stage 20: judged against the CMS category tree and the files verified on disk.
  const [tree, assets] = await Promise.all([readCategoryTree(payload), catalogAssets()]);
  const validation = { categories: tree.tree, models: assets.models, mediaFiles: assets.mediaFiles };
  const products = priced.products.map((product) => {
    const doc = byId.get(product.id);
    if (!doc) return product;
    const assessed = entryFromPayloadDoc(doc, approvals.get(product.id) ?? [], new Date(), validation);
    return assessed.ok ? { ...product, launch: assessed.product.launch } : product;
  });

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

  // Same order as the local source; see `catalogOrder`.
  return products.sort(catalogOrder);
}

async function readPublishedCategoryTree(): Promise<CategoryNode[]> {
  const [{ getPayload }, { default: config }] = await Promise.all([import("payload"), import("@payload-config")]);
  const { tree, problems } = await readCategoryTree(await getPayload({ config }));
  if (problems.length > 0) console.warn(`[sada3d] category tree: ${problems.join(" ")}`);
  return tree;
}

const cachedCategoryTree = unstable_cache(readPublishedCategoryTree, ["sada3d-categories"], {
  tags: [CONTENT_TAGS.catalog],
});

export async function loadPayloadCategoryIndex(): Promise<CategoryIndex> {
  return categoryIndexFor(await cachedCategoryTree());
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
