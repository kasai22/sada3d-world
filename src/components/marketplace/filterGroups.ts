import type { FilterGroup, FilterNode } from "@/components/navigation";
import {
  AVAILABILITY,
  CATEGORY_TREE,
  MATERIALS,
  PRICE_BRACKETS,
  TECHNOLOGIES,
  type TaxonomyNode,
} from "@/lib/catalog/taxonomy";
import type { CatalogFacets, FacetCounts } from "@/lib/catalog/types";

/**
 * Turns the taxonomy plus this request's facet counts into FilterTree groups.
 *
 * Runs on the server: the result is plain serialisable data handed to the
 * client filter panel, so the taxonomy never ships to the browser.
 */

function toNodes(
  nodes: readonly TaxonomyNode[],
  counts: FacetCounts,
  depth = 0,
): FilterNode[] {
  return nodes.map((node) => ({
    value: node.value,
    label: node.label,
    count: counts[node.value] ?? 0,
    // Only the first level opens by default; deeper levels stay collapsed so
    // the sidebar does not open at full height.
    defaultOpen: depth === 0,
    children: node.children ? toNodes(node.children, counts, depth + 1) : undefined,
  }));
}

function toFlatNodes(
  nodes: readonly TaxonomyNode[],
  counts: FacetCounts,
): FilterNode[] {
  return nodes.map((node) => ({
    value: node.value,
    label: node.label,
    count: counts[node.value] ?? 0,
  }));
}

export interface BuildFilterGroupsOptions {
  /**
   * Off on a category route, where the category is fixed by the path. Showing
   * the tree there would list every sibling category at zero.
   */
  includeCategory?: boolean;
}

export function buildFilterGroups(
  facets: CatalogFacets,
  { includeCategory = true }: BuildFilterGroupsOptions = {},
): FilterGroup[] {
  return [
    ...(includeCategory
      ? [
          {
            key: "category",
            label: "Category",
            options: toNodes(CATEGORY_TREE, facets.category),
          },
        ]
      : []),
    {
      key: "material",
      label: "Material",
      options: toFlatNodes(MATERIALS, facets.material),
    },
    {
      key: "technology",
      label: "Print technology",
      options: toFlatNodes(TECHNOLOGIES, facets.technology),
    },
    {
      key: "price",
      label: "Price",
      options: toFlatNodes(PRICE_BRACKETS, facets.price),
    },
    {
      key: "availability",
      label: "Availability",
      defaultOpen: false,
      options: toFlatNodes(AVAILABILITY, facets.availability),
    },
  ];
}
