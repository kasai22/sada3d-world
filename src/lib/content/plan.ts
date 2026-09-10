import { PRODUCTS } from "@/lib/catalog/products";
import {
  BROWSE_CATEGORIES,
  CATEGORY_TREE,
  MATERIALS as MATERIAL_FACETS,
  type TaxonomyNode,
} from "@/lib/catalog/taxonomy";
import { MATERIALS as MATERIAL_CONTENT } from "@/content/home";
import type { Product } from "@/lib/catalog/types";

/**
 * What the import will write, worked out before anything is written.
 *
 * Pure: the local content in, a list of rows out. Nothing here touches Payload
 * or a database, which is what makes the hard part of the migration — the
 * flattening of a nested taxonomy, the joining of three separate material
 * definitions, the ordering that lets parents exist before children — testable
 * without either.
 *
 * The CLI in `cli/import.ts` takes these rows and writes them. It contains no
 * decisions of its own.
 */

/* ------------------------------------------------------------------ *
 * Categories
 * ------------------------------------------------------------------ */

export interface CategoryRow {
  value: string;
  name: string;
  /** The parent's `value`, or null for a top-level category. */
  parent: string | null;
  /** 0 for a root. Derived, not stored in the CMS. */
  depth: number;
  isBrowse: boolean;
  browseOrder: number;
}

/**
 * The category tree, flattened parents-first.
 *
 * Order matters and is not incidental: a child's parent must already exist
 * before the child can point at it, and a breadth-first walk is what guarantees
 * that without the importer needing a second pass or a retry.
 *
 * `isBrowse` and `browseOrder` come from `BROWSE_CATEGORIES`, which is an
 * ordered list mixing depths — "mechanical" is a second-level category and
 * "components" is a first-level one. That is real and is preserved rather than
 * tidied into something more regular.
 */
export function planCategories(): CategoryRow[] {
  const rows: CategoryRow[] = [];

  const walk = (nodes: readonly TaxonomyNode[], parent: string | null, depth: number) => {
    for (const node of nodes) {
      const browseIndex = BROWSE_CATEGORIES.indexOf(node.value);

      rows.push({
        value: node.value,
        name: node.label,
        parent,
        depth,
        isBrowse: browseIndex !== -1,
        browseOrder: browseIndex === -1 ? 0 : browseIndex,
      });
    }

    // Breadth-first: every node at this depth is recorded before any child of
    // any of them, so a parent is never written after its child.
    for (const node of nodes) {
      if (node.children) walk(node.children, node.value, depth + 1);
    }
  };

  walk(CATEGORY_TREE, null, 0);
  return rows;
}

/* ------------------------------------------------------------------ *
 * Materials
 * ------------------------------------------------------------------ */

export interface MaterialRow {
  value: string;
  name: string;
  code?: string;
  description?: string;
  properties?: { strength: number; flexibility: number; heat: number };
  applications: string[];
  surface?: string;
  swatches: string[];
}

/**
 * Three definitions of the same five materials, joined into one.
 *
 * `taxonomy.ts` has the facet value and the label; `content/home.ts` has the
 * description, the properties and the swatches. The join key is the facet
 * value, matched against the content entry's name case-insensitively — which is
 * exactly the fragile correspondence this collection exists to remove.
 *
 * The **price multiplier deliberately does not come across**. It lives in
 * `content/home.ts` as a display string beside the real one in
 * `lib/pricing`, and importing it would put a number a customer is charged by
 * behind an editorial field. The homepage derives the figure it shows from the
 * pricing rules instead.
 */
export function planMaterials(): MaterialRow[] {
  return MATERIAL_FACETS.map((facet) => {
    const content = MATERIAL_CONTENT.find(
      (entry) => entry.name.toLowerCase() === facet.label.toLowerCase(),
    );

    return {
      value: facet.value,
      name: facet.label,
      ...(content
        ? {
            code: content.code,
            description: content.description,
            properties: { ...content.properties },
            applications: [...content.applications],
            surface: content.surface,
            swatches: [...content.colors],
          }
        : { applications: [], swatches: [] }),
    };
  });
}

/* ------------------------------------------------------------------ *
 * Products
 * ------------------------------------------------------------------ */

export interface ProductRow {
  productId: string;
  slug: string;
  name: string;
  summary: string;
  description?: string;
  applications: string[];
  price: number;
  currency: "INR";
  availability: string;
  badge?: string;
  /** Category `value`, resolved to a Payload id by the importer. */
  category: string;
  browseCategory: string;
  /** Material `value`, resolved to a Payload id by the importer. */
  material: string;
  materials: string[];
  technology: string;
  color: string;
  colors: string[];
  qualityOptions: { value: string; label: string; layerHeight: string }[];
  specifications: { label: string; value: string }[];
  materialNotes: string[];
  model?: { url: string; format: string };
}

function toProductRow(product: Product): ProductRow {
  return {
    productId: product.id,
    slug: product.slug,
    name: product.name,
    summary: product.summary,
    ...(product.description ? { description: product.description } : {}),
    applications: [...(product.applications ?? [])],
    price: product.price,
    currency: product.currency,
    availability: product.availability,
    ...(product.badge ? { badge: product.badge } : {}),
    category: product.category,
    browseCategory: product.browseCategory,
    material: product.material,
    // The default is always among the offered materials, even where the local
    // record left the list off entirely.
    materials: [...new Set([product.material, ...(product.materials ?? [])])],
    technology: product.technology,
    color: product.color,
    colors: [...(product.colors ?? [])],
    qualityOptions: (product.qualityOptions ?? []).map((option) => ({ ...option })),
    specifications: (product.specifications ?? []).map((spec) => ({ ...spec })),
    materialNotes: [...(product.materialNotes ?? [])],
    ...(product.model ? { model: { ...product.model } } : {}),
  };
}

export function planProducts(): ProductRow[] {
  return PRODUCTS.map(toProductRow);
}

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

export interface PlanProblem {
  subject: string;
  reason: string;
}

/**
 * Checks the plan against itself before a single row is written.
 *
 * Every relationship a product declares has to resolve to a category or
 * material the plan also contains. An import that wrote a product pointing at a
 * category it never created would leave the catalog with a document that maps
 * to nothing, and the storefront would silently drop it.
 *
 * Cheap, and it runs first, so a broken import fails before it has half-written
 * the catalog.
 */
export function validatePlan(): PlanProblem[] {
  const problems: PlanProblem[] = [];

  const categories = new Set(planCategories().map((row) => row.value));
  const materials = new Set(planMaterials().map((row) => row.value));
  const browse = new Set(
    planCategories().filter((row) => row.isBrowse).map((row) => row.value),
  );

  const seenIds = new Set<string>();
  const seenSlugs = new Set<string>();

  for (const product of planProducts()) {
    if (seenIds.has(product.productId)) {
      problems.push({
        subject: product.productId,
        reason: "Two products share this identifier.",
      });
    }
    seenIds.add(product.productId);

    if (seenSlugs.has(product.slug)) {
      problems.push({ subject: product.slug, reason: "Two products share this slug." });
    }
    seenSlugs.add(product.slug);

    if (!categories.has(product.category)) {
      problems.push({
        subject: product.productId,
        reason: `Category "${product.category}" is not in the taxonomy.`,
      });
    }

    if (!browse.has(product.browseCategory)) {
      problems.push({
        subject: product.productId,
        reason: `"${product.browseCategory}" is not a browse category.`,
      });
    }

    for (const material of product.materials) {
      if (!materials.has(material)) {
        problems.push({
          subject: product.productId,
          reason: `Material "${material}" is not a known material.`,
        });
      }
    }
  }

  for (const category of planCategories()) {
    if (category.parent && !categories.has(category.parent)) {
      problems.push({
        subject: category.value,
        reason: `Parent "${category.parent}" is not in the taxonomy.`,
      });
    }
  }

  return problems;
}
