import type { Payload } from "payload";

import {
  planCategories,
  planMaterials,
  planProducts,
  validatePlan,
  type PlanProblem,
} from "./plan";

/**
 * The catalog import.
 *
 * Local typed content → Payload. Three properties make it safe to run against a
 * database that already has content:
 *
 *   DETERMINISTIC   nothing is generated. Categories key on `value`, materials
 *                   on `value`, products on `productId` — the same identifiers
 *                   the storefront, carts and past orders already use. Running
 *                   it twice cannot mint a second "p-001".
 *
 *   IDEMPOTENT      every write is find-then-update-or-create against that key.
 *                   The second run updates the rows the first run created and
 *                   the catalog is identical either way.
 *
 *   VALIDATED       the plan is checked against itself before the first write,
 *                   so an import cannot get halfway through and leave products
 *                   pointing at categories it never created.
 *
 * ── What it does not do ──────────────────────────────────────────────────
 *
 * It never deletes. A document in Payload that the local content no longer
 * describes is left alone and reported, because deleting a product is how
 * carts, saved items and order history lose what they refer to. Withdrawing a
 * part is unpublishing it, which is a decision for an operator.
 */

export interface ImportSummary {
  categories: { created: number; updated: number };
  materials: { created: number; updated: number };
  products: { created: number; updated: number };
  /** Documents in Payload the local content does not describe. Never deleted. */
  unknown: string[];
  problems: PlanProblem[];
}

type Counts = { created: number; updated: number };

type ContentCollection = "categories" | "materials" | "products";

/**
 * Find-or-create against a unique field.
 *
 * The lookup uses `overrideAccess: true` deliberately — an import runs as an
 * operator, and a draft it created on a previous run must be found rather than
 * duplicated because a public read would not have seen it.
 *
 * The data is cast once, here. Payload's generated create/update types are a
 * union across the three collections and cannot be narrowed by a runtime slug;
 * casting at this single boundary is better than three near-identical copies of
 * this function. What actually guarantees the shape is `validatePlan`, which
 * runs before any of this and refuses an import whose rows do not resolve.
 */
async function upsert(
  payload: Payload,
  collection: ContentCollection,
  field: string,
  value: string,
  data: Record<string, unknown>,
  counts: Counts,
): Promise<number> {
  const existing = await payload.find({
    collection,
    where: { [field]: { equals: value } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    // Drafts too: a row half-created by an interrupted run is still that row.
    draft: true,
  });

  const found = existing.docs[0];

  if (found) {
    const updated = await payload.update({
      collection,
      id: found.id,
      data: data as never,
      overrideAccess: true,
    });
    counts.updated += 1;
    return updated.id as number;
  }

  const created = await payload.create({
    collection,
    data: data as never,
    overrideAccess: true,
  });
  counts.created += 1;
  return created.id as number;
}

export async function importContent(payload: Payload): Promise<ImportSummary> {
  const problems = validatePlan();
  if (problems.length > 0) {
    // Nothing is written. A plan that does not hold together is not an import.
    return {
      categories: { created: 0, updated: 0 },
      materials: { created: 0, updated: 0 },
      products: { created: 0, updated: 0 },
      unknown: [],
      problems,
    };
  }

  const categories: Counts = { created: 0, updated: 0 };
  const materials: Counts = { created: 0, updated: 0 };
  const products: Counts = { created: 0, updated: 0 };

  /* ---- categories, parents first ---- */

  const categoryIds = new Map<string, number>();

  for (const row of planCategories()) {
    const id = await upsert(
      payload,
      "categories",
      "value",
      row.value,
      {
        value: row.value,
        name: row.name,
        // The plan is ordered breadth-first, so the parent is already in the map.
        parent: row.parent ? (categoryIds.get(row.parent) ?? null) : null,
        isBrowse: row.isBrowse,
        browseOrder: row.browseOrder,
        _status: "published",
      },
      categories,
    );

    categoryIds.set(row.value, id);
  }

  /* ---- materials ---- */

  const materialIds = new Map<string, number>();

  for (const row of planMaterials()) {
    const id = await upsert(
      payload,
      "materials",
      "value",
      row.value,
      {
        value: row.value,
        name: row.name,
        code: row.code,
        description: row.description,
        properties: row.properties,
        applications: row.applications.map((value) => ({ value })),
        surface: row.surface,
        swatches: row.swatches.map((hex) => ({ hex })),
        _status: "published",
      },
      materials,
    );

    materialIds.set(row.value, id);
  }

  /* ---- products ---- */

  for (const row of planProducts()) {
    const category = categoryIds.get(row.category);
    const browseCategory = categoryIds.get(row.browseCategory);
    const material = materialIds.get(row.material);

    // validatePlan already proved these resolve; this is the belt to its braces.
    if (!category || !browseCategory || !material) {
      problems.push({
        subject: row.productId,
        reason: "A relationship did not resolve during import.",
      });
      continue;
    }

    await upsert(
      payload,
      "products",
      "productId",
      row.productId,
      {
        productId: row.productId,
        slug: row.slug,
        name: row.name,
        summary: row.summary,
        description: row.description,
        applications: row.applications.map((value) => ({ value })),
        price: row.price,
        currency: row.currency,
        availability: row.availability,
        badge: row.badge,
        category,
        browseCategory,
        material,
        materials: row.materials
          .map((value) => materialIds.get(value))
          .filter((id): id is number => id !== undefined),
        technology: row.technology,
        color: row.color,
        colors: row.colors.map((value) => ({ value })),
        qualityOptions: row.qualityOptions,
        specifications: row.specifications,
        materialNotes: row.materialNotes.map((value) => ({ value })),
        model: row.model,
        _status: "published",
      },
      products,
    );
  }

  /* ---- anything the local content does not describe ---- */

  const known = new Set(planProducts().map((row) => row.productId));

  const stored = await payload.find({
    collection: "products",
    limit: 1000,
    depth: 0,
    overrideAccess: true,
    draft: true,
  });

  const unknown = stored.docs
    .map((doc) => doc.productId)
    .filter((productId): productId is string => typeof productId === "string")
    .filter((productId) => !known.has(productId));

  return { categories, materials, products, unknown, problems };
}
