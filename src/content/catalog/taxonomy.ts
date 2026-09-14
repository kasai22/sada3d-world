import type { CategoryDefinition } from "./types";

/**
 * The category tree, rebuilt in the content reset.
 *
 * ── A category exists only if a product is filed in it ───────────────────
 *
 * The previous tree had 36 nodes — seven top-level destinations, twenty-odd
 * leaves and a "Functional" grouping node that had no page — built to look like
 * a full catalog before there was a catalog to fill it. Payload had accumulated
 * operator test rows on top of that ("18% GST", "20% Profit", "v-gears").
 *
 * This tree is the opposite rule, and `validateCatalog` enforces it: every node
 * has at least one product beneath it. A new category is added in the same
 * change as the first product filed in it, never ahead of one.
 *
 * Top-level nodes are the browse destinations (`/shop/[category]`); leaves are
 * what a product's `category` names. Which destinations are *routable* is
 * derived in `lib/catalog/taxonomy.ts` from what is actually published.
 */
export const CATALOG_CATEGORIES: readonly CategoryDefinition[] = [
  {
    value: "mechanical",
    label: "Mechanical",
    description: "Gears and shaft hardware for mechanisms, mock-ups and teaching models.",
    children: [
      {
        value: "gears",
        label: "Gears",
        description: "Spur gears and gear sets.",
      },
      {
        value: "spacers",
        label: "Spacers",
        description: "Shaft and rod spacers.",
      },
    ],
  },
];
