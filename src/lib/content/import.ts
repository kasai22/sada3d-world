import type { Payload } from "payload";

import {
  planCategories,
  planMaterials,
  planProducts,
  validatePlan,
  type PlanProblem,
  type ProductRow,
  type RowStatus,
} from "./plan";
import {
  decideStale,
  deepestFirst,
  sameContent,
  type ContentCollection,
  type ReconcileMode,
  type StaleDecision,
} from "./reconcile";

/**
 * The catalog import: canonical catalog → Payload.
 *
 *   DETERMINISTIC   nothing is generated. Categories and materials key on
 *                   `value`, products on `productId` — the stable application
 *                   identifiers. Running it twice cannot mint a second "p-101".
 *
 *   IDEMPOTENT      every write is find-then-update-or-create against that key,
 *                   and a document whose content already matches is left alone.
 *                   A second run reports everything "unchanged".
 *
 *   VALIDATED       `validatePlan` runs before the first write. Publication is
 *                   decided by `validateCatalog`, not by the import succeeding:
 *                   every row is written with the status the plan gave it.
 *
 *   RECONCILING     content Payload holds and the canonical catalog does not is
 *                   unpublished (sync) or deleted when unreferenced (reset). See
 *                   `reconcile.ts`. Nothing stale stays on the storefront.
 */

export interface CollectionCounts {
  created: number;
  updated: number;
  unchanged: number;
  published: number;
  drafts: number;
  deleted: number;
  unpublished: number;
}

export interface ImportSummary {
  mode: ReconcileMode;
  categories: CollectionCounts;
  materials: CollectionCounts;
  products: CollectionCounts;
  /** Every stale document and what was done with it. */
  stale: StaleDecision[];
  /** Price approval records created. Never updated or deleted. */
  priceApprovalsCreated: number;
  /** Administrator-managed products: never written, never unpublished, never deleted by the import. */
  adminManaged: string[];
  /** Stage 20: administrator-managed categories, likewise never written or withdrawn. */
  adminManagedCategories: string[];
  problems: PlanProblem[];
}

/** Where a product id may be held by customer or transactional data. */
export interface TransactionalReferences {
  /** product id → human-readable references, e.g. "saved_items ×2". */
  productReferences(productIds: readonly string[]): Promise<Map<string, string[]>>;
}

function counts(): CollectionCounts {
  return { created: 0, updated: 0, unchanged: 0, published: 0, drafts: 0, deleted: 0, unpublished: 0 };
}

type Doc = Record<string, unknown> & { id: number; _status?: string };

async function findAll(payload: Payload, collection: ContentCollection): Promise<Doc[]> {
  const result = await payload.find({
    collection,
    depth: 0,
    limit: 5000,
    pagination: false,
    // An import runs as an operator: drafts must be found, not duplicated.
    overrideAccess: true,
  });
  return result.docs as unknown as Doc[];
}

/**
 * Find-or-create against a unique field, skipping identical content.
 *
 * The data is cast once, here. Payload's generated create/update types are a
 * union across the collections and cannot be narrowed by a runtime slug; what
 * guarantees the shape is `validatePlan`, which has already run.
 */
async function upsert(
  payload: Payload,
  collection: ContentCollection,
  existing: Doc | undefined,
  data: Record<string, unknown>,
  status: RowStatus,
  tally: CollectionCounts,
): Promise<number> {
  const planned = { ...data, _status: status };
  // Marks the write as the import's own, so ownership stays "seed" (Stage 19.8).
  const context = { contentImport: true };
  tally[status === "published" ? "published" : "drafts"] += 1;

  if (existing) {
    if (sameContent(existing, planned)) {
      tally.unchanged += 1;
      return existing.id;
    }

    const updated = await payload.update({
      collection,
      id: existing.id,
      data: planned as never,
      overrideAccess: true,
      context,
    });
    tally.updated += 1;
    return updated.id as number;
  }

  const created = await payload.create({
    collection,
    data: planned as never,
    overrideAccess: true,
    context,
  });
  tally.created += 1;
  return created.id as number;
}

async function applyStale(
  payload: Payload,
  decision: StaleDecision,
  tally: CollectionCounts,
): Promise<void> {
  if (decision.action === "delete") {
    await payload.delete({ collection: decision.collection, id: decision.id, overrideAccess: true });
    tally.deleted += 1;
  } else if (decision.action === "unpublish") {
    await payload.update({
      collection: decision.collection,
      id: decision.id,
      data: { _status: "draft" } as never,
      overrideAccess: true,
    });
    tally.unpublished += 1;
  }
}

export interface ImportOptions {
  mode: ReconcileMode;
  /**
   * Required in reset mode. Deleting a product without being able to ask
   * whether a cart or saved item holds it is not a decision the import makes.
   */
  references?: TransactionalReferences;
}

export async function importContent(
  payload: Payload,
  options: ImportOptions = { mode: "sync" },
): Promise<ImportSummary> {
  const summary: ImportSummary = {
    mode: options.mode,
    categories: counts(),
    materials: counts(),
    products: counts(),
    stale: [],
    priceApprovalsCreated: 0,
    adminManaged: [],
    adminManagedCategories: [],
    problems: validatePlan(),
  };

  if (options.mode === "reset" && !options.references) {
    summary.problems.push({
      subject: "reset",
      reason: "Reset mode needs a transactional reference check, and none was supplied.",
    });
  }

  /*
   * Stage 20: a seed SKU already used by a different stored product (an
   * administrator's) would fail the unique index halfway through the import.
   * Refused here, before anything is written.
   */
  {
    const stored = await findAll(payload, "products");
    for (const row of planProducts()) {
      if (!row.sku) continue;
      const owner = stored.find((doc) => doc.sku === row.sku && String(doc.productId) !== row.productId);
      if (owner) {
        summary.problems.push({ subject: row.productId, reason: `SKU "${row.sku}" is already used by ${String(owner.productId)}.` });
      }
    }
  }

  // Nothing is written. A plan that does not hold together is not an import.
  if (summary.problems.length > 0) return summary;

  /* ---- categories, parents first ---- */

  const storedCategories = await findAll(payload, "categories");
  const categoryIds = new Map<string, number>();

  for (const row of planCategories()) {
    const existingCategory = storedCategories.find((doc) => doc.value === row.value);
    // Stage 20: a category an operator has saved is the business's record — never overwritten.
    if (existingCategory?.source === "admin") {
      categoryIds.set(row.value, existingCategory.id);
      summary.adminManagedCategories.push(row.value);
      continue;
    }
    const id = await upsert(
      payload,
      "categories",
      existingCategory,
      {
        value: row.value,
        name: row.name,
        description: row.description,
        // Breadth-first plan: the parent is already in the map.
        parent: row.parent ? (categoryIds.get(row.parent) ?? null) : null,
        isBrowse: row.isBrowse,
        browseOrder: row.browseOrder,
        source: "seed",
      },
      row.status,
      summary.categories,
    );
    categoryIds.set(row.value, id);
  }

  /* ---- materials ---- */

  const storedMaterials = await findAll(payload, "materials");
  const materialIds = new Map<string, number>();

  for (const row of planMaterials()) {
    const id = await upsert(
      payload,
      "materials",
      storedMaterials.find((doc) => doc.value === row.value),
      {
        value: row.value,
        name: row.name,
        code: row.code,
        description: row.description,
        properties: row.properties,
        technologies: row.technologies,
        applications: row.applications.map((value) => ({ value })),
        bestFor: row.bestFor.map((value) => ({ value })),
        avoidFor: row.avoidFor.map((value) => ({ value })),
        surface: row.surface,
        swatches: row.swatches.map((hex) => ({ hex })),
        seo: row.seo,
      },
      row.status,
      summary.materials,
    );
    materialIds.set(row.value, id);
  }

  /* ---- products ---- */

  const storedProducts = await findAll(payload, "products");
  const storedApprovals = (
    await payload.find({ collection: "price-approvals", depth: 0, pagination: false, overrideAccess: true })
  ).docs as unknown as Doc[];

  /*
   * Price approvals are append-only: a canonical record missing from Payload is
   * created, and a Payload record the canonical catalog does not list is never
   * deleted — `content:verify` reports it instead. Approvals are synced before a
   * product is saved as "approved", because the save is refused until an
   * approval matching the price is in effect.
   */
  const syncApprovals = async (productDocId: number, row: ProductRow) => {
    for (const record of row.priceApprovals) {
      const exists = storedApprovals.some(
        (doc) =>
          doc.product === productDocId &&
          doc.amount === record.amount &&
          String(doc.effectiveFrom).slice(0, 10) === record.effectiveFrom &&
          doc.reference === record.reference,
      );
      if (exists) continue;
      await payload.create({
        collection: "price-approvals",
        data: { ...record, product: productDocId, effectiveFrom: `${record.effectiveFrom}T00:00:00.000Z` } as never,
        overrideAccess: true,
      });
      summary.priceApprovalsCreated += 1;
    }
  };

  for (const row of planProducts()) {
    const category = categoryIds.get(row.category);
    const browseCategory = categoryIds.get(row.browseCategory);
    const material = materialIds.get(row.material);

    // validatePlan already proved these resolve; this is the belt to its braces.
    if (!category || !browseCategory || !material) {
      summary.problems.push({ subject: row.productId, reason: "A relationship did not resolve during import." });
      continue;
    }

    const existingProduct = storedProducts.find((doc) => doc.productId === row.productId);

    /*
     * Stage 19.8: an administrator-managed product is the business's record. The
     * import never overwrites it — even a product that began as a seed stops
     * being synced the moment an operator saves it.
     */
    if (existingProduct?.source === "admin") continue;

    if (existingProduct) await syncApprovals(existingProduct.id, row);

    /*
     * Approval is written as a second step. The approval guard refuses an
     * approval whose prerequisites are not already in the record, so the record
     * is completed first and approved after.
     */
    const approveAfter = row.approvalStatus === "approved" && existingProduct?.approvalStatus !== "approved";

    // A new product cannot be created "approved": its approvals need its id.
    const createFirstAsProvisional = !existingProduct && row.priceStatus === "approved";

    const productId = await upsert(
      payload,
      "products",
      existingProduct,
      {
        productId: row.productId,
        slug: row.slug,
        name: row.name,
        summary: row.summary,
        // Optional fields are written as null when absent, so a value removed
        // from the canonical catalog is removed from the CMS too.
        description: row.description ?? null,
        applications: row.applications.map((value) => ({ value })),
        price: row.price,
        priceStatus: createFirstAsProvisional ? "provisional" : row.priceStatus,
        approvalStatus: approveAfter ? "provisional" : row.approvalStatus,
        approval: row.approval ?? { reference: null, approvedBy: null, approvedOn: null },
        featured: row.featured,
        visual: row.visual
          ? { ...row.visual, approval: row.visualApproval ?? { reference: null, approvedBy: null, approvedOn: null } }
          : { src: null, alt: null, kind: null, approval: { reference: null, approvedBy: null, approvedOn: null } },
        source: "seed",
        sku: row.sku,
        productClass: row.productClass,
        pricingModel: row.pricingModel,
        customers: row.customers.map((value) => ({ value })),
        useCase: row.useCase,
        visualRequirement: row.visualRequirement,
        renderSpecification: row.renderSpecification,
        weightGrams: row.weightGrams,
        commercialApproval: row.commercialApproval ?? { reference: null, approvedBy: null, approvedOn: null },
        openQuestions: row.openQuestions,
        currency: row.currency,
        availability: row.availability,
        badge: row.badge ?? null,
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
        model: row.model ?? { url: null, format: null },
        seo: { title: row.seo.title, description: row.seo.description },
      },
      row.status,
      summary.products,
    );

    if (createFirstAsProvisional) {
      await syncApprovals(productId, row);
      await payload.update({
        collection: "products",
        id: productId,
        data: { priceStatus: "approved" } as never,
        overrideAccess: true,
        context: { contentImport: true },
      });
    }

    if (approveAfter) {
      // Refused by the approval guard, with every reason, if a prerequisite is missing.
      await payload.update({
        collection: "products",
        id: productId,
        data: { approvalStatus: "approved" } as never,
        overrideAccess: true,
        context: { contentImport: true },
      });
    }
  }

  summary.adminManaged = storedProducts
    .filter((doc) => doc.source === "admin")
    .map((doc) => String(doc.productId));

  /* ---- stale products ---- */

  const plannedProducts = new Set(planProducts().map((row) => row.productId));
  // Only seed products can be stale: an administrator-managed product is not the import's to withdraw.
  const staleProducts = storedProducts.filter(
    (doc) => doc.source !== "admin" && !plannedProducts.has(String(doc.productId)),
  );

  const productRefs =
    options.mode === "reset" && staleProducts.length > 0 && options.references
      ? await options.references.productReferences(staleProducts.map((doc) => String(doc.productId)))
      : new Map<string, string[]>();

  for (const doc of staleProducts) {
    // A price approval is an audit record; the product it approves is not deleted.
    const approvalRefs = storedApprovals.filter((approval) => approval.product === doc.id).length;
    const decision = decideStale(
      { collection: "products", key: String(doc.productId), id: doc.id, status: statusOf(doc) },
      options.mode,
      [
        ...(productRefs.get(String(doc.productId)) ?? []),
        ...(approvalRefs > 0 ? [`price_approvals ×${approvalRefs}`] : []),
      ],
    );
    await applyStale(payload, decision, summary.products);
    summary.stale.push(decision);
  }

  /* ---- stale categories, deepest first ---- */

  const remainingProducts = await findAll(payload, "products");
  const plannedCategories = new Set(planCategories().map((row) => row.value));
  const storedCategoryDocs = await findAll(payload, "categories");
  const categories = storedCategoryDocs.map((doc) => ({
    id: doc.id,
    value: String(doc.value),
    _status: doc._status,
    parent: typeof doc.parent === "number" ? doc.parent : null,
    source: doc.source,
  }));
  for (const doc of storedCategoryDocs) {
    if (doc.source === "admin" && !summary.adminManagedCategories.includes(String(doc.value))) {
      summary.adminManagedCategories.push(String(doc.value));
    }
  }
  const deletedCategories = new Set<number>();

  for (const doc of deepestFirst(
    // Only seed categories can be stale: an administrator's category is not the import's to withdraw.
    categories.filter((category) => category.source !== "admin" && !plannedCategories.has(String(category.value))),
    categories,
  )) {
    const referencedBy = [
      ...remainingProducts
        .filter((product) => product.category === doc.id || product.browseCategory === doc.id)
        .map((product) => `product ${String(product.productId)}`),
      ...categories
        .filter((child) => child.parent === doc.id && !deletedCategories.has(child.id))
        .map((child) => `category ${String(child.value)}`),
    ];

    const decision = decideStale(
      { collection: "categories", key: String(doc.value), id: doc.id, status: statusOf(doc) },
      options.mode,
      referencedBy,
    );
    await applyStale(payload, decision, summary.categories);
    if (decision.action === "delete") deletedCategories.add(doc.id);
    summary.stale.push(decision);
  }

  /* ---- stale materials ---- */

  const plannedMaterials = new Set(planMaterials().map((row) => row.value));

  for (const doc of (await findAll(payload, "materials")).filter(
    (material) => !plannedMaterials.has(String(material.value)),
  )) {
    const referencedBy = remainingProducts
      .filter(
        (product) =>
          product.material === doc.id ||
          (Array.isArray(product.materials) && product.materials.includes(doc.id)),
      )
      .map((product) => `product ${String(product.productId)}`);

    const decision = decideStale(
      { collection: "materials", key: String(doc.value), id: doc.id, status: statusOf(doc) },
      options.mode,
      referencedBy,
    );
    await applyStale(payload, decision, summary.materials);
    summary.stale.push(decision);
  }

  return summary;
}

function statusOf(doc: Doc): "published" | "draft" {
  return doc._status === "published" ? "published" : "draft";
}

/**
 * The reference check against the application's own tables.
 *
 * Read through Payload's connection pool — same database, one connection — and
 * deliberately raw SQL over the two places a product id can live, rather than
 * through the cart and account repositories, which answer per customer.
 *
 * A failure here throws. A reset that cannot establish whether a product is
 * referenced must not proceed to delete it.
 */
export function payloadTransactionalReferences(payload: Payload): TransactionalReferences {
  return {
    async productReferences(productIds) {
      const references = new Map<string, string[]>();
      if (productIds.length === 0) return references;

      const pool = (payload.db as unknown as {
        pool: { query(text: string, values: unknown[]): Promise<{ rows: { id: string; n: number }[] }> };
      }).pool;

      const add = (rows: { id: string; n: number }[], label: string) => {
        for (const row of rows) {
          references.set(row.id, [...(references.get(row.id) ?? []), `${label} ×${row.n}`]);
        }
      };

      const ids = [...productIds];

      add(
        (
          await pool.query(
            "select product_id as id, count(*)::int as n from saved_items where product_id = any($1) group by product_id",
            [ids],
          )
        ).rows,
        "saved_items",
      );

      add(
        (
          await pool.query(
            "select line->>'productId' as id, count(*)::int as n from customer_carts, jsonb_array_elements(lines) as line where line->>'productId' = any($1) group by 1",
            [ids],
          )
        ).rows,
        "customer_carts",
      );

      return references;
    },
  };
}
