import { CATALOG_ENTRIES } from "@/content/catalog";

import { assessLaunch } from "./launch";
import { summarize } from "./payload-entry";
import { catalogOrder, type Product } from "./types";
import { validateCatalog } from "./validation";

/**
 * The published subset of the canonical catalog.
 *
 * ── What this module is now ──────────────────────────────────────────────
 *
 * Until the content reset this file *was* a catalog: 36 hand-written products
 * that Payload had been imported from and had since drifted away from. It is now
 * a view. The products live in `content/catalog`, one file each; this exports
 * the ones that are intended for publication and pass `validateCatalog`, which
 * is exactly the set the importer publishes to Payload.
 *
 * Two consumers read it:
 *
 *   · the local `CatalogSource`, for builds, tests and development with no
 *     database — a development seed of the same data, never a second catalog;
 *   · `content:verify`, as the expected side of the Payload parity check.
 *
 * A product that fails validation is not here, so the storefront cannot render
 * an entry the importer would have refused to publish.
 */
export const PRODUCTS: readonly Product[] = validateCatalog(CATALOG_ENTRIES)
  .publishable.map((entry) => ({ ...entry.product, launch: summarize(assessLaunch(entry, entry.product)) }))
  .sort(catalogOrder);
