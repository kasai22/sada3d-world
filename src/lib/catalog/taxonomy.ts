/**
 * Catalog taxonomy — the facet definitions the marketplace filters on.
 *
 * Structure only. Counts are computed per request in query.ts against the
 * current result set, never stored here.
 */

import { CATALOG_CATEGORIES, CATALOG_ENTRIES, type CategoryDefinition } from "@/content/catalog";

import { CONFIGURATOR_COLOURS, MATERIAL_OPTIONS } from "@/lib/custom-print/options";
import { isApproved } from "@/content/catalog/decisions";

import { categoryIndexFor, nodesFromDefinitions, type CategoryIndex } from "./category-tree";
import type { Product } from "./types";

import { isVisible } from "./commerce";

export interface TaxonomyNode {
  value: string;
  label: string;
  children?: readonly TaxonomyNode[];
}

/* ------------------------------------------------------------------ *
 * Category
 * ------------------------------------------------------------------ */

/**
 * The category tree, read from the canonical catalog.
 *
 * Content reset: this used to be a 36-node tree written here, ahead of the
 * products that were meant to fill it. The tree now lives with the products in
 * `content/catalog`, where `validateCatalog` refuses a category with nothing
 * filed in it, and this module only reshapes it for the facet UI.
 */
export const CATEGORY_TREE: readonly TaxonomyNode[] = CATALOG_CATEGORIES.map(function toNode(
  node: CategoryDefinition,
): TaxonomyNode {
  return {
    value: node.value,
    label: node.label,
    ...(node.children ? { children: node.children.map(toNode) } : {}),
  };
});

/** The one-line description of a category, from the canonical tree. */
export function categoryDescription(value: string, index?: CategoryIndex): string | undefined {
  if (index) return index.description(value);
  const walk = (nodes: readonly CategoryDefinition[]): string | undefined => {
    for (const node of nodes) {
      if (node.value === value) return node.description;
      const found = node.children ? walk(node.children) : undefined;
      if (found) return found;
    }
    return undefined;
  };
  return walk(CATALOG_CATEGORIES);
}

/* ------------------------------------------------------------------ *
 * Flat facets
 * ------------------------------------------------------------------ */

/**
 * Materials offered as a filter, and the only ones a product may use.
 *
 * Stage 19.8: the approved offering (`MATERIAL_OPTIONS`), not every material the
 * software can describe. ABS and resin are not approved for launch, so they are
 * neither filterable nor publishable.
 */
export const MATERIALS: readonly TaxonomyNode[] = MATERIAL_OPTIONS.map((option) => ({
  value: option.value,
  label: option.name,
}));

/**
 * Print technologies offered as a filter.
 *
 * SLS was removed in Stage 19. `TechnologyValue` still admits it — the domain
 * and the CMS enum can express it — but no material in the system is a powder,
 * the configurator offers no SLS option, and the one catalog part that claimed
 * it also claimed a resin material, which SLS does not print. A facet nothing
 * can match is a capability claim in a filter list, so it is not offered until
 * the capability is real.
 */
export const TECHNOLOGIES: readonly TaxonomyNode[] = [
  { value: "fdm", label: "FDM" },
  { value: "sla", label: "SLA" },
  // Stage 19.8: only processes with an APPROVED manufacturing decision. SLA is
  // not approved for launch, so it is not offered as a filter or on a product.
].filter((technology) => isApproved("manufacturing-process", technology.value));

/**
 * Availability states offered as a filter, and the only ones a product may use.
 *
 * "In stock" was removed in the content reset. `AvailabilityValue` still admits
 * it and the CMS can still express it, but Reality 3D maintains no stock records —
 * nothing counts units on a shelf — so every part is made when it is ordered,
 * and a filter or a badge saying otherwise would be a claim with no data behind
 * it. `validateProduct` rejects it until stock is actually tracked.
 */
export const AVAILABILITY: readonly TaxonomyNode[] = [
  { value: "made-to-order", label: "Made to order" },
];

export interface ColorOption extends TaxonomyNode {
  /** Rendered as the swatch fill. */
  hex: string;
}

/** The colour vocabulary — names and swatches. Not an offering; see OFFERED_COLORS. */
export const COLORS: readonly ColorOption[] = CONFIGURATOR_COLOURS;

/**
 * Colours a customer can actually get: those offered for at least one approved
 * material. The shop's colour filter lists these and nothing else (Stage 19.8).
 */
export const OFFERED_COLORS: readonly ColorOption[] = COLORS.filter((colour) =>
  MATERIAL_OPTIONS.some((option) => option.colors.includes(colour.hex)),
);

/**
 * Price brackets rather than a slider.
 *
 * Brackets survive a round trip through the URL exactly, are keyboard-operable
 * with no custom key handling, and read back as a shareable link. A two-handle
 * slider gives none of that for a catalog of this size.
 */
export interface PriceBracket extends TaxonomyNode {
  min: number;
  /** Undefined means no upper bound. */
  max?: number;
}

export const PRICE_BRACKETS: readonly PriceBracket[] = [
  { value: "0-250", label: "Under ₹250", min: 0, max: 250 },
  { value: "250-500", label: "₹250 – ₹500", min: 250, max: 500 },
  { value: "500-1000", label: "₹500 – ₹1,000", min: 500, max: 1000 },
  { value: "1000-2500", label: "₹1,000 – ₹2,500", min: 1000, max: 2500 },
  { value: "2500", label: "Over ₹2,500", min: 2500 },
];

/* ------------------------------------------------------------------ *
 * Lookups
 * ------------------------------------------------------------------ */

/**
 * The repository seed's category index. Stage 20: the served catalog's index
 * comes from its source (`getCategoryIndex` in query.ts) and may include
 * categories an administrator created; these seed lookups are the default for
 * the local catalog and for code that has no source to ask.
 */
export const SEED_CATEGORY_INDEX: CategoryIndex = categoryIndexFor(nodesFromDefinitions(CATALOG_CATEGORIES));

/**
 * The value plus its ancestors, so selecting "Functional" matches a product
 * filed under "Gears".
 */
export function categoryPath(value: string, index: CategoryIndex = SEED_CATEGORY_INDEX): readonly string[] {
  return index.path(value);
}

export function categoryLabel(value: string, index: CategoryIndex = SEED_CATEGORY_INDEX): string | undefined {
  return index.label(value);
}

/** Human label for any facet value, used by the active-filter chips. */
export function facetLabel(facet: string, value: string, index: CategoryIndex = SEED_CATEGORY_INDEX): string {
  switch (facet) {
    case "category":
      return categoryLabel(value, index) ?? value;
    case "material":
      return MATERIALS.find((m) => m.value === value)?.label ?? value;
    case "technology":
      return TECHNOLOGIES.find((t) => t.value === value)?.label ?? value;
    case "availability":
      return AVAILABILITY.find((a) => a.value === value)?.label ?? value;
    case "color":
      return COLORS.find((c) => c.value === value)?.label ?? value;
    case "price":
      return PRICE_BRACKETS.find((p) => p.value === value)?.label ?? value;
    default:
      return value;
  }
}

/**
 * Top-level categories offered as browse destinations, in tree order.
 *
 * Derived, not listed. A destination exists when at least one canonical product
 * intended for publication is filed beneath it, so the rail, the
 * `/shop/[category]` allowlist, the sitemap and the footer can never offer a
 * category page with nothing on it. Before the reset this was a hand-kept list
 * of eight, including a "custom-products" page holding one quote-only record.
 *
 * Each value is a root of the tree above, so /shop/[category] and the category
 * facet stay in agreement.
 */
/**
 * Stage 19.8: the browse categories of a served catalog — every root category
 * with at least one product in it, in tree order. The catalog may include
 * administrator-managed products the repository has never seen, so pages ask
 * the catalog source (`getBrowseCategories` in query.ts) rather than reading
 * `BROWSE_CATEGORIES`, which describes the repository seed only.
 */
export function browseCategoriesFor(
  products: readonly Pick<Product, "browseCategory">[],
  index: CategoryIndex = SEED_CATEGORY_INDEX,
): string[] {
  const present = new Set(products.map((product) => product.browseCategory));
  return index.roots.filter((value) => present.has(value));
}

export const BROWSE_CATEGORIES: readonly string[] = CATALOG_CATEGORIES.map(
  (node) => node.value,
).filter((value) =>
  CATALOG_ENTRIES.some(
    (entry) =>
      entry.intent === "publish" &&
      entry.product.browseCategory === value &&
      // Stage 19.6: visible in this catalog mode, so a launch build never offers
      // a category page whose only parts are unapproved.
      isVisible(entry.product),
  ),
);
