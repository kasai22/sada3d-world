/**
 * Catalog taxonomy — the facet definitions the marketplace filters on.
 *
 * Structure only. Counts are computed per request in query.ts against the
 * current result set, never stored here.
 */

export interface TaxonomyNode {
  value: string;
  label: string;
  children?: readonly TaxonomyNode[];
}

/* ------------------------------------------------------------------ *
 * Category
 * ------------------------------------------------------------------ */

export const CATEGORY_TREE: readonly TaxonomyNode[] = [
  {
    value: "functional",
    label: "Functional",
    children: [
      {
        value: "mechanical",
        label: "Mechanical",
        children: [
          { value: "gears", label: "Gears" },
          { value: "tools", label: "Tools" },
          { value: "bearings", label: "Bearings" },
        ],
      },
      {
        value: "automotive",
        label: "Automotive",
        children: [
          { value: "interior", label: "Interior" },
          { value: "exterior", label: "Exterior" },
          { value: "engine-bay", label: "Engine bay" },
        ],
      },
      {
        value: "industrial",
        label: "Industrial",
        children: [
          { value: "jigs", label: "Jigs" },
          { value: "fixtures", label: "Fixtures" },
          { value: "tooling", label: "Tooling" },
        ],
      },
    ],
  },
  {
    value: "components",
    label: "Components",
    children: [
      { value: "brackets", label: "Brackets" },
      { value: "housings", label: "Housings" },
      { value: "couplers", label: "Couplers" },
      { value: "fasteners", label: "Fasteners" },
    ],
  },
  {
    value: "lifestyle",
    label: "Lifestyle",
    children: [
      {
        value: "home",
        label: "Home",
        children: [
          { value: "decor", label: "Decor" },
          { value: "organization", label: "Organization" },
        ],
      },
    ],
  },
  {
    value: "architecture",
    label: "Architecture",
    children: [
      { value: "scale-models", label: "Scale models" },
      { value: "facade-studies", label: "Facade studies" },
    ],
  },
  {
    value: "prototyping",
    label: "Prototyping",
    children: [
      { value: "form-studies", label: "Form studies" },
      { value: "fit-checks", label: "Fit checks" },
    ],
  },
  { value: "custom-products", label: "Custom products" },
];

/* ------------------------------------------------------------------ *
 * Flat facets
 * ------------------------------------------------------------------ */

export const MATERIALS: readonly TaxonomyNode[] = [
  { value: "pla", label: "PLA" },
  { value: "petg", label: "PETG" },
  { value: "abs", label: "ABS" },
  { value: "tpu", label: "TPU" },
  { value: "resin", label: "Resin" },
];

export const TECHNOLOGIES: readonly TaxonomyNode[] = [
  { value: "fdm", label: "FDM" },
  { value: "sla", label: "SLA" },
  { value: "sls", label: "SLS" },
];

export const AVAILABILITY: readonly TaxonomyNode[] = [
  { value: "in-stock", label: "In stock" },
  { value: "made-to-order", label: "Made to order" },
];

export interface ColorOption extends TaxonomyNode {
  /** Rendered as the swatch fill. */
  hex: string;
}

export const COLORS: readonly ColorOption[] = [
  { value: "black", label: "Black", hex: "#050506" },
  { value: "graphite", label: "Graphite", hex: "#2A2E35" },
  { value: "titanium", label: "Titanium", hex: "#6C737C" },
  { value: "grey", label: "Grey", hex: "#A9B0B9" },
  { value: "white", label: "White", hex: "#F4F6F8" },
  { value: "orange", label: "Orange", hex: "#FF6B00" },
  { value: "blue", label: "Blue", hex: "#4DA3FF" },
];

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

/** Every category value mapped to itself plus all of its ancestors. */
const CATEGORY_ANCESTORS = new Map<string, readonly string[]>();
/** Every category value mapped to its label. */
const CATEGORY_LABELS = new Map<string, string>();

(function indexCategories(nodes: readonly TaxonomyNode[], trail: string[] = []) {
  for (const node of nodes) {
    const path = [...trail, node.value];
    CATEGORY_ANCESTORS.set(node.value, path);
    CATEGORY_LABELS.set(node.value, node.label);
    if (node.children) indexCategories(node.children, path);
  }
})(CATEGORY_TREE);

/**
 * The value plus its ancestors, so selecting "Functional" matches a product
 * filed under "Gears".
 */
export function categoryPath(value: string): readonly string[] {
  return CATEGORY_ANCESTORS.get(value) ?? [value];
}

export function categoryLabel(value: string): string | undefined {
  return CATEGORY_LABELS.get(value);
}

/** Human label for any facet value, used by the active-filter chips. */
export function facetLabel(facet: string, value: string): string {
  switch (facet) {
    case "category":
      return categoryLabel(value) ?? value;
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
 * Categories offered as top-level browse destinations, in rail order. Each is a
 * real node in the tree above, so /shop/[category] and the category facet stay
 * in agreement.
 */
export const BROWSE_CATEGORIES: readonly string[] = [
  "mechanical",
  "automotive",
  "industrial",
  "components",
  "lifestyle",
  "architecture",
  "prototyping",
  "custom-products",
];
